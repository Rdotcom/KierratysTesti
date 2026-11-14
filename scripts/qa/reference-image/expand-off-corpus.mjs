// Metadata-only, fixed-source expansion. No images, decode, fit or predictions.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkedOutput,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { INITIAL_PRODUCT_CODES } from "./prepare-off-candidates.mjs";

const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const priorFile = "scripts/qa/reference-image/off-initial-selection.json";
const priorSha256 = "904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8";
const ledger = "work/off-expansion-metadata-v1-attempt.json";
export const OFF_EXPANSION_POLICY = Object.freeze({
  apiRequests: 5,
  maximumResponseBytes: 524288,
  timeoutMs: 15000,
  maximumOriginals: 1024,
  maximumNewFamiliesPerProduct: 6,
  sameUploaderMaximumGapSeconds: 86400,
  minimumFamiliesForPlan: 3,
  imagesDownloaded: 0,
  modelCalls: 0,
  integrationAllowed: false,
});
const fields = "code,product_name,brands,quantity,images,last_modified_t";
const plain = (x) =>
  x !== null &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  [null, Object.prototype].includes(Object.getPrototypeOf(x));
const clean = (x, max = 200) =>
  typeof x === "string" &&
  x.length > 0 &&
  x.length <= max &&
  x.trim() === x &&
  !/[\p{Cc}\p{Cf}]/u.test(x);
const uploader = (x) => clean(x, 160) && /^[a-z0-9][a-z0-9._-]*$/iu.test(x);
function checkedDate(value) {
  assert.ok(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value));
  const date = new Date(`${value}T00:00:00Z`);
  assert.ok(
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value,
    "invalid_access_date",
  );
  return Date.parse(`${value}T23:59:59.999Z`) / 1000;
}

/** Conservative metadata proxy, not proof of a distinct capture. Adjacent
 * uploads by the same contributor within24h stay together transitively. */
