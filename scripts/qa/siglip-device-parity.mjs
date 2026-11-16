import assert from "node:assert/strict";
import { mobileParityPolicy } from "./siglip-mobile-policy.mjs";
const finite = (x) => typeof x === "number" && Number.isFinite(x);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
function vector(v) {
  assert(Array.isArray(v) && v.length === 768 && v.every(finite), "vector_shape");
  assert(Math.abs(Math.hypot(...v) - 1) < 0.000001, "vector_norm");
}
export function assessDeviceParity(raw, manifest, baseline, prototypes, compressed) {
  assert(
    raw.run === manifest.run && raw.compute === "siglip2-block32-fp32-cpu-only-v1",
    "identity",
  );
  assert(
    raw.preprocessing === "siglip2-rgb-bilinear-aa22-224-nchw-rescale-double-f32-normalize-v1",
    "preprocessing",
  );
  assert(raw.generalAccuracyVerified === false && raw.cameraVerified === false, "claim_boundary");
  assert(finite(raw.modelLoadMs) && raw.modelLoadMs >= 0, "load_duration");
  assert(manifest.cases.length === 4 && new Set(manifest.cases.map((r) => r.id)).size === 4);
  assert(raw.rows.length === 4 && new Set(raw.rows.map((r) => r.id)).size === 4);
  assert(baseline.length === 4 && compressed.rows.length === 4);
  assert(prototypes.classes.length === 15 && new Set(prototypes.classes).size === 15);
  assert(prototypes.vectors.length === 15);
  prototypes.vectors.forEach(vector);
  const rows = raw.rows.map((row) => {
    const item = manifest.cases.find((r) => r.id === row.id);
    const source = baseline.find((r) => r.id === row.id);
    const mac = compressed.rows.find((r) => r.id === row.id);
    assert(item && source && mac, "case_join");
    assert(finite(row.durationMs) && row.durationMs >= 0, "duration");
    assert(Number.isSafeInteger(row.sampledRssBytes) && row.sampledRssBytes > 0, "sampled_rss");
    if (row.failure) return { id: row.id, passed: false, failure: row.failure };
    assert(
      /^[a-f0-9]{64}$/.test(row.tensorSha256) && row.tensorSha256 === item.tensorSha256,
      "tensor_drift",
    );
    vector(row.vector);
    vector(source.vector);
    vector(mac.vector);
    assert(source.scores.length === 15 && source.scores.every(finite));
    assert(mac.scores.length === 15 && mac.scores.every(finite));
    const scores = prototypes.vectors.map((p) => dot(p, row.vector));
    const top1 = prototypes.classes[scores.indexOf(Math.max(...scores))];
    const cosine = dot(row.vector, source.vector);
    const maxScoreError = Math.max(...scores.map((x, i) => Math.abs(x - source.scores[i])));
    const gate = mobileParityPolicy.arms.int8;
    return {
      id: row.id,
      top1,
      cosine,
      maxScoreError,
      compressedMacCosine: dot(row.vector, mac.vector),
      compressedMacMaxScoreError: Math.max(...scores.map((x, i) => Math.abs(x - mac.scores[i]))),
      durationMs: row.durationMs,
      sampledRssBytes: row.sampledRssBytes,
      passed:
        top1 === source.top1 &&
        cosine >= gate.minCosine &&
        cosine <= 1.00001 &&
        maxScoreError <= gate.maxScoreError,
    };
  });
  return {
    rows,
    top1Preserved: rows.filter((r) => r.top1 === baseline.find((b) => b.id === r.id).top1).length,
    failures: rows.filter((r) => r.failure).length,
    parityPassed: rows.every((r) => r.passed),
    generalAccuracyVerified: false,
    cameraVerified: false,
    samsungVerified: false,
    releaseReady: false,
  };
}
