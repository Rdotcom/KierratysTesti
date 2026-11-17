import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const receipt = JSON.parse(fs.readFileSync(path.join(run, "weight-only-receipt.json")));
assert(
  receipt.passes &&
    receipt.rows.length === 4 &&
    receipt.rows.every((r) => r.top1 === r.expectedTop1 && r.maxScoreError <= 0.005),
);
const source = path.join(run, "vision-weight-only-int8.onnx");
assert(
  fs.realpathSync(source) === source &&
    fs.statSync(source).isFile() &&
    fs.statSync(source).size === 95661204 &&
    fs.statSync(source).size < 100 * 1024 * 1024,
);
const sha = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
assert.equal(sha(source), "d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b");
const target = path.join(root, "mobile/app/modules/local-vision/android/src/main/assets/siglip");
fs.mkdirSync(target, { recursive: true });
for (const [from, name, expected] of [
  [source, "vision-int8.onnx", receipt.modelSha256],
  [
    path.join(root, "mobile/app/modules/local-vision/ios/SiglipCandidateAssets/prototypes.json"),
    "prototypes.json",
    "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21",
  ],
]) {
  assert.equal(sha(from), expected);
  const out = path.join(target, name);
  assert(!fs.existsSync(out));
  fs.copyFileSync(from, out, fs.constants.COPYFILE_EXCL);
  assert.equal(sha(out), expected);
}
const licence = path.join(
  root,
  "mobile/app/modules/local-vision/ios/SiglipCandidateAssets/Notices/model-apache2.txt",
);
assert(fs.statSync(licence).size > 1000);
fs.copyFileSync(licence, path.join(target, "LICENSE-APACHE2.txt"), fs.constants.COPYFILE_EXCL);
fs.copyFileSync(
  path.join(root, "mobile/app/modules/local-vision/ios/Resources/Notices/pillow-mit-cmu.txt"),
  path.join(target, "pillow-mit-cmu.txt"),
  fs.constants.COPYFILE_EXCL,
);
fs.writeFileSync(
  path.join(target, "manifest.json"),
  JSON.stringify(
    {
      schema: "android-siglip-assets-v1",
      source: "https://huggingface.co/google/siglip2-base-patch16-224",
      revision: receipt.sourceRevision,
      licence: "Apache-2.0",
      modelSha256: receipt.modelSha256,
      modelBytes: receipt.modelBytes,
      prototypesSha256: "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21",
      inference: "CPU-FP32-activation-weight-only-INT8-per-channel",
      quality: "four-development-input-parity-not-general-quality",
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  "Staged pinned Android model, unchanged prototypes and Apache2 notice; no test images.",
);
