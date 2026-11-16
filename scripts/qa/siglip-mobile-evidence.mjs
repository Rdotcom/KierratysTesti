import assert from "node:assert/strict";
const vector = (v) => {
  assert(Array.isArray(v) && v.length === 768 && v.every(Number.isFinite), "vector_shape");
  assert(Math.abs(Math.hypot(...v) - 1) < 0.000001, "vector_norm");
};
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
export function reviewVectorParity(arm, baseline, prototypes, classes) {
  assert(classes.length === 15 && new Set(classes).size === 15, "classes");
  assert(prototypes.length === 15, "prototypes");
  prototypes.forEach(vector);
  assert(baseline.length === 4 && new Set(baseline.map((r) => r.id)).size === 4);
  assert(arm.rows.length === 4 && new Set(arm.rows.map((r) => r.id)).size === 4);
  let minCosine = 1;
  let maxScoreError = 0;
  let top1Preserved = 0;
  let failures = 0;
  for (const row of arm.rows) {
    const b = baseline.find((r) => r.id === row.id);
    assert(b && !b.failure && classes.includes(b.top1), "baseline");
    vector(b.vector);
    assert(b.scores.length === 15 && b.scores.every(Number.isFinite));
    const sourceScores = prototypes.map((p) => dot(p, b.vector));
    assert(sourceScores.every((x, i) => Math.abs(x - b.scores[i]) < 0.0000001));
    assert.equal(classes[sourceScores.indexOf(Math.max(...sourceScores))], b.top1);
    assert(Number.isFinite(row.durationMs) && row.durationMs >= 0, "duration");
    if (row.failure) {
      failures++;
      continue;
    }
    vector(row.vector);
    const scores = prototypes.map((p) => dot(p, row.vector));
    assert(
      row.scores.length === 15 &&
        row.scores.every((x, i) => Number.isFinite(x) && Math.abs(x - scores[i]) < 1e-10),
      "stored_scores",
    );
    const top1 = classes[scores.indexOf(Math.max(...scores))];
    assert.equal(row.top1, top1, "stored_top1");
    const cosine = dot(row.vector, b.vector);
    const error = Math.max(...scores.map((x, i) => Math.abs(x - b.scores[i])));
    assert(Math.abs(cosine - row.embeddingCosine) < 1e-10, "stored_cosine");
    assert(Math.abs(error - row.maxScoreError) < 1e-10, "stored_error");
    minCosine = Math.min(minCosine, cosine);
    maxScoreError = Math.max(maxScoreError, error);
    top1Preserved += Number(top1 === b.top1);
  }
  return { minCosine, maxScoreError, top1Preserved, failures };
}
