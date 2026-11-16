// No model loading: validate real pilot coverage and byte-receipt joins first.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditDataset } from "./object-recognition-dataset.mjs";
import { readBounded } from "./local-vision/embedding-control.mjs";

export function comparisonPreflight(metadata, fileAudits) {
  const data = auditDataset(metadata),
    blockers = [];
  if (!data.collectionMetadataComplete) blockers.push("physical_collection_incomplete");
  assert(Array.isArray(fileAudits) && fileAudits.length <= 100, "audit_batch_bound");
  const receipts = new Map();
  for (const audit of fileAudits) {
    assert.equal(audit.schemaVersion, "object-image-audit-result-v1", "audit_schema");
    assert(Array.isArray(audit.receipts) && audit.receipts.length <= 500, "receipt_bound");
    if (!audit.byteAuditClean) blockers.push("image_batch_not_clean");
    if (audit.physicalDeclaredImages !== audit.declaredImages)
      blockers.push("nonphysical_source_images");
    for (const receipt of audit.receipts) {
      assert(!receipts.has(receipt.id), "duplicate_receipt_id");
      receipts.set(receipt.id, receipt);
    }
  }
  for (const row of metadata.samples)
    if (receipts.get(row.id)?.imageSha256 !== row.sha256)
      blockers.push("missing_or_mismatched_image_receipt");
  if (receipts.size !== metadata.samples.length) blockers.push("image_metadata_count_mismatch");
  // Batch-local reports cannot prove cross-batch lineage/duplicates, nor truth.
  blockers.push(
    "global_lineage_and_truth_review_required",
    "frozen_models_and_evaluation_receipts_missing",
  );
  return {
    schemaVersion: "object-comparison-preflight-v1",
    samples: metadata.samples.length,
    matchingByteReceipts: metadata.samples.filter(
      (r) => receipts.get(r.id)?.imageSha256 === r.sha256,
    ).length,
    blockers: [...new Set(blockers)],
    comparisonAllowed: false,
    modelsExecuted: 0,
    limitation:
      "Preparation only; reports are declarations until independently reverified. No fit, model download or inference dispatched.",
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(
      process.argv.length >= 3 && process.argv.length <= 103,
      "usage: object-comparison-preflight.mjs METADATA [AUDIT ...]",
    );
    const json = (p) => JSON.parse(readBounded(path.resolve(p), 16_000_000));
    const result = comparisonPreflight(json(process.argv[2]), process.argv.slice(3).map(json));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 2;
  } catch {
    process.stderr.write("Comparison preflight rejected invalid metadata or audit joins.\n");
    process.exitCode = 1;
  }
}
