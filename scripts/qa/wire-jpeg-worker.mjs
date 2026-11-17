import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const lockPath = path.join(run, "native-lock.json");
const lock = JSON.parse(fs.readFileSync(lockPath));
for (const [p, h] of Object.entries(lock.pins)) assert.equal(hash(path.join(root, p)), h);
const project = path.join(run, "SiglipValidation.xcodeproj/project.pbxproj");
const before = fs.readFileSync(project, "utf8");
assert(!before.includes("KIG_PINNED_JPEG"));
fs.writeFileSync(path.join(run, "project-before-jpeg.pbxproj"), before, { flag: "wx" });
const ref = "C00000000000000000000001",
  build = "C00000000000000000000002";
const after = before
  .replace(
    "objects = {",
    `objects = {\n${ref} = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.c; path = ../../mobile/app/modules/local-vision/ios/jpeg-decoder.c; sourceTree = SOURCE_ROOT;};\n${build} = {isa = PBXBuildFile; fileRef = ${ref};};`,
  )
  .replace(/(isa = PBXGroup; children = \()([^)]*)(\);)/u, (_, a, b, c) => `${a}${b},${ref}${c}`)
  .replace(
    /(isa = PBXSourcesBuildPhase;[^\n]+files = \()([^)]*)(\);)/u,
    (_, a, b, c) => `${a}${b},${build}${c}`,
  )
  .replace(
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS = "LOCAL_VISION_QA";',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS = "LOCAL_VISION_QA KIG_PINNED_JPEG"; SWIFT_OBJC_BRIDGING_HEADER = "../../mobile/app/modules/local-vision/ios/jpeg-decoder.h"; HEADER_SEARCH_PATHS = "$(SRCROOT)/../../mobile/app/modules/local-vision/ios/JpegDecoderAssets/include"; OTHER_LDFLAGS = "$(SRCROOT)/../../mobile/app/modules/local-vision/ios/JpegDecoderAssets/TurboJPEG.xcframework/ios-arm64/libturbojpeg.a";',
  );
assert(after.includes("KIG_PINNED_JPEG"));
fs.writeFileSync(project, after);
for (const p of [
  path.relative(root, project),
  "scripts/qa/wire-jpeg-worker.mjs",
  "mobile/app/modules/local-vision/ios/jpeg-decoder.c",
  "mobile/app/modules/local-vision/ios/jpeg-decoder.h",
  "mobile/app/modules/local-vision/ios/JpegDecoderAssets/include/turbojpeg.h",
  "mobile/app/modules/local-vision/ios/JpegDecoderAssets/TurboJPEG.xcframework/ios-arm64/libturbojpeg.a",
  "scripts/qa/protocols/jpeg-repair-memory-protocol-2026-11-16.md",
])
  lock.pins[p] = hash(path.join(root, p));
assert(!fs.existsSync(path.join(run, "native-before-jpeg-lock.json")));
fs.renameSync(lockPath, path.join(run, "native-before-jpeg-lock.json"));
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2), { flag: "wx" });
console.log(
  "Pinned new JPEG C bridge/library before any worker prediction; original staging lock retained.",
);
