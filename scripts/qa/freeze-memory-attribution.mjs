import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const build = JSON.parse(fs.readFileSync(path.join(root, "mobile/app/app.json"))).expo.ios
  .buildNumber;
assert(/^\d{1,5}$/.test(build));
const app = path.join(run, `client${build}.app`);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" });
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const pins = {},
  archive = path.join(run, "source-archive");
fs.mkdirSync(archive);
for (const file of [
  "local-memory-probe.swift",
  "local-vision-engine.swift",
  "local-vision-module.swift",
  "mobileclip-predictor.swift",
  "siglip-object-predictor.swift",
  "siglip-image-encoder.swift",
  "siglip-image-preprocessor.swift",
  "jpeg-decoder.c",
  "jpeg-decoder.h",
  "KierratysLocalVision.podspec",
]) {
  const source = path.join(root, "mobile/app/modules/local-vision/ios", file),
    to = path.join(archive, file);
  fs.copyFileSync(source, to, fs.constants.COPYFILE_EXCL);
  pins[path.relative(root, to)] = hash(to);
}
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    assert(!fs.lstatSync(p).isSymbolicLink());
    if (fs.statSync(p).isDirectory()) walk(p);
    else pins[path.relative(root, p)] = hash(p);
  }
};
for (const file of [
  "mobile/app/src/app/local-photo.tsx",
  "mobile/app/src/features/camera/capture.ts",
]) {
  const to = path.join(archive, path.basename(file));
  fs.copyFileSync(path.join(root, file), to, fs.constants.COPYFILE_EXCL);
  pins[path.relative(root, to)] = hash(to);
}
walk(app);
const qa = path.join(app, "KierratysMemoryProbeAssets.bundle");
assert.equal(
  hash(path.join(qa, "fixture.jpg")),
  "42b5de1f7b4880645efef9237399a9268ce54e6c8784fca11b3a98ed7d8edf71",
);
assert.equal(JSON.parse(fs.readFileSync(path.join(qa, "manifest.json"))).run, path.basename(run));
assert(fs.readFileSync(path.join(app, "KeepItGreen")).includes(Buffer.from("--local-memory-qa")));
fs.writeFileSync(
  path.join(run, "pre-dispatch-lock.json"),
  JSON.stringify(
    {
      pins,
      signedArtifactFrozenBeforeCalls: true,
      input: "commons-3-clean",
      maximumImageForwards: 6,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  "Signed actual-app diagnostic, exact archived source and fixture/model resources frozen before dispatch.",
);
