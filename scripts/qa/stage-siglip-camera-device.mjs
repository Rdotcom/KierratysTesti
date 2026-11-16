import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]),
  parent = path.resolve(root, process.argv[3]);
for (const p of [run, parent]) assert(p.startsWith(`${root}/work/`) && fs.realpathSync(p) === p);
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const lock = JSON.parse(fs.readFileSync(path.join(parent, "camera-lock.json")));
for (const [p, h] of Object.entries(lock.pins)) assert.equal(hash(path.join(root, p)), h);
const assets = path.join(run, "assets"),
  source = path.join(root, "mobile/app/modules/local-vision/ios/SiglipCandidateAssets");
fs.mkdirSync(assets);
for (const name of ["vision-int8-block32.mlmodelc", "prototypes.json", "Notices"])
  fs.cpSync(path.join(source, name), path.join(assets, name), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
fs.cpSync(
  path.join(parent, "client12.app/KierratysLocalVisionModels.bundle"),
  path.join(assets, "KierratysLocalVisionModels.bundle"),
  { recursive: true, errorOnExist: true, force: false },
);
for (const row of lock.rows)
  fs.copyFileSync(
    path.join(root, row.file),
    path.join(assets, `${row.id}.jpg`),
    fs.constants.COPYFILE_EXCL,
  );
fs.writeFileSync(
  path.join(assets, "manifest.json"),
  JSON.stringify(
    {
      run: path.basename(run),
      cases: lock.rows.map((r) => ({ id: r.id, file: `${r.id}.jpg`, sha256: r.sha256 })),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
const projectDir = path.join(run, "SiglipValidation.xcodeproj");
fs.mkdirSync(projectDir);
const projectFile = path.join(projectDir, "project.pbxproj");
let project = fs
  .readFileSync(path.join(root, "scripts/qa/siglip-device-project.pbxproj"), "utf8")
  .replaceAll(
    "../../scripts/qa/siglip-device-host.swift",
    "../../scripts/qa/siglip-camera-device-host.swift",
  );
const sources = [
  "local-vision-engine.swift",
  "mobileclip-predictor.swift",
  "siglip-object-predictor.swift",
];
const references = sources.map((_, i) => `B0000000000000000000000${i + 1}`);
const builds = sources.map((_, i) => `B0000000000000000000001${i + 1}`);
let entries = "";
sources.forEach((name, i) => {
  entries += `\n${references[i]} = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ../../mobile/app/modules/local-vision/ios/${name}; sourceTree = SOURCE_ROOT;};\n${builds[i]} = {isa = PBXBuildFile; fileRef = ${references[i]};};`;
});
// Extend our own already Xcode-validated minimal template, not third-party
// parser-specific section/comment conventions. IDs and additions are fixed.
assert(project.includes("objects = {") && project.includes("SWIFT_VERSION = 5.9;"));
project = project
  .replace("objects = {", `objects = {${entries}`)
  .replace(
    /children = \(([^)]+)\);/u,
    (_, items) => `children = (${items},${references.join(",")});`,
  )
  .replace(
    /(isa = PBXSourcesBuildPhase;[^\n]+files = \()([^)]*)(\);)/u,
    (_, prefix, items, end) => `${prefix}${items},${builds.join(",")}${end}`,
  )
  .replace(
    "SWIFT_VERSION = 5.9;",
    'SWIFT_VERSION = 5.9; SWIFT_ACTIVE_COMPILATION_CONDITIONS = "LOCAL_VISION_QA";',
  );
for (const id of references) assert.equal(project.split(id).length - 1, 3);
for (const id of builds) assert.equal(project.split(id).length - 1, 2);
fs.writeFileSync(projectFile, project, { flag: "wx" });
fs.copyFileSync(
  path.join(root, "scripts/qa/siglip-device-info.plist"),
  path.join(run, "host-info.plist"),
  fs.constants.COPYFILE_EXCL,
);
const pins = { ...lock.pins };
const walk = (dir) => {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    assert(!fs.lstatSync(p).isSymbolicLink());
    if (fs.statSync(p).isDirectory()) walk(p);
    else pins[path.relative(root, p)] = hash(p);
  }
};
walk(assets);
walk(projectDir);
pins[path.relative(root, path.join(run, "host-info.plist"))] = hash(
  path.join(run, "host-info.plist"),
);
for (const p of [
  "scripts/qa/siglip-camera-device-host.swift",
  "scripts/qa/stage-siglip-camera-device.mjs",
  "scripts/qa/siglip-native-build.mjs",
])
  pins[p] = hash(path.join(root, p));
fs.writeFileSync(path.join(run, "native-lock.json"), JSON.stringify({ pins }, null, 2), {
  flag: "wx",
});
console.log("Frozen actual-worker device host and four JPEGs;0device predictions.");
