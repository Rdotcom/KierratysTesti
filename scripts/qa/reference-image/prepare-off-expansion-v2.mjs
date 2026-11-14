// Cached metadata repair + separately frozen acquisition. No recognition calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { fetchImage, writeBytes } from "./acquire-off-references.mjs";
import { planOffExpansion } from "./expand-off-corpus.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

const rootDefault = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const parent = "work/off-expansion-2026-11-14.KK6s7m/metadata/";
const parentPins = {
  [`${parent}plan.json`]: "4439c974f920ef7bedb919e15e568dbb26a7d9f9440e1e63261d5d040bd0f53f",
  [`${parent}protocol.json`]: "5060ef25fde4c0a2649c94dd68b54917dc7370effacc9a82333037bf1642bffe",
};
const planLedger = "work/off-expansion-cached-plan-v2-attempt.json",
  imageLedger = "work/off-expansion-images-v2-attempt.json";

/** Quarantine only invalid selected annotations, never enroll their missing
 * parent. Unclassified originals still need actual privacy/identity review. */
export function quarantineOrphanSelections(serialized) {
  assert.ok(typeof serialized === "string" && Buffer.byteLength(serialized) <= 524288);
  const response = JSON.parse(serialized),
    quarantined = [];
  assert.ok(
    response?.status === 1 &&
      response.product?.images &&
      typeof response.product.images === "object" &&
      !Array.isArray(response.product.images),
  );
  const images = response.product.images;
  for (const [key, value] of Object.entries(images)) {
    if (!/^(?:front|ingredients|nutrition|packaging)_[a-z]{2}$/u.test(key)) continue;
    const id =
      value && typeof value === "object" && !Array.isArray(value) ? String(value.imgid) : "";
    const original = images[id];
    if (
      !/^[1-9]\d{0,5}$/u.test(id) ||
      !original ||
      typeof original !== "object" ||
      Array.isArray(original)
    ) {
      quarantined.push({ selectedView: key, reason: "orphan_or_invalid_selected_parent" });
      delete images[key];
    }
  }
  return { response, quarantined };
}
function readParent(root) {
  const read = (f, digest) => {
    const b = readBounded(checkedWorkFile(f, root), 2_000_000);
    assert.equal(sha(b), digest);
    return JSON.parse(b);
  };
  const plan = read(`${parent}plan.json`, parentPins[`${parent}plan.json`]),
    protocol = read(`${parent}protocol.json`, parentPins[`${parent}protocol.json`]);
  for (const [f, digest] of Object.entries(protocol.sourcePins))
    assert.equal(sha(readBounded(path.join(root, f), 2_000_000)), digest);
  const previousBytes = readBounded(path.join(root, protocol.previousFile), 1_000_000);
  assert.equal(sha(previousBytes), protocol.previousSha256);
  const previous = JSON.parse(previousBytes),
    responses = plan.requests.map((r) => {
      assert.equal(r.status, "observed");
      const b = readBounded(checkedWorkFile(r.file, root), 524288);
      assert.equal(sha(b), r.sha256);
      return { code: r.code, bytes: b, sha256: r.sha256 };
    });
  return { plan, protocol, previous, responses };
}
function sourcePins(root) {
  return Object.fromEntries(
    [
      "scripts/qa/reference-image/prepare-off-expansion-v2.mjs",
      "scripts/__tests__/off-expansion-v2.test.mjs",
      "docs/final/OFF_EXPANSION_V2_PROTOCOL.md",
      "scripts/qa/reference-image/acquire-off-references.mjs",
      "scripts/qa/reference-image/pinned-reference-decoder.mjs",
    ].map((f) => [f, sha(readBounded(path.join(root, f), 2_000_000))]),
  );
}
export function prepareOffExpansionV2(outputArgument, root = rootDefault) {
  assert.ok(!fs.existsSync(path.join(root, planLedger)), "cached_expansion_already_attempted");
  const output = checkedOutput(outputArgument, root),
    old = readParent(root),
    sources = sourcePins(root);
  const products = old.responses.map((r) => {
    const normalized = quarantineOrphanSelections(r.bytes.toString("utf8"));
    const product = planOffExpansion(
      r.code,
      normalized.response,
      r.sha256,
      old.plan.accessedOn,
      old.previous.products.find((p) => p.gtin === r.code),
    );
    const before = old.plan.products.find((p) => p.gtin === r.code);
    if (!normalized.quarantined.length)
      assert.deepEqual(product, before, "unaffected_product_drift");
    return { ...product, quarantinedSelectedViews: normalized.quarantined };
  });
  fs.mkdirSync(output, { mode: 0o700 });
  const saved = writeJsonExclusive(
    path.join(output, "plan.json"),
    {
      schemaVersion: "off-corpus-expansion-plan-v2",
      parentPins,
      sourcePins: sources,
      accessedOn: old.plan.accessedOn,
      requests: old.plan.requests,
      products,
      licences: old.plan.licences,
      imagesDownloaded: 0,
      newApiRequests: 0,
      modelCalls: 0,
      integrationAllowed: false,
    },
    root,
  );
  writeJsonExclusive(
    path.join(root, planLedger),
    { planSha256: saved.sha256, output: path.relative(root, output) },
    root,
  );
  return {
    plan: path.relative(root, saved.path),
    sha256: saved.sha256,
    products: products.map((p) => ({
      gtin: p.gtin,
      status: p.status,
      candidates: p.candidateImages.length,
      quarantined: p.quarantinedSelectedViews.length,
    })),
    newApiRequests: 0,
  };
}

