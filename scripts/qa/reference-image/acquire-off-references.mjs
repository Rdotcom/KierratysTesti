import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { createNodeReferencePorts, NODE_REFERENCE_DECODE_POLICY } from "./node-runtime-ports.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";
import { INITIAL_PRODUCT_CODES } from "./prepare-off-candidates.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const selectionFile = "scripts/qa/reference-image/off-initial-selection.json";
const selectionSha256 = "904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8";
const ledger = "work/off-reference-acquisition-v1-attempt.json";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const date = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const text = (value, maximum = 256) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  value.trim() === value &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
export const OFF_ACQUISITION_POLICY = Object.freeze({
  version: "off-reference-acquisition-v1",
  maximumRequests: 21,
  maximumImageBytes: 2 * 1024 * 1024,
  maximumTotalBytes: 16 * 1024 * 1024,
  timeoutMs: 15000,
  maximumReviewBytes: 4 * 1024 * 1024,
  reviewTransform: "decoded-srgb-white-orientation-baked-metadata-free-png-v1",
  integrationAllowed: false,
  automaticAcceptance: false,
});
function exact(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

/** Serialized JSON is bounded before parse; no caller objects/getters are read. */
export function parseSelection(serialized) {
  assert.ok(
    typeof serialized === "string" && Buffer.byteLength(serialized) <= 65536,
    "selection_bound",
  );
  const input = JSON.parse(serialized);
  assert.ok(
    exact(input, [
      "schemaVersion",
      "purpose",
      "integrationAllowed",
      "humanAccepted",
      "imagesDownloaded",
      "featureExtractions",
      "dataLicense",
      "contentsLicense",
      "proposedImageLicense",
      "attribution",
      "licensingSource",
      "imageAcquisitionSource",
      "accessedOn",
      "products",
    ]),
    "selection_fields",
  );
  assert.ok(
    input.schemaVersion === "off-product-selection-v1" &&
      input.purpose === "unreviewed_reference_acquisition_plan" &&
      input.integrationAllowed === false &&
      input.humanAccepted === false &&
      input.imagesDownloaded === 0 &&
      input.featureExtractions === 0,
    "selection_scope",
  );
  assert.ok(
    input.dataLicense === "ODbL-1.0" &&
      input.contentsLicense === "DbCL-1.0" &&
      input.proposedImageLicense === "CC-BY-SA-3.0" &&
      date(input.accessedOn),
    "selection_licence",
  );
  assert.ok(
    text(input.attribution) &&
      input.licensingSource ===
        "https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/" &&
      input.imageAcquisitionSource ===
        "https://openfoodfacts.github.io/openfoodfacts-server/api/aws-images-dataset/",
    "selection_sources",
  );
  assert.ok(Array.isArray(input.products) && input.products.length === 5, "product_count");
  const entries = [],
    seen = new Set();
  input.products.forEach((product, index) => {
    assert.ok(
      exact(product, [
        "productId",
        "gtin",
        "sourceReportedName",
        "sourceReportedBrands",
        "sourceReportedQuantity",
        "sourceUrl",
        "responseSha256",
        "accessedOn",
        "identityReview",
        "images",
      ]),
      "product_fields",
    );
    assert.ok(
      product.gtin === INITIAL_PRODUCT_CODES[index] &&
        product.productId === `off-${product.gtin}` &&
        product.sourceUrl === `https://world.openfoodfacts.org/product/${product.gtin}` &&
        hashPattern.test(product.responseSha256),
      "product_identity",
    );
    assert.ok(
      text(product.sourceReportedName, 160) &&
        text(product.sourceReportedBrands, 240) &&
        text(product.sourceReportedQuantity, 160) &&
        product.identityReview === "pending" &&
        product.accessedOn === input.accessedOn,
      "product_review",
    );
    assert.ok(
      Array.isArray(product.images) && product.images.length > 0 && product.images.length <= 9,
      "image_count",
    );
    for (const image of product.images) {
      assert.ok(
        exact(image, [
          "originalId",
          "selectedViews",
          "sourceFamilyId",
          "authorCredit",
          "uploadedOn",
          "imageUrl",
          "identityReview",
          "rightsAndPrivacyReview",
          "captureIndependence",
          "split",
        ]),
        "image_fields",
      );
      assert.ok(
        typeof image.originalId === "string" &&
          /^[1-9]\d{0,5}$/u.test(image.originalId) &&
          image.sourceFamilyId === `${product.productId}-upload-${image.originalId}`,
        "image_identity",
      );
      const folder = product.gtin.replace(/^(...)(...)(...)(.*)$/u, "$1/$2/$3/$4");
      assert.equal(
        image.imageUrl,
        `https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/${folder}/${image.originalId}.400.jpg`,
        "image_origin",
      );
      assert.ok(
        text(image.authorCredit, 200) &&
          date(image.uploadedOn) &&
          image.uploadedOn <= input.accessedOn &&
          image.identityReview === "pending" &&
          image.rightsAndPrivacyReview === "pending" &&
          image.captureIndependence === "unverified" &&
          image.split === "unassigned",
        "image_review",
      );
      assert.ok(
        Array.isArray(image.selectedViews) &&
          image.selectedViews.length > 0 &&
          image.selectedViews.length <= 32 &&
          image.selectedViews.every(
            (view) => typeof view === "string" && /^front_[a-z]{2}$/u.test(view),
          ) &&
          new Set(image.selectedViews).size === image.selectedViews.length,
        "selected_views",
      );
      assert.ok(!seen.has(image.imageUrl), "duplicate_upload");
      seen.add(image.imageUrl);
      entries.push({
        productId: product.productId,
        sourceReportedName: product.sourceReportedName,
        sourceReportedQuantity: product.sourceReportedQuantity,
        gtin: product.gtin,
        productSourceUrl: product.sourceUrl,
        ...image,
      });
    }
  });
  assert.equal(entries.length, OFF_ACQUISITION_POLICY.maximumRequests, "exact_request_plan");
  // Opaque IDs/order do not leak source names/GTINs in review-page text or paths.
  entries.sort((a, b) => sha(a.sourceFamilyId).localeCompare(sha(b.sourceFamilyId), "en"));
  return entries.map((entry, index) => ({
    blindId: `case-${String(index + 1).padStart(3, "0")}`,
    ...entry,
  }));
}

export async function fetchImage(entry, fetcher, remainingBytes) {
  assert.ok(
    INITIAL_PRODUCT_CODES.includes(entry.gtin) &&
      typeof entry.originalId === "string" &&
      /^[1-9]\d{0,5}$/u.test(entry.originalId),
    "request_identity",
  );
  const folder = entry.gtin.replace(/^(...)(...)(...)(.*)$/u, "$1/$2/$3/$4");
  assert.equal(
    entry.imageUrl,
    `https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/${folder}/${entry.originalId}.400.jpg`,
    "request_origin",
  );
  assert.ok(
    Number.isSafeInteger(remainingBytes) &&
      remainingBytes > 0 &&
      remainingBytes <= OFF_ACQUISITION_POLICY.maximumTotalBytes,
    "request_budget",
  );
  const signal = AbortSignal.timeout(OFF_ACQUISITION_POLICY.timeoutMs);
  let reader, response;
  let length = 0;
  try {
    response = await fetcher(entry.imageUrl, {
      redirect: "error",
      signal,
      headers: {
        Accept: "image/jpeg",
        "User-Agent":
          "KierratysAppi/0.1 (bounded reference research; https://github.com/roopeaal/KierratysAppi)",
      },
    });
    if (!response.ok)
      return {
        status: "failed",
        reason: "http_error",
        httpStatus: response.status,
        bytesReceived: 0,
      };
    if (
      response.status !== 200 ||
      response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/jpeg"
    )
      return { status: "failed", reason: "response_type", bytesReceived: 0 };
    const maximum = Math.min(remainingBytes, OFF_ACQUISITION_POLICY.maximumImageBytes);
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/u.test(declared) || Number(declared) > maximum))
      return { status: "failed", reason: "response_bound", bytesReceived: 0 };
    if (!response.body) return { status: "failed", reason: "empty_response", bytesReceived: 0 };
    reader = response.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum)
        return { status: "failed", reason: "response_bound", bytesReceived: length };
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, length);
    if (declared && Number(declared) !== length)
      return { status: "failed", reason: "response_length", bytesReceived: length };
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
      return { status: "failed", reason: "image_signature", bytesReceived: length };
    return { status: "downloaded", bytes: new Uint8Array(bytes), bytesReceived: length };
  } catch {
    return {
      status: "failed",
      reason: signal.aborted ? "timeout" : "network_error",
      bytesReceived: length,
    };
  } finally {
    if (reader) await reader.cancel().catch(() => {});
    else if (response?.body) await response.body.cancel().catch(() => {});
  }
}

