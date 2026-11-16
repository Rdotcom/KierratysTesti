import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const target = path.join(root, "mobile/app/modules/local-vision/ios/MemoryProbeAssets");
assert(!fs.existsSync(target), "archive_previous_probe_assets_explicitly");
const source = path.join(
  root,
  "work/siglip-camera-20261116.3p1Vc1/jpeg-fixtures/commons-3-clean.jpg",
);
const bytes = fs.readFileSync(source),
  sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(sha256, "42b5de1f7b4880645efef9237399a9268ce54e6c8784fca11b3a98ed7d8edf71");
fs.mkdirSync(target);
fs.copyFileSync(source, path.join(target, "fixture.jpg"), fs.constants.COPYFILE_EXCL);
fs.writeFileSync(
  path.join(target, "manifest.json"),
  JSON.stringify({ run: path.basename(run), sha256 }),
  { flag: "wx" },
);
fs.copyFileSync(
  path.join(target, "manifest.json"),
  path.join(run, "manifest.json"),
  fs.constants.COPYFILE_EXCL,
);
console.log("Only pinned public spoon fixture staged for explicit QA-only actual-app probe.");