export async function acquireOffExpansionV2(
  planFile,
  planSha256,
  outputArgument,
  root = rootDefault,
  fetcher = fetch,
) {
  assert.ok(!fs.existsSync(path.join(root, imageLedger)), "expansion_images_already_attempted");
  const bytes = readBounded(checkedWorkFile(planFile, root), 2_000_000);
  assert.equal(sha(bytes), planSha256);
  const plan = JSON.parse(bytes),
    output = checkedOutput(outputArgument, root),
    sources = sourcePins(root);
  assert.equal(plan.schemaVersion, "off-corpus-expansion-plan-v2");
  assert.deepEqual(plan.sourcePins, sources);
  readParent(root);
  const decoder = loadPinnedReferenceDecoder(root),
    entries = plan.products.flatMap((p) =>
      p.candidateImages.map((image) => ({
        ...image,
        gtin: p.gtin,
        productId: p.productId,
        sourceReportedName: p.sourceReportedName,
        sourceReportedQuantity: p.sourceReportedQuantity,
        sourceSnapshotSha256: p.snapshotSha256,
        sourceAccessedOn: p.accessedOn,
      })),
    );
  assert.equal(entries.length, 30);
  assert.equal(new Set(entries.map((r) => r.imageUrl)).size, 30);
  assert.equal(new Set(entries.map((r) => r.familyId)).size, 30);
  fs.mkdirSync(output, { mode: 0o700 });
  fs.mkdirSync(path.join(output, "originals"));
  fs.mkdirSync(path.join(output, "review"));
  const lock = writeJsonExclusive(
    path.join(output, "protocol.json"),
    {
      schemaVersion: "off-expansion-images-v2",
      planFile,
      planSha256,
      sourcePins: sources,
      entries,
      decoderIdentity: decoder.identity,
      decoderLockSha256: decoder.lockSha256,
      maximumRequests: 30,
      maximumTotalBytes: 16 * 1024 * 1024,
      maximumImageBytes: 1500000,
      maximumReviewPixels: 1048576,
      maximumReviewEdge: 1024,
      modelCalls: 0,
      integrationAllowed: false,
    },
    root,
  );
  writeJsonExclusive(
    path.join(root, imageLedger),
    { lockSha256: lock.sha256, output: path.relative(root, output) },
    root,
  );
  const rows = [];
  let bytesReceived = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index],
      id = `exp-${String(index + 1).padStart(3, "0")}`;
    writeJsonExclusive(
      path.join(output, `${id}-attempt.json`),
      { id, imageUrl: entry.imageUrl, lockSha256: lock.sha256 },
      root,
    );
    const remaining = 16 * 1024 * 1024 - bytesReceived;
    const fetched =
      remaining > 0
        ? await fetchImage(entry, fetcher, remaining)
        : { status: "failed", reason: "total_byte_budget", bytesReceived: 0 };
    bytesReceived += fetched.bytesReceived;
    let row = {
      ...entry,
      id,
      status: "failed",
      reason: fetched.reason ?? "not_decoded",
      bytesReceived: fetched.bytesReceived,
    };
    if (fetched.status === "downloaded") {
      const originalFile = path.relative(root, path.join(output, "originals", `${id}.jpg`));
      writeBytes(path.join(root, originalFile), fetched.bytes, 2 * 1024 * 1024, root);
      row = {
        ...row,
        originalFile,
        originalSha256: sha(fetched.bytes),
        originalBytes: fetched.bytes.length,
      };
      try {
        assert.ok(fetched.bytes.length <= 1500000, "native_image_bound");
        const image = decoder.sharp(fetched.bytes, {
          limitInputPixels: 16000000,
          failOn: "warning",
          animated: false,
        });
        const metadata = await image.metadata();
        assert.ok(
          metadata.format === "jpeg" &&
            metadata.width > 0 &&
            metadata.height > 0 &&
            metadata.width <= 4096 &&
            metadata.height <= 4096 &&
            (metadata.pages ?? 1) === 1,
        );
        const review = await image
          .rotate()
          .toColourspace("srgb")
          .flatten({ background: "#ffffff" })
          .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer({ resolveWithObject: true });
        const reviewFile = path.relative(root, path.join(output, "review", `${id}.png`));
        writeBytes(path.join(root, reviewFile), review.data, 4 * 1024 * 1024, root);
        row = {
          ...row,
          status: "pending_visual_review",
          reason: null,
          reviewFile,
          reviewSha256: sha(review.data),
          width: review.info.width,
          height: review.info.height,
          transform: "orientation-baked-srgb-white-metadata-free-png-v1",
          identityStatus: "source_asserted_unverified",
          privacyStatus: "not_yet_observed",
        };
      } catch {
        row = { ...row, reason: "decode_or_native_bound_failed" };
      }
    }
    rows.push(row);
    writeJsonExclusive(path.join(output, `${id}-receipt.json`), row, root);
    process.stdout.write(
      `${JSON.stringify({ ordinal: index + 1, planned: entries.length, status: row.status })}\n`,
    );
  }
  assert.deepEqual(sourcePins(root), sources);
  loadPinnedReferenceDecoder(root);
  readParent(root);
  const summary = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      schemaVersion: "off-expansion-image-result-v2",
      lockSha256: lock.sha256,
      planSha256,
      rows,
      bytesReceived,
      planned: 30,
      downloaded: rows.filter((r) => r.originalFile).length,
      readyForVisualReview: rows.filter((r) => r.status === "pending_visual_review").length,
      failed: rows.filter((r) => r.status === "failed").length,
      modelCalls: 0,
      integrationAllowed: false,
    },
    root,
  );
  return {
    lockSha256: lock.sha256,
    summary: path.relative(root, summary.path),
    summarySha256: summary.sha256,
    ready: rows.filter((r) => r.status === "pending_visual_review").length,
    failed: rows.filter((r) => r.status === "failed").length,
    modelCalls: 0,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const result =
    a[0] === "--prepare" && a.length === 2
      ? prepareOffExpansionV2(a[1])
      : a[0] === "--acquire" && a.length === 4
        ? await acquireOffExpansionV2(...a.slice(1))
        : null;
  assert.ok(result, "use --prepare work/new OR --acquire plan sha work/new");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
