import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const parent = path.join(root, "work/siglip-camera-20261116.3p1Vc1");
const rows = JSON.parse(fs.readFileSync(path.join(parent, "jpeg-lineage.json")));
assert.equal(rows.length, 4);
const assets = path.join(run, "assets");
fs.mkdirSync(assets);
const pins = {};
for (const row of rows) {
  const file = path.resolve(root, row.file);
  assert(file.startsWith(`${parent}/jpeg-fixtures/`));
  assert.equal(hash(file), row.sha256);
  const target = path.join(assets, `${row.id}.jpg`);
  fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
  pins[path.relative(root, target)] = hash(target);
}
fs.writeFileSync(
  path.join(assets, "manifest.json"),
  JSON.stringify({
    run: path.basename(run),
    cases: rows.map((r) => ({ id: r.id, file: `${r.id}.jpg`, sha256: r.sha256 })),
  }),
  { flag: "wx" },
);
const dir = path.join(run, "SiglipValidation.xcodeproj");
fs.mkdirSync(dir);
let project = fs
  .readFileSync(path.join(root, "scripts/qa/siglip-device-project.pbxproj"), "utf8")
  .replaceAll("../../scripts/qa/siglip-device-host.swift", "../../scripts/qa/jpeg-diagnostic.swift")
  .replace(
    "SWIFT_VERSION = 5.9;",
    'SWIFT_VERSION = 6.0; SWIFT_ACTIVE_COMPILATION_CONDITIONS = "LOCAL_VISION_QA KIG_PINNED_JPEG"; SWIFT_OBJC_BRIDGING_HEADER = "../../mobile/app/modules/local-vision/ios/jpeg-decoder.h"; HEADER_SEARCH_PATHS = "$(SRCROOT)/../../mobile/app/modules/local-vision/ios/JpegDecoderAssets/include"; OTHER_LDFLAGS = "$(SRCROOT)/../../mobile/app/modules/local-vision/ios/JpegDecoderAssets/TurboJPEG.xcframework/ios-arm64/libturbojpeg.a";',
  );
const ref = "C00000000000000000000001",
  build = "C00000000000000000000002";
project = project
  .replace(
    "objects = {",
    `objects = {\n${ref} = {isa = PBXFileReference; lastKnownFileType = sourcecode.c.c; path = ../../mobile/app/modules/local-vision/ios/jpeg-decoder.c; sourceTree = SOURCE_ROOT;};\n${build} = {isa = PBXBuildFile; fileRef = ${ref};};`,
  )
  .replace(/(isa = PBXGroup; children = \()([^)]*)(\);)/u, (_, a, b, c) => `${a}${b},${ref}${c}`)
  .replace(
    /(isa = PBXSourcesBuildPhase;[^\n]+files = \()([^)]*)(\);)/u,
    (_, a, b, c) => `${a}${b},${build}${c}`,
  );
fs.writeFileSync(path.join(dir, "project.pbxproj"), project, { flag: "wx" });
fs.copyFileSync(
  path.join(root, "scripts/qa/siglip-device-info.plist"),
  path.join(run, "host-info.plist"),
  fs.constants.COPYFILE_EXCL,
);
for (const p of [
  "scripts/qa/jpeg-diagnostic.swift",
  "scripts/qa/stage-jpeg-diagnostic.mjs",
  "mobile/app/modules/local-vision/ios/siglip-image-encoder.swift",
  "mobile/app/modules/local-vision/ios/siglip-image-preprocessor.swift",
  "mobile/app/modules/local-vision/ios/jpeg-decoder.h",
  "mobile/app/modules/local-vision/ios/jpeg-decoder.c",
  "mobile/app/modules/local-vision/ios/JpegDecoderAssets/TurboJPEG.xcframework/ios-arm64/libturbojpeg.a",
  path.relative(root, path.join(dir, "project.pbxproj")),
  path.relative(root, path.join(assets, "manifest.json")),
  path.relative(root, path.join(run, "host-info.plist")),
])
  pins[p] = hash(path.join(root, p));
fs.writeFileSync(
  path.join(run, "native-lock.json"),
  JSON.stringify({ pins, predictionBudget: 0 }),
  { flag: "wx" },
);
console.log("Frozen two-policy JPEG diagnostic; zero model resources/predictions.");
