import assert from "node:assert/strict";
import test from "node:test";
import {
  OFF_HYBRID_POLICY,
  summarizeHybridRows,
} from "../qa/reference-image/evaluate-off-hybrid.mjs";

const candidate = (productId = "a") => ({ status: "candidate", productId });
function rows() {
  return Array.from({ length: 21 }, (_, i) => ({
    blindId: `case-${i + 1}`,
    productId: "a",
    role: i < 8 ? "gallery_self" : i < 20 ? "cross_upload" : "insufficient_gallery",
    pixel: { status: "unknown" },
    embedding: null,
    hybrid: null,
  }));
}
test("policy bounds both native views and leaves deployment and independence false", () => {
  assert.equal(OFF_HYBRID_POLICY.maximumProcesses, 20);
  assert.equal(OFF_HYBRID_POLICY.maximumImagePredictions, 40);
  assert.equal(OFF_HYBRID_POLICY.maximumTextPredictions, 0);
  assert.equal(OFF_HYBRID_POLICY.integrationAllowed, false);
  assert.equal(OFF_HYBRID_POLICY.independentAccuracyEstablished, false);
  assert.equal(OFF_HYBRID_POLICY.minimumCosine, 0.9);
  assert.equal(OFF_HYBRID_POLICY.minimumMargin, 0.08);
});
test("all unattempted queries remain in the planned denominator and cannot pass", () => {
  const result = summarizeHybridRows(rows());
  assert.equal(result.arms.embedding.planned, 12);
  assert.equal(result.arms.embedding.notAttempted, 12);
  assert.equal(result.developmentGatePassed, false);
});
test("failure is not counted as unknown and missing work cannot qualify", () => {
  const value = rows();
  value[8].embedding = { status: "unavailable" };
  value[8].hybrid = { status: "unavailable" };
  const result = summarizeHybridRows(value);
  assert.equal(result.arms.embedding.failed, 1);
  assert.equal(result.arms.embedding.unknown, 0);
  assert.equal(result.arms.embedding.notAttempted, 11);
  assert.equal(result.developmentGatePassed, false);
});
test("reports source agreements versus disagreements, not verified accuracy", () => {
  const value = rows();
  for (const r of value.filter((r) => r.role === "cross_upload")) {
    r.embedding = candidate();
    r.hybrid = candidate();
  }
  value[8].hybrid = candidate("b");
  const result = summarizeHybridRows(value);
  assert.equal(result.arms.hybrid.sourceAgreements, 11);
  assert.equal(result.arms.hybrid.sourceDisagreements, 1);
  assert.equal(result.developmentGatePassed, false);
  assert.equal(result.independentAccuracyEstablished, false);
});
test("tracks guarded-baseline correct losses even when overall coverage is high", () => {
  const value = rows();
  for (const r of value.filter((r) => r.role === "cross_upload")) {
    r.pixel = candidate();
    r.embedding = candidate();
    r.hybrid = candidate();
  }
  value[8].hybrid = { status: "ambiguous", productIds: ["a", "b"] };
  const result = summarizeHybridRows(value);
  assert.deepEqual(result.guardedPixelAgreementLosses, ["case-9"]);
  assert.equal(result.developmentGatePassed, false);
});
test("a synthetic development gate pass still never authorizes integration", () => {
  const value = rows();
  for (const r of value.filter((r) => r.role === "cross_upload")) {
    r.embedding = candidate();
    r.hybrid = candidate();
  }
  const result = summarizeHybridRows(value);
  assert.equal(result.developmentGatePassed, true);
  assert.equal(result.integrationAllowed, false);
});
test("rejects missing/duplicate rows and missing query denominators", () => {
  const value = rows();
  assert.throws(() => summarizeHybridRows(value.slice(1)));
  value[1] = value[0];
  assert.throws(() => summarizeHybridRows(value));
  const other = rows();
  other[8].role = "gallery_self";
  assert.throws(() => summarizeHybridRows(other));
});
