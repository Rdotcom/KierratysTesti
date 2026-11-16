import assert from "node:assert/strict";
import test from "node:test";
import { reviewVectorParity } from "../qa/siglip-mobile-evidence.mjs";
function fixture() {
  const vector = Array(768).fill(0);
  vector[0] = 1;
  const classes = Array.from({ length: 15 }, (_, i) => `class-${i}`);
  const prototypes = classes.map((_, i) => {
    const v = Array(768).fill(0);
    v[i] = 1;
    return v;
  });
  const scores = classes.map((_, i) => Number(i === 0));
  const baseline = Array.from({ length: 4 }, (_, i) => ({
    id: `scene-${i}`,
    vector,
    scores,
    top1: classes[0],
    failure: null,
  }));
  const arm = {
    rows: baseline.map((b) => ({ ...b, durationMs: 1, embeddingCosine: 1, maxScoreError: 0 })),
  };
  return { arm, baseline, prototypes, classes };
}
const review = (f) => reviewVectorParity(f.arm, f.baseline, f.prototypes, f.classes);
test("independent vector recount verifies complete outputs", () => {
  assert.deepEqual(review(fixture()), {
    minCosine: 1,
    maxScoreError: 0,
    top1Preserved: 4,
    failures: 0,
  });
});
for (const [field, value] of [
  ["top1", "class-1"],
  ["embeddingCosine", 0.9],
  ["maxScoreError", 0.1],
  ["scores", Array(15).fill(0)],
  ["vector", Array(768).fill(0)],
  ["durationMs", NaN],
])
  test(`independent recount rejects fabricated ${field}`, () => {
    const f = fixture();
    f.arm.rows[0][field] = value;
    assert.throws(() => review(f));
  });
test("class order drift and duplicate rows cannot validate", () => {
  const f = fixture();
  f.classes.reverse();
  assert.throws(() => review(f));
  const g = fixture();
  g.arm.rows[1] = g.arm.rows[0];
  assert.throws(() => review(g));
});
test("failed predictions stay in denominator", () => {
  const f = fixture();
  f.arm.rows[0].failure = "timeout";
  assert.equal(review(f).top1Preserved, 3);
  assert.equal(review(f).failures, 1);
});