export function writeBytes(file, bytes, maximum, cwd) {
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= maximum, "output_bound");
  const target = checkedOutput(file, cwd);
  const fd = fs.openSync(
    target,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    const before = fs.fstatSync(fd);
    assert.ok(before.isFile() && before.nlink === 1, "output_type");
    fs.writeFileSync(fd, bytes);
    assert.equal(fs.realpathSync(target), target, "output_replaced");
    assert.equal(sha(readBounded(target, maximum)), sha(bytes), "output_hash");
  } finally {
    fs.closeSync(fd);
  }
}
const escaped = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function renderBlindPage(observations) {
  assert.ok(Array.isArray(observations) && observations.length <= 21, "review_rows");
  for (const row of observations) {
    assert.match(row.blindId, /^case-\d{3}$/u, "review_id");
    if (row.status === "ready")
      assert.ok(
        [row.width, row.height].every(
          (value) => Number.isInteger(value) && value >= 32 && value <= 1024,
        ),
        "review_dimensions",
      );
  }
  const sections = observations
    .map(
      (row) =>
        `<section aria-labelledby="${row.blindId}"><h2 id="${row.blindId}">${row.blindId}</h2>${row.status === "ready" ? `<img src="images/${row.blindId}.png" alt="Tuotekuva ${row.blindId}" loading="lazy" width="${row.width}" height="${row.height}">` : `<p>Kuva ei ole arvioitavissa (${escaped(row.reason)}).</p>`}</section>`,
    )
    .join("\n");
  return `<!doctype html><html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Tuotekuvien arvioinnin valmistelu</title><style>html{font:17px/1.5 system-ui;color:#182a24;background:#f7f8f5}body{max-width:1100px;margin:auto;padding:20px}a{display:inline-flex;align-items:center;min-height:44px;color:#195b45;margin-right:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:24px}section{border-top:1px solid #bbc6bf;padding:12px 0;min-width:0}img{display:block;max-width:100%;height:auto;max-height:500px;object-fit:contain}h1{font-size:1.7rem}h2{font-size:1.1rem}@media(prefers-color-scheme:dark){html{color:#eef3ee;background:#15221d}a{color:#9cddbc}section{border-color:#667b6d}}</style></head><body><header><h1>Tuotekuvien arvioinnin valmistelu</h1><p>Yksityinen valmisteluaineisto — ei hyväksytty jaettavaksi. Lähdekuvien oikeudet, yksityisyys ja arviointimenettely ovat tarkistamatta. Tämä ei ole valmis riippumaton tunnistustesti.</p><p>Kirjaa kuvasta itse havaittu nimi, koko ja mahdollinen viivakoodi tyhjään lomakkeeseen. Älä käytä tunnistinta vastauksen lähteenä. Merkitse epäselvä, jos tietoa ei näy. Tässä ei ole valmiita hyväksyttyjä vastauksia eikä lajitteluohjeita.</p><nav aria-label="Arviointilomakkeet"><a href="reviewer-a.json" download>Arvioijan A tyhjä lomake</a><a href="reviewer-b.json" download>Arvioijan B tyhjä lomake</a><a href="CREDITS.md">Aineiston lisenssihuomautus</a></nav><p>Koordinaattori säilyttää täydellisen lähde- ja oikeusavaimen erillään. Julkinen jakaminen ja lähteiden esittämistapa vaativat erillisen hyväksynnän. Kuva on lähdekuvan metatiedoista puhdistettu johdannainen, ei uusi riippumaton valokuva.</p></header><main>${sections}</main></body></html>\n`;
}
export function blankReview(observations, acquisitionSha256) {
  assert.match(acquisitionSha256, hashPattern, "acquisition_hash");
  return {
    schemaVersion: "off-product-blind-review-v1",
    acquisitionSha256,
    reviewerId: "",
    reviewedOn: "",
    status: "unreviewed",
    cases: observations.map((row) => ({
      blindId: row.blindId,
      reviewImageSha256: row.reviewImageSha256 ?? null,
      available: row.status === "ready",
      observedName: "",
      observedSize: "",
      observedGtin: "",
      identityAssessment: "unreviewed",
      privacyAssessment: "unreviewed",
      imageSuitability: "unreviewed",
      duplicateGroup: "",
      notes: "",
    })),
  };
}

