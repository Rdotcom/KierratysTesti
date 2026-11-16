import assert from "node:assert/strict";
import test from "node:test";
import { assessCameraWorkerScores } from "../qa/siglip-camera-parity.mjs";
function fixture() {
  const classes = Array.from({ length: 15 }, (_, i) => `kind-${i}`),
    scores = classes.map((kind, i) => ({ kind, similarity: i === 0 ? 0.2 : 0.01 }));
  return {
    classes,
    scores,
    baseline: { top1: classes[0], scores: scores.map((s) => s.similarity) },
  };
}
test("strict diagnostic cannot silently turn green because registered parity passes", () => {
  const f = fixture(),
    actual = structuredClone(f.scores);
  actual[2].similarity += 0.0008;
  const r = assessCameraWorkerScores(f.classes, actual, f.baseline, f.scores);
  assert.equal(r.registeredGatePassed, true);
  assert.equal(r.strictMacDiagnosticPassed, false);
  assert.equal(r.passed, false);
});
test("changed winner fails unchanged original acceptance regardless of size or Mac agreement", () => {
  const f = fixture(),
    actual = structuredClone(f.scores);
  actual[1].similarity = 0.3;
  assert.equal(
    assessCameraWorkerScores(f.classes, actual, f.baseline, actual).registeredGatePassed,
    false,
  );
});
test("oversize numeric drift fails registered gate with same winner", () => {
  const f = fixture(),
    actual = structuredClone(f.scores);
  actual[0].similarity += 0.006;
  assert.equal(
    assessCameraWorkerScores(f.classes, actual, f.baseline, actual).registeredGatePassed,
    false,
  );
});
test("malformed or reordered observations reject, never shrink denominator", () => {
  const f = fixture();
  for (const actual of [
    f.scores.slice(1),
    f.scores.slice().reverse(),
    f.scores.map((s) => ({ ...s, similarity: NaN })),
  ])
    assert.throws(() => assessCameraWorkerScores(f.classes, actual, f.baseline, f.scores));
});
test("equal outputs pass both engineering comparisons without a release claim", () => {
  const f = fixture(),
    r = assessCameraWorkerScores(f.classes, f.scores, f.baseline, f.scores);
  assert(r.passed);
  assert.equal(r.maxMacWorkerScoreError, 0);
  assert.equal(r.releaseReady, undefined);
});