export function groupOffUploadFamilies(code, originals, previouslySeenIds, previous = []) {
  assert.ok(INITIAL_PRODUCT_CODES.includes(code));
  const byUploader = new Map();
  for (const row of originals) {
    const list = byUploader.get(row.uploader) ?? [];
    list.push(row);
    byUploader.set(row.uploader, list);
  }
  const families = [];
  for (const [author, rows] of [...byUploader.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rows.sort((a, b) => a.uploadedAt - b.uploadedAt || Number(a.originalId) - Number(b.originalId));
    let cluster = [];
    const finish = () => {
      if (!cluster.length) return;
      const ids = cluster.map((r) => r.originalId);
      families.push({
        familyId: `off-${code}-batch-${sha(JSON.stringify([author, ids])).slice(0, 20)}`,
        authorCredit: `${author} / Open Food Facts`,
        originalIds: ids,
        firstUploadedAt: cluster[0].uploadedAt,
        lastUploadedAt: cluster.at(-1).uploadedAt,
        previouslySeenFamily:
          ids.some((id) => previouslySeenIds.has(id)) ||
          previous.some((row) => {
            if (row.authorCredit !== `${author} / Open Food Facts`) return false;
            const day = Date.parse(`${row.uploadedOn}T00:00:00Z`) / 1000;
            return (
              Number.isFinite(day) &&
              cluster[0].uploadedAt <= day + 2 * 86400 &&
              cluster.at(-1).uploadedAt >= day - 86400
            );
          }),
        captureIndependence: "unverified_metadata_batch_proxy",
        originals: cluster,
      });
    };
    for (const row of rows) {
      if (
        cluster.length &&
        row.uploadedAt - cluster.at(-1).uploadedAt >
          OFF_EXPANSION_POLICY.sameUploaderMaximumGapSeconds
      ) {
        finish();
        cluster = [];
      }
      cluster.push(row);
    }
    finish();
  }
  return families.sort(
    (a, b) => b.firstUploadedAt - a.firstUploadedAt || a.familyId.localeCompare(b.familyId),
  );
}

export function planOffExpansion(code, response, snapshotSha256, accessedOn, previous) {
  const latest = checkedDate(accessedOn);
  assert.ok(INITIAL_PRODUCT_CODES.includes(code) && previous.gtin === code);
  assert.match(snapshotSha256, /^[a-f0-9]{64}$/u);
  if (!plain(response) || response.status !== 1 || !plain(response.product))
    return {
      productId: `off-${code}`,
      gtin: code,
      status: "unavailable",
      reason: "source_product_unavailable",
      candidateImages: [],
    };
  const p = response.product;
  assert.ok(
    p.code === code &&
      clean(p.product_name) &&
      clean(p.brands, 240) &&
      clean(p.quantity) &&
      plain(p.images),
    "invalid_product",
  );
  const entries = Object.entries(p.images);
  assert.ok(entries.length <= OFF_EXPANSION_POLICY.maximumOriginals, "source_image_bound");
  const roles = new Map();
  for (const [key, value] of entries.filter(([k]) =>
    /^(?:front|ingredients|nutrition|packaging)_[a-z]{2}$/u.test(k),
  )) {
    assert.ok(
      plain(value) && /^[1-9]\d{0,5}$/u.test(String(value.imgid)),
      "invalid_selected_parent",
    );
    const id = String(value.imgid);
    roles.set(id, [...(roles.get(id) ?? []), key]);
  }
  const originals = [],
    rejected = [];
  for (const [id, value] of entries.filter(([key]) => /^[1-9]\d{0,5}$/u.test(key))) {
    const epoch = plain(value) ? value.uploaded_t : undefined;
    const size = plain(value) && plain(value.sizes) ? value.sizes["400"] : undefined;
    let reason = null;
    if (!plain(value) || !uploader(value.uploader)) reason = "missing_or_unsafe_attribution";
    else if (
      !["number", "string"].includes(typeof epoch) ||
      !/^\d{1,12}$/u.test(String(epoch)) ||
      Number(epoch) <= 0 ||
      Number(epoch) > latest
    )
      reason = "invalid_upload_timestamp";
    else if (
      !plain(size) ||
      ![size.w, size.h].every((n) => Number.isInteger(n) && n >= 32 && n <= 4096) ||
      Math.max(size.w, size.h) !== 400
    )
      reason = "missing_or_invalid_400px_size";
    if (reason) {
      rejected.push({ originalId: id, reason });
      continue;
    }
    originals.push({
      originalId: id,
      uploader: value.uploader,
      uploadedAt: Number(epoch),
      width: size.w,
      height: size.h,
      selectedRoles: (roles.get(id) ?? []).sort(),
      viewStatus: (roles.get(id) ?? []).some((r) => r.startsWith("front_"))
        ? "source_selected_front_unverified"
        : "unclassified_original_requires_visual_check",
    });
  }
  // Every current selected parent must actually exist; no orphan/language crop
  // is silently counted as another photograph.
  for (const id of roles.keys()) assert.ok(plain(p.images[id]), "orphan_selected_parent");
  const priorIds = new Set(previous.images.map((r) => r.originalId));
  const families = groupOffUploadFamilies(code, originals, priorIds, previous.images);
  const eligible = families.filter((f) => !f.previouslySeenFamily);
  const candidateFamilies = eligible.slice(0, OFF_EXPANSION_POLICY.maximumNewFamiliesPerProduct);
  const folder = code.replace(/^(...)(...)(...)(.*)$/u, "$1/$2/$3/$4");
  const candidateImages = candidateFamilies.map((family, index) => {
    // Deterministic before pixel inspection: prefer a source-selected front,
    // otherwise the first numeric upload in the batch. Never model-score rank.
    const image = [...family.originals].sort(
      (a, b) =>
        Number(b.viewStatus.startsWith("source_selected")) -
          Number(a.viewStatus.startsWith("source_selected")) ||
        Number(a.originalId) - Number(b.originalId),
    )[0];
    return {
      originalId: image.originalId,
      imageUrl: `https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/${folder}/${image.originalId}.400.jpg`,
      familyId: family.familyId,
      authorCredit: family.authorCredit,
      uploadedOn: new Date(image.uploadedAt * 1000).toISOString().slice(0, 10),
      width: image.width,
      height: image.height,
      selectedRoles: image.selectedRoles,
      viewStatus: image.viewStatus,
      proposedRole:
        index < 2
          ? "reference_candidate"
          : index === 2
            ? "evaluation_candidate"
            : "reserve_not_auto_substitute",
      identityStatus: "source_asserted_unverified",
      privacyStatus: "not_yet_observed",
      captureIndependence: "unverified_metadata_batch_proxy",
    };
  });
  const metadataChanged = [
    "sourceReportedName",
    "sourceReportedBrands",
    "sourceReportedQuantity",
  ].filter(
    (key) =>
      previous[key] !==
      {
        sourceReportedName: p.product_name,
        sourceReportedBrands: p.brands,
        sourceReportedQuantity: p.quantity,
      }[key],
  );
  return {
    productId: `off-${code}`,
    gtin: code,
    sourceReportedName: p.product_name,
    sourceReportedBrands: p.brands,
    sourceReportedQuantity: p.quantity,
    sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
    snapshotSha256,
    accessedOn,
    status: candidateFamilies.length >= 3 ? "pending_image_review" : "insufficient_unseen_families",
    metadataChanged,
    numericOriginals: entries.filter(([id]) => /^[1-9]\d{0,5}$/u.test(id)).length,
    validOriginals: originals.length,
    rejectedOriginals: rejected,
    metadataFamilies: families.length,
    previouslySeenFamilies: families.filter((f) => f.previouslySeenFamily).length,
    unseenFamilies: eligible.length,
    families,
    candidateImages,
    independentlyVerifiedImages: 0,
    integrationAllowed: false,
  };
}

async function boundedMetadata(fetcher, url) {
  const signal = AbortSignal.timeout(OFF_EXPANSION_POLICY.timeoutMs);
  let reader;
  try {
    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "KierratysAppi/0.1 (bounded corpus research; https://github.com/roopeaal/KierratysAppi)",
      },
      redirect: "error",
      signal,
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      return { status: "unavailable", reason: "http_error", httpStatus: response.status };
    }
    if (
      response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      await response.body?.cancel().catch(() => {});
      return { status: "unavailable", reason: "response_type", httpStatus: response.status };
    }
    const declared = response.headers.get("content-length");
    if (
      declared &&
      (!/^\d+$/u.test(declared) || Number(declared) > OFF_EXPANSION_POLICY.maximumResponseBytes)
    ) {
      await response.body?.cancel().catch(() => {});
      return { status: "unavailable", reason: "response_bound", httpStatus: 200 };
    }
    assert.ok(response.body);
    reader = response.body.getReader();
    const chunks = [];
    let count = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > OFF_EXPANSION_POLICY.maximumResponseBytes)
        return { status: "unavailable", reason: "response_bound", httpStatus: 200 };
      chunks.push(value);
    }
    if (declared && Number(declared) !== count)
      return { status: "unavailable", reason: "response_length", httpStatus: 200 };
    return { status: "observed", httpStatus: 200, bytes: Buffer.concat(chunks, count) };
  } catch {
    return { status: "unavailable", reason: signal.aborted ? "timeout" : "network_error" };
  } finally {
    await reader?.cancel().catch(() => {});
  }
}