function sourceIdentity(cwd) {
  const names = [
    "scripts/qa/reference-image/acquire-off-references.mjs",
    "scripts/qa/reference-image/node-runtime-ports.mjs",
    "scripts/qa/reference-image/pinned-reference-decoder.mjs",
    "scripts/qa/reference-image/prepare-off-candidates.mjs",
    "scripts/qa/local-vision/embedding-control.mjs",
    "scripts/qa/local-vision/embedding-head.mjs",
    selectionFile,
  ];
  return Object.fromEntries(
    names.map((name) => [name, sha(readBounded(path.join(cwd, name), 1_000_000))]),
  );
}
function plan(cwd) {
  const bytes = readBounded(path.join(cwd, selectionFile), 65536);
  assert.equal(sha(bytes), selectionSha256, "selection_drift");
  return parseSelection(bytes.toString("utf8"));
}
export function freezeAcquisition(outputArgument, cwd = project) {
  const output = checkedOutput(outputArgument, cwd),
    entries = plan(cwd),
    { identity } = loadPinnedReferenceDecoder(cwd);
  fs.mkdirSync(output, { mode: 0o700 });
  return writeJsonExclusive(
    path.join(output, "lock.json"),
    {
      version: OFF_ACQUISITION_POLICY.version,
      policy: OFF_ACQUISITION_POLICY,
      selectionSha256,
      sources: sourceIdentity(cwd),
      decoderIdentity: identity,
      decodePolicy: NODE_REFERENCE_DECODE_POLICY,
      entries,
    },
    cwd,
  );
}

