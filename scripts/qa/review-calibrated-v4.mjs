// Separate arithmetic recount, NOT an independent human/data-quality review.
// Never imports retrieval/fusion/encoder implementations or opens image pixels.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { readBounded } from "./local-vision/embedding-control.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const folder = "work/calibrated-v4-2026-11-13.o6ecTQ/";
const json = (file) => JSON.parse(readBounded(file, 4_000_000));
const lockBytes = readBounded(`${folder}freeze/lock.json`, 2_000_000),
  lock = JSON.parse(lockBytes);
assert.equal(sha(lockBytes), "1610696e449965b39cf1db1f0c25e53b2f69ee4c00d42b099b4ac42d97c4ea1f");
const summaryBytes = readBounded(`${folder}result/summary.json`, 2_000_000),
  summary = JSON.parse(summaryBytes);
assert.equal(sha(summaryBytes), "17afd7060475a3800a41c1e0580d6ee29b8bf0abcc961e4b5c4b67edbca57765");
assert.equal(summary.lockSha256, sha(lockBytes));
for (const [file, hash] of Object.entries({ ...lock.sources, ...lock.inputPins }))
  assert.equal(sha(readBounded(file, 4_000_000)), hash, `changed:${file}`);
const off = "work/off-hybrid-2026-11-13.AL8bSt/",
  old = "work/two-view-learning-2026-11-09.d0J4kb/";
const offLock = json(`${off}freeze/lock.json`),
  offResult = json(`${off}result/summary.json`);
const normalize = (values) => {
  assert.equal(values.length, 512);
  assert.ok(values.every(Number.isFinite));
  const length = Math.hypot(...values);
  assert.ok(length > 0);
  return values.map((n) => n / length);
};
let products = 0;
function cosine(a, b) {
  products++;
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += a[i] * b[i];
  return Math.max(-1, Math.min(1, sum));
}
const gallery = offLock.images
  .filter((row) => row.role === "gallery_self")
  .map((row) => ({
    ...row,
    vector: normalize(
      json(`${off}result/${row.blindId}-encoding.json`).observation.views[1].embedding,
    ),
  }));
const negative = lock.controlPlan
  .filter((row) => row.role === "calibration_only")
  .map((row) => ({
    id: row.id,
    vector: normalize(json(`${old}acquisition/raw/${row.id}.json`).raw.views[1].embedding),
  }));
assert.equal(negative.length, 40);
const gates = [];
for (const productId of [...new Set(gallery.map((row) => row.productId))]) {
  const refs = gallery.filter((row) => row.productId === productId);
  assert.equal(refs.length, 2);
  const positive = cosine(refs[0].vector, refs[1].vector);
  let hardest = -1;
  for (const n of negative)
    for (const r of refs) hardest = Math.max(hardest, cosine(n.vector, r.vector));
  const gate = Math.max(0.75, (positive + hardest) / 2, hardest + 0.05);
  const expected = summary.calibration.find((row) => row.productId === productId);
  assert.ok(Math.abs(expected.galleryMinimum - positive) < 1e-12);
  assert.ok(Math.abs(expected.maximumNegative - hardest) < 1e-12);
  assert.ok(Math.abs(expected.minimumCosine - gate) < 1e-12);
  gates.push({
    productId,
    refs,
    minimumCosine: gate,
    enabled: hardest + 0.05 <= positive && gate <= 1,
  });
}
const groupMap = offResult.guard.groups.map((group) => group.productIds);
const ids = (r) =>
  r.status === "candidate" ? [r.productId] : r.status === "ambiguous" ? r.productIds : [];
const keys = (r) => ({
  status: r.status,
  ...(r.status === "candidate"
    ? { productId: r.productId }
    : r.status === "ambiguous"
      ? { productIds: [...r.productIds].sort() }
      : {}),
});
const replay = [];
for (const row of summary.rows) {
  const isProduct = row.role === "product",
    source = isProduct ? offLock.images.find((x) => x.blindId === row.id) : null;
  if (isProduct) assert.equal(row.productId, source.productId);
  else assert.equal(row.role, lock.controlPlan.find((x) => x.id === row.id).role);
  const vector = normalize(
    isProduct
      ? json(`${off}result/${row.id}-encoding.json`).observation.views[1].embedding
      : json(`${old}acquisition/raw/${row.id}.json`).raw.views[1].embedding,
  );
  const ranked = gates
    .map((gate) => ({ ...gate, scores: gate.refs.map((r) => cosine(r.vector, vector)) }))
    .map((g) => ({ ...g, score: Math.max(...g.scores) }))
    .sort((a, b) => b.score - a.score);
  const winner = ranked[0],
    rivals = ranked.filter((r) => winner.score - r.score < 0.08);
  let embedding = { status: "unknown" };
  if (winner.score >= Math.min(...gates.map((g) => g.minimumCosine))) {
    if (rivals.length > 1)
      embedding = { status: "ambiguous", productIds: rivals.map((r) => r.productId).sort() };
    else if (
      winner.enabled &&
      winner.score >= winner.minimumCosine &&
      winner.scores.filter((score) => score >= winner.minimumCosine).length >= 2
    )
      embedding = { status: "candidate", productId: winner.productId };
  }
  assert.deepEqual(keys(row.calibratedEmbedding), keys(embedding), `embedding:${row.id}`);
  const pixel = isProduct
    ? offResult.rows.find((r) => r.blindId === row.id).pixel
    : { status: "unknown" };
  const conflicts = new Set([...ids(pixel), ...ids(embedding)]);
  for (const group of groupMap)
    if (group.some((id) => conflicts.has(id))) for (const id of group) conflicts.add(id);
  let fused;
  if (pixel.status === "ambiguous" || embedding.status === "ambiguous" || conflicts.size > 1)
    fused = { status: "ambiguous", productIds: [...conflicts].sort() };
  else if (embedding.status === "candidate") fused = embedding;
  else if (pixel.status === "candidate")
    fused = { status: "candidate", productId: pixel.productId };
  else fused = { status: "unknown" };
  assert.deepEqual(keys(row.calibrated), keys(fused), `fusion:${row.id}`);
  replay.push({
    id: row.id,
    role: row.role,
    status: fused.status,
    sourceAgreement: isProduct && fused.status === "candidate" && fused.productId === row.productId,
  });
}
assert.equal(replay.length, 44);
assert.equal(replay.filter((r) => r.sourceAgreement).length, 7);
assert.equal(replay.filter((r) => r.role !== "product" && r.status !== "unknown").length, 0);
assert.equal(summary.work.newModelCalls, 0);
assert.equal(summary.work.newImageCalls, 0);
assert.ok(fs.existsSync("work/calibrated-reference-v4-attempt.json"));
console.log(
  JSON.stringify({
    status: "passed",
    sourcePins: Object.keys(lock.sources).length,
    inputPins: Object.keys(lock.inputPins).length,
    separatelyRecomputedCalibrationStatistics: 4,
    separateArithmeticDecisionReplays: 44,
    cosineOperations: products,
    productSourceAgreements: 7,
    productAmbiguities: 5,
    controlUnknowns: 32,
    newImageCalls: 0,
    newEncoderCalls: 0,
    humanOrIndependentAccuracyReview: false,
  }),
);
