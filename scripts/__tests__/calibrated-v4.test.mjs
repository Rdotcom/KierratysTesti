import assert from "node:assert/strict";
import test from "node:test";
import {
  CALIBRATED_V4_POLICY,
  planControl,
  summarizeCalibrated,
} from "../qa/reference-image/evaluate-calibrated-v4.mjs";

const fixture = (kind = "box") => ({
  id: "box-other",
  title: "File:Moving box.jpg",
  expectedKind: kind,
  sha256: "a".repeat(64),
  sourceFamily: "other-box",
});
const candidate = (productId = "a") => ({ status: "candidate", productId });
const rows = () =>
  Array.from({ length: 44 }, (_, i) => ({
    id: `case-${i}`,
    role: i < 12 ? "product" : i < 36 ? "evaluation_negative" : "unresolved_identity",
    productId: i < 12 ? "a" : undefined,
    pixel: { status: "unknown" },
    baseline: { status: "unknown" },
    calibrated: { status: "unknown" },
  }));
test("source-only plan excludes all unresolved jars before predictions", () => {
  assert.equal(planControl(fixture("jar"), "train").role, "unresolved_identity");
  assert.equal(planControl(fixture("jar"), "validation").role, "unresolved_identity");
});
test("preserves disjoint train/evaluation roles and truthful review markers", () => {
  assert.equal(planControl(fixture(), "train").role, "calibration_only");
  const p = planControl(fixture(), "validation");
  assert.equal(p.role, "evaluation_negative");
  assert.equal(p.reviewStatus, "source_ai_only_human_review_required");
});
test("refuses named target overlap rather than declaring it a negative", () => {
  for (const title of ["Nutella jar", "Barilla box", "Prince biscuits", "Coca-Cola bottle"])
    assert.throws(() => planControl({ ...fixture(), title }, "train"), /identity_overlap/);
});
test("significant change requires double baseline coverage, not just green accounting", () => {
  const r = rows();
  for (let i = 0; i < 3; i++) r[i].calibrated = candidate();
  assert.equal(summarizeCalibrated(r).calibrated.significantDevelopmentChange, false);
  r[3].calibrated = candidate();
  assert.equal(summarizeCalibrated(r).calibrated.significantDevelopmentChange, true);
});
test("any control or unresolved candidate vetoes significance", () => {
  for (const index of [12, 36]) {
    const r = rows();
    for (let i = 0; i < 4; i++) r[i].calibrated = candidate();
    r[index].calibrated = candidate();
    assert.equal(summarizeCalibrated(r).calibrated.significantDevelopmentChange, false);
  }
});
test("source disagreement, missing work and lost-correct cannot hide behind aggregate coverage", () => {
  for (const edit of [
    (r) => (r[4].calibrated = candidate("wrong")),
    (r) => (r[20].calibrated = null),
    (r) => (r[5].pixel = candidate()),
  ]) {
    const r = rows();
    for (let i = 0; i < 4; i++) r[i].calibrated = candidate();
    edit(r);
    assert.equal(summarizeCalibrated(r).calibrated.significantDevelopmentChange, false);
  }
});
test("keeps full denominators, explicit zero new model calls and no integration", () => {
  assert.throws(() => summarizeCalibrated(rows().slice(1)));
  const r = rows();
  r[1].id = r[0].id;
  assert.throws(() => summarizeCalibrated(r));
  assert.equal(CALIBRATED_V4_POLICY.newModelCalls, 0);
  assert.equal(CALIBRATED_V4_POLICY.integrationAllowed, false);
});
