import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]),
  parent = path.resolve(root, process.argv[3]);
for (const p of [run, parent]) assert(p.startsWith(`${root}/work/`) && fs.realpathSync(p) === p);
const rows = JSON.parse(fs.readFileSync(path.join(parent, "jpeg-lineage.json"))),
  pins = {};
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const assets = path.join(run, "assets");
fs.mkdirSync(assets);
for (const row of rows) {
  assert.equal(hash(path.join(root, row.file)), row.sha256);
  const to = path.join(assets, `${row.id}.jpg`);
  fs.copyFileSync(path.join(root, row.file), to, fs.constants.COPYFILE_EXCL);
  pins[path.relative(root, to)] = hash(to);
}
fs.writeFileSync(
  path.join(assets, "manifest.json"),
  JSON.stringify(
    {
      run: path.basename(run),
      cases: rows.map((r) => ({ id: r.id, file: `${r.id}.jpg`, sha256: r.sha256 })),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
const dir = path.join(run, "SiglipValidation.xcodeproj");
fs.mkdirSync(dir);
fs.writeFileSync(
  path.join(dir, "project.pbxproj"),
  fs
    .readFileSync(path.join(root, "scripts/qa/siglip-device-project.pbxproj"), "utf8")
    .replaceAll(
      "../../scripts/qa/siglip-device-host.swift",
      "../../scripts/qa/siglip-camera-decode-device.swift",
    ),
  { flag: "wx" },
);
fs.copyFileSync(
  path.join(root, "scripts/qa/siglip-device-info.plist"),
  path.join(run, "host-info.plist"),
  fs.constants.COPYFILE_EXCL,
);
for (const p of [
  "scripts/qa/siglip-camera-decode-device.swift",
  "scripts/qa/stage-siglip-camera-decode.mjs",
  "mobile/app/modules/local-vision/ios/siglip-image-encoder.swift",
  "mobile/app/modules/local-vision/ios/siglip-image-preprocessor.swift",
])
  pins[p] = hash(path.join(root, p));
for (const p of [
  "host-info.plist",
  "assets/manifest.json",
  "SiglipValidation.xcodeproj/project.pbxproj",
])
  pins[path.relative(root, path.join(run, p))] = hash(path.join(run, p));
fs.writeFileSync(
  path.join(run, "native-lock.json"),
  JSON.stringify({ pins, predictionBudget: 0 }, null, 2),
  { flag: "wx" },
);
console.log("Decoder-only host frozen, no model assets or prediction budget.");
