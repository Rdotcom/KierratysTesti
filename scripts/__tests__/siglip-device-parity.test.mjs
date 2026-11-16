import assert from "node:assert/strict";
import test from "node:test";
import { assessDeviceParity } from "../qa/siglip-device-parity.mjs";
function fixture() {
  const v = Array(768).fill(0);
  v[0] = 1;
  const classes = Array.from({ length: 15 }, (_, i) => `class-${i}`);
  const prototypes = {
    classes,
    vectors: classes.map((_, i) => {
      const x = Array(768).fill(0);
      x[i] = 1;
      return x;
    }),
  };
  const baseline = Array.from({ length: 4 }, (_, i) => ({
    id: `scene-${i}`,
    vector: v,
    top1: classes[0],
    scores: classes.map((_, j) => Number(j === 0)),
  }));
  const manifest = {
    run: "test-run",
    cases: baseline.map((b) => ({ id: b.id, tensorSha256: "a".repeat(64) })),
  };
  const raw = {
    run: manifest.run,
    compute: "siglip2-block32-fp32-cpu-only-v1",
    preprocessing: "siglip2-rgb-bilinear-aa22-224-nchw-rescale-double-f32-normalize-v1",
    generalAccuracyVerified: false,
    cameraVerified: false,
    modelLoadMs: 1,
    rows: baseline.map((b) => ({
      id: b.id,
      vector: v,
      tensorSha256: "a".repeat(64),
      failure: null,
      durationMs: 1,
      sampledRssBytes: 1000,
    })),
  };
  return { raw, manifest, baseline, prototypes, compressed: { rows: baseline } };
}
const assess = (f) => assessDeviceParity(f.raw, f.manifest, f.baseline, f.prototypes, f.compressed);
test("actual four-row native parity cannot certify camera or general accuracy", () => {
  const r = assess(fixture());
  assert(r.parityPassed);
  assert.equal(r.top1Preserved, 4);
  assert.equal(r.releaseReady, false);
  assert.equal(r.samsungVerified, false);
});
for (const [field, value] of [
  ["tensorSha256", "b".repeat(64)],
  ["vector", Array(768).fill(0)],
  ["durationMs", NaN],
  ["sampledRssBytes", 0],
])
  test(`invalid device ${field} rejects`, () => {
    const f = fixture();
    f.raw.rows[0][field] = value;
    assert.throws(() => assess(f));
  });
test("missing or duplicate device observations reject", () => {
  const f = fixture();
  f.raw.rows.pop();
  assert.throws(() => assess(f));
  const g = fixture();
  g.raw.rows[1] = g.raw.rows[0];
  assert.throws(() => assess(g));
});
test("failed observation remains a failed case, never a smaller denominator", () => {
  const f = fixture();
  f.raw.rows[0].failure = "native_failure";
  const r = assess(f);
  assert.equal(r.parityPassed, false);
  assert.equal(r.failures, 1);
  assert.equal(r.top1Preserved, 3);
});
test("top1 change and numeric degradation cannot pass", () => {
  const f = fixture(),
    v = Array(768).fill(0);
  v[1] = 1;
  f.raw.rows[0].vector = v;
  assert.equal(assess(f).parityPassed, false);
});
test("wrong runtime, preprocessing and unsupported claims reject", () => {
  for (const [field, value] of [
    ["compute", "all"],
    ["preprocessing", "crop"],
    ["cameraVerified", true],
    ["run", "other"],
  ]) {
    const f = fixture();
    f.raw[field] = value;
    assert.throws(() => assess(f));
  }
});
