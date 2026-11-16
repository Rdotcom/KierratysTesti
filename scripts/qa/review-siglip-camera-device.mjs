import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assessCameraWorkerScores } from "./siglip-camera-parity.mjs";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]),
  parent = path.resolve(root, process.argv[3]);
for (const p of [run, parent]) assert(p.startsWith(`${root}/work/`) && fs.realpathSync(p) === p);
const read = (p) => JSON.parse(fs.readFileSync(p));
function hash(file) {
  assert(fs.realpathSync(file) === file && !fs.lstatSync(file).isSymbolicLink());
  const h = createHash("sha256"),
    f = fs.openSync(file, "r"),
    b = Buffer.alloc(1048576);
  try {
    for (;;) {
      const n = fs.readSync(f, b, 0, b.length, null);
      if (!n) break;
      h.update(b.subarray(0, n));
    }
  } finally {
    fs.closeSync(f);
  }
  return h.digest("hex");
}
const archive = read(path.join(parent, "source-archive/index.json"));
let pins = 0;
for (const name of ["native-lock.json", "worker-signed-lock.json"])
  for (const [p, h] of Object.entries(read(path.join(run, name)).pins)) {
    const old = archive.find((a) => a.original === p && a.sha256 === h),
      file = path.resolve(root, old?.archived ?? p);
    if (old) assert(file.startsWith(`${parent}/source-archive/`));
    assert.equal(hash(file), h, p);
    pins++;
  }
const actual = read(path.join(run, "device-results/worker-results.json")),
  manifest = read(path.join(run, "assets/manifest.json"));
assert.equal(actual.run, manifest.run);
assert.equal(read(path.join(run, "device-results/started.json")).run, manifest.run);
assert.equal(actual.rows.length, 4);
assert.equal(new Set(actual.rows.map((r) => r.id)).size, 4);
assert.deepEqual(
  read(path.join(run, "device-results/lifecycle.json")),
  read(path.join(parent, "lifecycle-v2.json")),
);
const original = read(path.join(root, "work/siglip-mobile-20261116.yV442u/baseline.json")),
  classes = read(path.join(root, "work/siglip-mobile-20261116.yV442u/lock.json")).classes;
const rows = actual.rows.map((row) => {
  assert(manifest.cases.some((c) => c.id === row.id));
  assert.deepEqual(row, read(path.join(run, `device-results/${row.id}.json`)));
  assert(Number.isFinite(row.durationMs) && row.durationMs >= 0);
  assert(Number.isSafeInteger(row.rssAfterBytes) && row.rssAfterBytes > 0);
  if (row.failure) return { id: row.id, passed: false, failure: row.failure };
  const observation = row.observation,
    mac = read(path.join(parent, `mac-worker/${row.id}.json`)),
    b = original.find((b) => b.id === row.id);
  assert.deepEqual(
    observation.scores.map((s) => s.kind),
    classes,
  );
  assert(
    observation.scores.every((s) => Number.isFinite(s.similarity) && Math.abs(s.similarity) <= 1),
  );
  for (const key of [
    "schemaVersion",
    "modelId",
    "modelRevision",
    "preprocessing",
    "verification",
    "confidence",
    "scope",
    "checkedOn",
  ])
    assert.equal(observation[key], mac[key]);
  const scores = observation.scores.map((s) => s.similarity),
    top1 = classes[scores.indexOf(Math.max(...scores))];
  const pngError = Math.max(...scores.map((x, i) => Math.abs(x - b.scores[i]))),
    macError = Math.max(...scores.map((x, i) => Math.abs(x - mac.scores[i].similarity)));
  return {
    id: row.id,
    top1,
    maxOriginalPngScoreError: pngError,
    maxMacWorkerScoreError: macError,
    durationMs: row.durationMs,
    rssBeforeBytes: row.rssBeforeBytes,
    rssAfterBytes: row.rssAfterBytes,
    ...assessCameraWorkerScores(classes, observation.scores, b, mac.scores),
  };
});
console.log(
  JSON.stringify(
    {
      pinsVerified: pins,
      lifecycleChecks: read(path.join(run, "device-results/lifecycle.json")).length,
      rows,
      passed: rows.every((r) => r.passed),
      registeredGatePassed: rows.every((r) => r.registeredGatePassed),
      strictMacDiagnosticPassed: rows.every((r) => r.strictMacDiagnosticPassed),
      generalAccuracyVerified: false,
      fixtureCameraCaptureVerified: false,
    },
    null,
    2,
  ),
);
