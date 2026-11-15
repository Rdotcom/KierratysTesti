import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { rankVector, summarize, vector } from "../qa/dinov2/review.mjs";

const descriptor = (axis = 0) => Array.from({ length: 384 }, (_, i) => (i === axis ? 1 : 0));
const references = () =>
  Array.from({ length: 10 }, (_, i) => ({
    productId: `off-${Math.floor(i / 2)}`,
    vector: descriptor(Math.floor(i / 2)),
  }));
test("DINO descriptors reject dimensional, nonfinite and nonunit evidence", () => {
  assert.throws(() => vector([1]));
  assert.throws(() => vector(descriptor().map(() => 0)));
  assert.throws(() => vector(descriptor().map(() => Number.NaN)));
  assert.throws(() => vector(descriptor().map((x) => x * 2)));
  assert.deepEqual(vector(descriptor()), descriptor());
});
test("DINO reference retrieval is per-product, ordered and cannot shrink gallery", () => {
  const rank = rankVector(descriptor(3), references());
  assert.equal(rank.length, 5);
  assert.equal(rank[0].productId, "off-3");
  assert.equal(rank[0].cosine, 1);
  assert.equal(rank[1].productId, "off-0");
  assert.throws(() => rankVector(descriptor(), references().slice(1)));
  assert.throws(() =>
    rankVector(
      descriptor(),
      references().map((r) => ({ ...r, productId: "off-1" })),
    ),
  );
});
function fixture() {
  const rows = Array.from({ length: 17 }, (_, i) => ({
    id: `case-${i}`,
    role: "product_query",
    expected: "off-0",
    rank: [{ productId: i < 14 ? "off-0" : "off-1", cosine: 1 }],
    failure: null,
  }));
  const baseline = {
    observations: rows.map((r, i) => ({
      id: r.id,
      role: r.role,
      expectedSourceProductId: r.expected,
      resolved: { ranking: i === 16 ? [] : [{ productId: i < 11 ? "off-0" : "off-1" }] },
    })),
  };
  return { rows, baseline };
}
test("DINO comparison retains baseline timeout denominator and forbids precision claim", () => {
  const { rows, baseline } = fixture();
  const m = summarize(rows, baseline);
  assert.equal(m.known, 17);
  assert.equal(m.pairedKnown, 16);
  assert.equal(m.top1, 14);
  assert.equal(m.improvementGate, "PASS");
  assert.equal(m.publicReleaseGate, "FAIL");
  assert.equal(m.acceptedPrecision, null);
  assert.equal(m.automaticAccepts, 0);
  assert.throws(() => summarize(rows.slice(1), baseline));
  assert.throws(() => summarize([...rows.slice(1), rows[1]], baseline));
});
test("Missing descriptors, old-correct losses and failed references fail comparison gate", () => {
  const { rows, baseline } = fixture();
  rows[0] = { ...rows[0], rank: [], failure: "TimeoutError" };
  const m = summarize(rows, baseline);
  assert.deepEqual(m.losses, ["case-0"]);
  assert.equal(m.top1, 13);
  assert.equal(m.improvementGate, "FAIL");
  const clean = fixture();
  clean.rows.push({ id: "reference", role: "reference", rank: [], failure: "ValueError" });
  assert.equal(summarize(clean.rows, clean.baseline).improvementGate, "FAIL");
});
test("DINO experiment uses local safetensors, bounded inference and network denial", () => {
  const py = fs.readFileSync(new URL("../qa/dinov2/infer.py", import.meta.url), "utf8");
  const run = fs.readFileSync(new URL("../qa/dinov2/run.mjs", import.meta.url), "utf8");
  assert.match(py, /local_files_only=True/u);
  assert.match(py, /use_safetensors=True/u);
  assert.match(py, /trust_remote_code=False/u);
  assert.match(py, /torch\.inference_mode\(\)/u);
  assert.match(py, /signal\.setitimer\(signal\.ITIMER_REAL, 60\)/u);
  assert.match(run, /deny network\*/u);
  assert.match(run, /dinov2-small-v1-attempt\.json/u);
  assert.match(run, /timeout: 900000/u);
  assert.doesNotMatch(py, /torch\.load\(|torch\.hub/u);
});