export async function expandOffMetadata(
  outputArgument,
  accessedOn,
  root = rootDefault,
  fetcher = fetch,
) {
  checkedDate(accessedOn);
  assert.ok(!fs.existsSync(path.join(root, ledger)), "expansion_metadata_already_attempted");
  const output = checkedOutput(outputArgument, root),
    previousBytes = readBounded(path.join(root, priorFile), 1_000_000);
  assert.equal(sha(previousBytes), priorSha256, "prior_selection_drift");
  const previous = JSON.parse(previousBytes);
  const sourceFiles = [
    "scripts/qa/reference-image/expand-off-corpus.mjs",
    "scripts/qa/reference-image/prepare-off-candidates.mjs",
    "scripts/__tests__/off-expansion.test.mjs",
    "docs/final/OFF_EXPANSION_PROTOCOL.md",
    "package.json",
    "pnpm-lock.yaml",
  ];
  const sourcePins = Object.fromEntries(
    sourceFiles.map((f) => [f, sha(readBounded(path.join(root, f), 2_000_000))]),
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const saved = writeJsonExclusive(
    path.join(output, "protocol.json"),
    {
      schemaVersion: "off-expansion-metadata-v1",
      policy: OFF_EXPANSION_POLICY,
      fields,
      sourcePins,
      accessedOn,
      previousFile: priorFile,
      previousSha256: priorSha256,
      productCodes: INITIAL_PRODUCT_CODES,
      imagesDownloaded: 0,
      modelCalls: 0,
      integrationAllowed: false,
    },
    root,
  );
  writeJsonExclusive(
    path.join(root, ledger),
    { protocolSha256: saved.sha256, output: path.relative(root, output) },
    root,
  );
  const products = [],
    requests = [];
  for (const code of INITIAL_PRODUCT_CODES) {
    const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    url.searchParams.set("fields", fields);
    writeJsonExclusive(
      path.join(output, `${code}-attempt.json`),
      { code, url: url.href, protocolSha256: saved.sha256 },
      root,
    );
    const fetched = await boundedMetadata(fetcher, url.href);
    if (fetched.status !== "observed") {
      requests.push({ code, ...fetched });
      products.push({
        productId: `off-${code}`,
        gtin: code,
        status: "unavailable",
        reason: fetched.reason,
        candidateImages: [],
      });
      continue;
    }
    const file = path.join(output, `${code}-response.json`);
    checkedOutput(file, root);
    fs.writeFileSync(file, fetched.bytes, { flag: "wx", mode: 0o600 });
    const digest = sha(fetched.bytes);
    requests.push({
      code,
      status: "observed",
      httpStatus: 200,
      file: path.relative(root, file),
      sha256: digest,
      bytes: fetched.bytes.length,
    });
    try {
      products.push(
        planOffExpansion(
          code,
          JSON.parse(fetched.bytes),
          digest,
          accessedOn,
          previous.products.find((p) => p.gtin === code),
        ),
      );
    } catch {
      products.push({
        productId: `off-${code}`,
        gtin: code,
        status: "unavailable",
        reason: "invalid_source_metadata",
        candidateImages: [],
      });
    }
  }
  for (const [f, digest] of Object.entries(sourcePins))
    assert.equal(sha(readBounded(path.join(root, f), 2_000_000)), digest, "source_drift");
  const result = writeJsonExclusive(
    path.join(output, "plan.json"),
    {
      schemaVersion: "off-corpus-expansion-plan-v1",
      protocolSha256: saved.sha256,
      accessedOn,
      requests,
      products,
      sourceGrain: "product_gtin_original_upload_not_capture",
      licences: {
        database: "ODbL-1.0",
        contents: "DbCL-1.0",
        images: "CC-BY-SA-3.0",
        otherRightsNotGranted: true,
      },
      metadataRetention:
        "Public contributor handles retained solely for attribution and leakage audit while this corpus is retained; no personal contact data collected intentionally.",
      imagesDownloaded: 0,
      modelCalls: 0,
      independentAccuracyEstablished: false,
      integrationAllowed: false,
    },
    root,
  );
  return {
    protocolSha256: saved.sha256,
    plan: path.relative(root, result.path),
    planSha256: result.sha256,
    products: products.map((p) => ({
      gtin: p.gtin,
      status: p.status,
      candidateImages: p.candidateImages.length,
    })),
    requests: requests.length,
    imagesDownloaded: 0,
    modelCalls: 0,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 5, "use --run work/new-output YYYY-MM-DD");
  assert.equal(process.argv[2], "--run");
  process.stdout.write(
    `${JSON.stringify(await expandOffMetadata(process.argv[3], process.argv[4]))}\n`,
  );
}