export async function acquireReferences(
  lockArgument,
  expectedHash,
  outputArgument,
  { cwd = project, fetcher = fetch, onObservation = () => {} } = {},
) {
  assert.match(expectedHash, hashPattern, "lock_hash_required");
  const lockFile = checkedWorkFile(lockArgument, cwd),
    lockBytes = readBounded(lockFile, 1_000_000);
  assert.equal(sha(lockBytes), expectedHash, "lock_hash");
  const lock = JSON.parse(lockBytes);
  assert.deepEqual(
    lock,
    {
      version: OFF_ACQUISITION_POLICY.version,
      policy: OFF_ACQUISITION_POLICY,
      selectionSha256,
      sources: sourceIdentity(cwd),
      decoderIdentity: loadPinnedReferenceDecoder(cwd).identity,
      decodePolicy: NODE_REFERENCE_DECODE_POLICY,
      entries: plan(cwd),
    },
    "frozen_plan_drift",
  );
  const output = checkedOutput(outputArgument, cwd),
    marker = checkedOutput(ledger, cwd);
  // Exact marker before the first request. A new lock/output is not a silent retry.
  writeJsonExclusive(
    marker,
    {
      status: "started",
      lockSha256: expectedHash,
      output: path.relative(cwd, output),
      startedAt: new Date().toISOString(),
    },
    cwd,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  for (const directory of ["originals", "blind", "blind/images"])
    fs.mkdirSync(path.join(output, directory), { mode: 0o700 });
  const { sharp } = loadPinnedReferenceDecoder(cwd),
    ports = createNodeReferencePorts(sharp);
  const observations = [],
    counters = {
      planned: 21,
      requests: 0,
      bytesReceived: 0,
      downloaded: 0,
      decodes: 0,
      reviewEncodes: 0,
      ready: 0,
      failed: 0,
      notAttempted: 0,
      featureExtractions: 0,
      matcherCalls: 0,
      trainingCalls: 0,
      paidRequests: 0,
    };
  for (const entry of lock.entries) {
    let row = { ...entry, status: "not_attempted", reason: "total_byte_budget" };
    const remaining = OFF_ACQUISITION_POLICY.maximumTotalBytes - counters.bytesReceived;
    if (remaining <= 0) counters.notAttempted++;
    else {
      writeJsonExclusive(
        path.join(output, `${entry.blindId}-dispatch.json`),
        {
          blindId: entry.blindId,
          requestOrdinal: counters.requests + 1,
          state: "dispatch_reserved",
          networkReachability: "not_yet_proven",
        },
        cwd,
      );
      counters.requests++;
      const fetched = await fetchImage(entry, fetcher, remaining);
      counters.bytesReceived += fetched.bytesReceived;
      row = { ...entry, ...fetched };
      delete row.bytes;
      if (fetched.status === "downloaded") {
        counters.downloaded++;
        row.originalSha256 = sha(fetched.bytes);
        row.originalBytes = fetched.bytes.byteLength;
        row.originalFile = `originals/${entry.blindId}.jpg`;
        writeJsonExclusive(path.join(output, `${entry.blindId}-download.json`), row, cwd);
        writeBytes(
          path.join(output, row.originalFile),
          fetched.bytes,
          OFF_ACQUISITION_POLICY.maximumImageBytes,
          cwd,
        );
        let review;
        try {
          counters.decodes++;
          const rgb = await ports.decodeRgb(fetched.bytes, {
            maximumDimension: 1024,
            maximumPixels: 1048576,
          });
          counters.reviewEncodes++;
          const png = await sharp(rgb.data, {
            raw: { width: rgb.width, height: rgb.height, channels: 3 },
          })
            .png({ compressionLevel: 9 })
            .toBuffer();
          const metadata = await sharp(png).metadata();
          assert.ok(
            !metadata.exif &&
              !metadata.xmp &&
              !metadata.iptc &&
              !metadata.icc &&
              !metadata.orientation,
            "review_metadata_present",
          );
          review = { png, width: rgb.width, height: rgb.height };
        } catch {
          row = { ...row, status: "failed", reason: "decode_or_review_failed" };
          counters.failed++;
        }
        if (review) {
          row = {
            ...row,
            status: "ready",
            reviewImageSha256: sha(review.png),
            reviewFile: `blind/images/${entry.blindId}.png`,
            reviewTransform: OFF_ACQUISITION_POLICY.reviewTransform,
            width: review.width,
            height: review.height,
          };
          writeBytes(
            path.join(output, row.reviewFile),
            review.png,
            OFF_ACQUISITION_POLICY.maximumReviewBytes,
            cwd,
          );
          counters.ready++;
        }
      } else counters.failed++;
    }
    observations.push(row);
    // Receipt immediately persisted: later operational failure cannot erase attempts.
    writeJsonExclusive(path.join(output, `${entry.blindId}-receipt.json`), row, cwd);
    onObservation({ blindId: row.blindId, status: row.status });
  }
  assert.deepEqual(sourceIdentity(cwd), lock.sources, "source_drift_after_acquisition");
  assert.deepEqual(
    loadPinnedReferenceDecoder(cwd).identity,
    lock.decoderIdentity,
    "decoder_drift_after_acquisition",
  );
  const manifest = writeJsonExclusive(
    path.join(output, "acquisition.json"),
    {
      version: OFF_ACQUISITION_POLICY.version,
      lockSha256: expectedHash,
      selectionSha256,
      acquiredAt: new Date().toISOString(),
      counters,
      observations,
      integrationAllowed: false,
      humanAccepted: false,
      captureIndependence: "unverified",
      split: "unassigned",
    },
    cwd,
  );
  for (const reviewer of ["a", "b"])
    writeJsonExclusive(
      path.join(output, `blind/reviewer-${reviewer}.json`),
      blankReview(observations, manifest.sha256),
      cwd,
    );
  writeBytes(
    path.join(output, "blind/index.html"),
    Buffer.from(renderBlindPage(observations)),
    200_000,
    cwd,
  );
  const attribution = `# Open Food Facts reference-image attribution\n\nPRIVATE REVIEW PREPARATION — NOT AN ACCEPTED CATALOGUE.\n\nProduct data: Open Food Facts contributors, ODbL 1.0; contents DbCL 1.0. Images: CC BY-SA 3.0, https://creativecommons.org/licenses/by-sa/3.0/ . Other rights/privacy review remains pending.\n\nReview PNGs: orientation baked, decoded to sRGB/white RGB and re-encoded without source metadata; no crop, generated content or independent-capture claim. Preserve the same image licence on redistribution. Source claims may be wrong. This is not owner/legal or identity acceptance.\n\n${observations.map((row) => `- ${row.blindId}: ${row.authorCredit}; source ${row.imageUrl}; accessed ${new Date().toISOString().slice(0, 10)}; source SHA256 ${row.originalSha256 ?? "not acquired"}; review SHA256 ${row.reviewImageSha256 ?? "not produced"}.`).join("\n")}\n`;
  writeBytes(path.join(output, "ATTRIBUTION.md"), Buffer.from(attribution), 100_000, cwd);
  const credits = `# Private review preparation — not cleared for distribution\n\nImages originate from Open Food Facts contributors under CC BY-SA 3.0: https://creativecommons.org/licenses/by-sa/3.0/ . Product data: ODbL 1.0, individual contents DbCL 1.0.\n\nContributor credits (unkeyed): ${[...new Set(observations.map((row) => row.authorCredit))].sort().join("; ")}.\n\nDerived review PNGs bake orientation and remove source metadata; they are not independent captures. Full per-image source URLs, hashes and rights records remain with the coordinator outside this working bundle. Do not distribute this preparation until the owner approves the complete attribution/rights and review procedure. This notice is not legal clearance or accepted ground truth.\n`;
  writeBytes(path.join(output, "blind/CREDITS.md"), Buffer.from(credits), 20_000, cwd);
  writeJsonExclusive(
    path.join(output, "completion.json"),
    {
      status: counters.ready === 21 ? "all_acquired_for_review" : "incomplete_acquisition",
      acquisitionSha256: manifest.sha256,
      counters,
      humanAccepted: false,
      integrationAllowed: false,
    },
    cwd,
  );
  return { output, acquisitionSha256: manifest.sha256, counters, integrationAllowed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === "--freeze") {
      const result = freezeAcquisition(args[1]);
      console.log(JSON.stringify({ lock: result.path, sha256: result.sha256 }));
    } else if (args.length === 4 && args[0] === "--run") {
      const result = await acquireReferences(args[1], args[2], args[3], {
        onObservation: (value) => console.log(JSON.stringify(value)),
      });
      console.log(JSON.stringify(result));
    } else
      throw new Error(
        "Use --freeze work/new-directory OR --run work/lock.json sha256 work/new-directory",
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "acquisition_failed");
    process.exitCode = 1;
  }
}
