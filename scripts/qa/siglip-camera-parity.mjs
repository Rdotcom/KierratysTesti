import assert from "node:assert/strict";
export function assessCameraWorkerScores(classes, observed, original, mac) {
  assert(classes.length === 15 && new Set(classes).size === 15);
  assert.deepEqual(
    observed.map((s) => s.kind),
    classes,
  );
  const scores = observed.map((s) => s.similarity);
  for (const values of [scores, original.scores, mac.map((s) => s.similarity)])
    assert(values.length === 15 && values.every((v) => Number.isFinite(v) && Math.abs(v) <= 1));
  const top1 = classes[scores.indexOf(Math.max(...scores))];
  assert.equal(original.top1, classes[original.scores.indexOf(Math.max(...original.scores))]);
  const maxOriginalPngScoreError = Math.max(
    ...scores.map((x, i) => Math.abs(x - original.scores[i])),
  );
  const maxMacWorkerScoreError = Math.max(...scores.map((x, i) => Math.abs(x - mac[i].similarity)));
  const registeredGatePassed = top1 === original.top1 && maxOriginalPngScoreError <= 0.005;
  // Additional diagnostic remains visible/failed even when registered gate passes.
  const strictMacDiagnosticPassed = maxMacWorkerScoreError <= 0.00001;
  return {
    top1,
    maxOriginalPngScoreError,
    maxMacWorkerScoreError,
    registeredGatePassed,
    strictMacDiagnosticPassed,
    passed: registeredGatePassed && strictMacDiagnosticPassed,
  };
}
