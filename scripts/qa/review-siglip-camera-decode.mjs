import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd());
const runs = process.argv.slice(2).map((arg) => path.resolve(root, arg));
assert.equal(runs.length, 2);
for (const run of runs) assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const [parent, diagnostic] = runs;
const device = path.join(diagnostic, "device-results-unlocked");
const receipt = JSON.parse(fs.readFileSync(path.join(device, "decode-results.json")));
assert.equal(receipt.run, path.basename(diagnostic));
assert.equal(receipt.predictions, 0);
assert.equal(receipt.rows.length, 4);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rows = Array.from({ length: 4 }, (_, i) => {
  const id = `commons-${i + 1}-clean`;
  const read = (dir) => {
    const file = path.join(dir, `${id}.f32`);
    assert(fs.realpathSync(file) === file && fs.lstatSync(file).isFile());
    assert.equal(fs.statSync(file).size, 3 * 224 * 224 * 4);
    return fs.readFileSync(file);
  };
  const mac = read(path.join(parent, "mac-jpeg-tensors")),
    phone = read(device);
  assert.equal(receipt.rows[i].id, id);
  assert.equal(receipt.rows[i].tensorSha256, hash(phone));
  let differentFloats = 0,
    maxAbs = 0;
  for (let j = 0; j < mac.length; j += 4) {
    const a = mac.readFloatLE(j),
      b = phone.readFloatLE(j);
    assert(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 1 && Math.abs(b) <= 1);
    const delta = Math.abs(a - b);
    if (delta !== 0) differentFloats++;
    maxAbs = Math.max(maxAbs, delta);
  }
  return {
    id,
    macSha256: hash(mac),
    phoneSha256: hash(phone),
    byteEqual: mac.equals(phone),
    differentFloats,
    maxAbs,
  };
});
console.log(
  JSON.stringify(
    {
      predictions: 0,
      rows,
      allTensorsEqual: rows.every((r) => r.byteEqual),
      causalModelAttributionVerified: false,
    },
    null,
    2,
  ),
);
