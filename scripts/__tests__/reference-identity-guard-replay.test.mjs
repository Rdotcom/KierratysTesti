import assert from "node:assert/strict";
import test from "node:test";
import {
  countGuardChanges,
  selfEvidenceEnvelope,
} from "../qa/reference-image/replay-identity-guard.mjs";
function rows() {
  return Array.from({ length: 21 }, (_, index) => ({
    blindId: `case-${String(index + 1).padStart(3, "0")}`,
    productId: index % 2 ? "a" : "b",
    role: index < 4 ? "gallery_self" : "cross_upload",
    result: { status: "candidate", productId: index % 2 ? "a" : "b" },
  }));
}
test("guard evidence uses only registered self observations, never a query's expected identity", () => {
  const value = rows();
  value[4].result.productId = "outside-query";
  const envelope = selfEvidenceEnvelope(value);
  assert.equal(envelope.inventory.length, 4);
  assert.ok(!JSON.stringify(envelope).includes("outside-query"));
});
test("every changed result must only abstain, never select or upgrade an identity", () => {
  const before = rows(),
    after = structuredClone(before);
  after[4].result = { status: "ambiguous", productIds: ["a", "b"] };
  const changed = countGuardChanges(before, after);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].sourceAgreementLost, true);
  assert.equal(changed[0].sourceDisagreementSuppressed, false);
  after[5].result.productId = "different";
  assert.throws(() => countGuardChanges(before, after));
});
test("suppressed source disagreement is counted separately from lost source agreement", () => {
  const before = rows();
  before[4].result.productId = "a";
  const after = structuredClone(before);
  after[4].result = { status: "ambiguous", productIds: ["a", "b"] };
  const changed = countGuardChanges(before, after);
  assert.equal(changed[0].sourceAgreementLost, false);
  assert.equal(changed[0].sourceDisagreementSuppressed, true);
});
test("missing/duplicate/misaligned observations cannot produce a comparison", () => {
  assert.throws(() => selfEvidenceEnvelope(rows().slice(1)));
  const value = rows();
  value[1] = value[0];
  assert.throws(() => selfEvidenceEnvelope(value));
  const before = rows(),
    after = rows();
  after[1].blindId = "invented";
  assert.throws(() => countGuardChanges(before, after));
});
