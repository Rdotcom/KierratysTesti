import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd());
const source = path.join(root, "work/siglip-native-v2-20261116.fkWS2e/assets");
const target = path.join(root, "mobile/app/modules/local-vision/ios/SiglipCandidateAssets");
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const manifest = JSON.parse(fs.readFileSync(path.join(source, "manifest.json")));
for (const [p, h] of Object.entries(manifest.modelFiles))
  assert.equal(hash(path.join(source, "vision-int8-block32.mlmodelc", p)), h);
const prototypes = path.join(root, "work/siglip-mobile-20261116.yV442u/text-prototypes.json");
assert.equal(hash(prototypes), "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21");
assert(!fs.existsSync(target), "staging_exists_refuse_overwrite");
fs.mkdirSync(target);
fs.cpSync(
  path.join(source, "vision-int8-block32.mlmodelc"),
  path.join(target, "vision-int8-block32.mlmodelc"),
  { recursive: true, errorOnExist: true, force: false },
);
fs.copyFileSync(prototypes, path.join(target, "prototypes.json"), fs.constants.COPYFILE_EXCL);
fs.mkdirSync(path.join(target, "Notices"));
fs.copyFileSync(
  path.join(source, "model-apache2.txt"),
  path.join(target, "Notices/model-apache2.txt"),
  fs.constants.COPYFILE_EXCL,
);
console.log(
  "Staged only pinned compiled image model/prototypes/licence, no source checkpoint or test images.",
);
