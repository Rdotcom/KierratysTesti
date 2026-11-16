import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const hash = (v) => createHash("sha256").update(v).digest("hex");
const raw = fs.readFileSync(path.join(run, "source.geojson"));
assert.equal(hash(raw), "06f01c77e411137447d9ddb13b3b50aebc3e1c21db7163c2ce8f988e68ae27ab");
const input = fs.readFileSync(path.join(run, "municipalities.json"));
assert.equal(hash(input), "ae4d173a531edb06aa17ac9db13d5a3818889b98cc0bebd0df7dce76cbbe34bd");
const data = JSON.parse(input);
assert.equal(data.municipalities.length, 308);
for (const m of data.municipalities)
  for (const p of m.polygons)
    for (const ring of p)
      for (const point of ring) {
        point[0] = Math.round(point[0] * 1e5) / 1e5;
        point[1] = Math.round(point[1] * 1e5) / 1e5;
      }
data.source.transform =
  "Coordinate quantization to five decimal degrees only; no vertex/ring removal";
const output = JSON.stringify(data),
  folder = path.join(root, "shared/recycling-engine/src/data");
if (!fs.existsSync(folder)) fs.mkdirSync(folder);
assert(fs.realpathSync(folder) === folder && !fs.lstatSync(folder).isSymbolicLink());
fs.writeFileSync(path.join(folder, "municipalities-2026.json"), output, { flag: "wx" });
console.log(JSON.stringify({ count: 308, bytes: Buffer.byteLength(output), sha256: hash(output) }));
