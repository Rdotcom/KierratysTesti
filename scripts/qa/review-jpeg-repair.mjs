import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { assessCameraWorkerScores } from "./siglip-camera-parity.mjs";
const root = fs.realpathSync(process.cwd());
const [parent, run, decode] = process.argv.slice(2).map((v) => path.resolve(root, v));
for (const p of [parent, run, decode])
  assert(p.startsWith(`${root}/work/`) && fs.realpathSync(p) === p);
const read = (p) => JSON.parse(fs.readFileSync(p));
const resultsName = process.argv[5] ?? "device-results";
assert(/^[a-z-]+$/.test(resultsName));
const results = path.join(run, resultsName);
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
let pins = 0;
for (const p of [
  path.join(parent, "camera-lock.json"),
  path.join(run, "native-lock.json"),
  path.join(decode, "native-lock.json"),
])
  for (const [file, sha] of Object.entries(read(p).pins)) {
    assert.equal(hash(path.join(root, file)), sha, file);
    pins++;
  }
const platformRows = read(path.join(results, "worker-results.json"));
assert.equal(platformRows.run, path.basename(run));
assert.equal(platformRows.rows.length, 4);
assert.deepEqual(
  read(path.join(results, "lifecycle.json")),
  read(path.join(parent, "lifecycle-v2.json")),
);
const original = read(path.join(root, "work/siglip-mobile-20261116.yV442u/baseline.json"));
const classes = read(path.join(root, "work/siglip-mobile-20261116.yV442u/lock.json")).classes;
const macTensorReceipt = read(
  path.join(decode, "mac", path.basename(decode), "jpeg-diagnostic-results.json"),
);
const phoneTensorReceipt = read(path.join(decode, "phone/jpeg-diagnostic-results.json"));
assert.equal(macTensorReceipt.predictions, 0);
assert.equal(phoneTensorReceipt.predictions, 0);
assert.equal(macTensorReceipt.rows.length, 8);
assert.equal(phoneTensorReceipt.rows.length, 8);
const rows = platformRows.rows.map((row, index) => {
  const id = `commons-${index + 1}-clean`;
  assert.equal(row.id, id);
  assert.deepEqual(row, read(path.join(results, `${id}.json`)));
  assert.equal(row.failure, null);
  const mac = read(path.join(parent, `mac-worker/${id}.json`));
  assert.equal(read(path.join(parent, `mac-worker/${id}-process.json`)).status, 0);
  const a = path.join(decode, "mac", path.basename(decode), `${id}-pinned.f32`),
    b = path.join(decode, "phone", `${id}-pinned.f32`);
  assert.equal(fs.statSync(a).size, 602112);
  assert.equal(fs.statSync(b).size, 602112);
  assert.equal(
    hash(a),
    macTensorReceipt.rows.find((r) => r.id === id && r.mode === "pinned").sha256,
  );
  assert.equal(
    hash(b),
    phoneTensorReceipt.rows.find((r) => r.id === id && r.mode === "pinned").sha256,
  );
  assert.equal(
    row.observation.preprocessing,
    "siglip2-jpeg-turbo3.2.1-islow-nosimd-srgb-aa22-224-nchw-v2",
  );
  assert.equal(row.observation.preprocessing, mac.preprocessing);
  return {
    id,
    inputTensorByteEqual: hash(a) === hash(b),
    ...assessCameraWorkerScores(
      classes,
      row.observation.scores,
      original.find((r) => r.id === id),
      mac.scores,
    ),
  };
});
console.log(
  JSON.stringify(
    {
      pinsVerified: pins,
      rows,
      passed: rows.every((r) => r.passed && r.inputTensorByteEqual),
      lifecycleChecks: read(path.join(results, "lifecycle.json")).length,
      sourceAndLibraryPinsFrozenBeforeCalls: true,
      signedBinaryHashFrozenBeforeCalls: false,
      generalAccuracyVerified: false,
    },
    null,
    2,
  ),
);
