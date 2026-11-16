import assert from "node:assert/strict";
import test from "node:test";
import { comparisonPreflight } from "../qa/object-comparison-preflight.mjs";
const metadata = { schemaVersion: "object-recognition-pilot-v1", samples: [] };
const audit = {
  schemaVersion: "object-image-audit-result-v1",
  receipts: [],
  byteAuditClean: true,
  physicalDeclaredImages: 0,
  declaredImages: 93,
};
test("empty physical data cannot trigger model work", () => {
  const r = comparisonPreflight(metadata, []);
  assert.equal(r.modelsExecuted, 0);
  assert.equal(r.comparisonAllowed, false);
  assert(r.blockers.includes("physical_collection_incomplete"));
});
test("source audit cannot substitute for physical images even with clean flag", () => {
  const r = comparisonPreflight(metadata, [audit]);
  assert(r.blockers.includes("nonphysical_source_images"));
  assert.equal(r.comparisonAllowed, false);
});
test("unclean batches and duplicate receipts are not accepted", () => {
  assert(
    comparisonPreflight(metadata, [{ ...audit, byteAuditClean: false }]).blockers.includes(
      "image_batch_not_clean",
    ),
  );
  const r = { ...audit, receipts: [{ id: "same", imageSha256: "a".repeat(64) }] };
  assert.throws(() => comparisonPreflight(metadata, [r, r]), /duplicate_receipt_id/);
});
test("image evidence cannot inflate an empty metadata collection", () => {
  const r = comparisonPreflight(metadata, [
    { ...audit, receipts: [{ id: "extra", imageSha256: "a".repeat(64) }] },
  ]);
  assert(r.blockers.includes("image_metadata_count_mismatch"));
});
