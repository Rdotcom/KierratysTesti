import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isContainedPath } from "./lib/contained-path.mjs";
const root = fs.realpathSync(process.cwd()),
  out = path.resolve(process.argv[2] ?? "work/network-model");
assert(isContainedPath(path.join(root, "work"), out), "isolated_model_directory");
fs.mkdirSync(out, { recursive: true });
assert(fs.realpathSync(out) === out);
const source = path.join(root, "mobile/app/modules/local-vision/android/src/main/assets/siglip");
for (const [name, hash] of [
  ["vision-int8.onnx", "d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b"],
  ["prototypes.json", "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21"],
]) {
  const from = path.join(source, name);
  assert(fs.realpathSync(from) === from && fs.lstatSync(from).isFile());
  assert.equal(createHash("sha256").update(fs.readFileSync(from)).digest("hex"), hash);
  const to = path.join(out, name);
  assert(!fs.existsSync(to));
  fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
}
for (const name of ["LICENSE-APACHE2.txt", "pillow-mit-cmu.txt"]) {
  const from = path.join(source, name),
    to = path.join(out, name);
  assert(!fs.existsSync(to));
  fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
}
console.log("Pinned self-hosted assets staged; runtime never imports mobile code.");
