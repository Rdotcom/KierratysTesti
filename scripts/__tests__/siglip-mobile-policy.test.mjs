import assert from "node:assert/strict";
import test from "node:test";
import { assessMobileParity, mobileParityPolicy } from "../qa/siglip-mobile-policy.mjs";
const fixture = () => ({
  schemaVersion: mobileParityPolicy.version,
  baseline: Array.from({ length: 4 }, (_, i) => ({
    id: `scene-${i}`,
    failure: null,
    top1: "spoon",
    parentScoreMaxError: 0,
  })),
  arms: Object.fromEntries(
    ["fp16", "int8"].map((arm) => [
      arm,
      {
        resourcesBytes: 100_000_000,
        rows: Array.from({ length: 4 }, (_, i) => ({
          id: `scene-${i}`,
          failure: null,
          top1: "spoon",
          embeddingCosine: 0.99999,
          maxScoreError: 0.00001,
        })),
      },
    ]),
  ),
});
test("matching smaller export passes engineering only, never physical/release", () => {
  const r = assessMobileParity(fixture());
  assert(r.arms.int8.engineeringGatePassed);
  assert.equal(r.releaseReady, false);
  assert.equal(r.arms.int8.physicalDeviceVerified, false);
});
test("size gain cannot excuse prediction loss", () => {
  const f = fixture();
  f.arms.int8.rows[0].top1 = "fork";
  assert.equal(assessMobileParity(f).arms.int8.engineeringGatePassed, false);
});
test("missing and duplicate rows fail closed", () => {
  const f = fixture();
  f.arms.int8.rows.pop();
  assert.throws(() => assessMobileParity(f));
  const g = fixture();
  g.arms.int8.rows[1] = g.arms.int8.rows[0];
  assert.throws(() => assessMobileParity(g));
});
test("baseline drift invalidates both converted candidates", () => {
  const f = fixture();
  f.baseline[0].parentScoreMaxError = 0.001;
  assert.equal(assessMobileParity(f).baselinePassed, false);
  assert.equal(assessMobileParity(f).arms.int8.parityPassed, false);
});
for (const change of [
  (r) => {
    r.embeddingCosine = NaN;
  },
  (r) => {
    r.maxScoreError = Infinity;
  },
  (r) => {
    r.failure = "timeout";
  },
  (r) => {
    r.embeddingCosine = 0.98;
  },
  (r) => {
    r.maxScoreError = 0.006;
  },
])
  test("invalid or excessive error never passes", () => {
    const f = fixture();
    change(f.arms.int8.rows[0]);
    assert.equal(assessMobileParity(f).arms.int8.parityPassed, false);
  });
test("resource limit independent of rank preservation", () => {
  const f = fixture();
  f.arms.int8.resourcesBytes = 151 * 1024 * 1024;
  assert.equal(assessMobileParity(f).arms.int8.sizePassed, false);
  assert(assessMobileParity(f).arms.int8.parityPassed);
});
