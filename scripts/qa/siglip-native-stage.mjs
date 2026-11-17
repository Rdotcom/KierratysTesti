import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const parent = path.join(root, "work/siglip-mobile-20261116.yV442u");
const read = (p) => JSON.parse(fs.readFileSync(p));
function hash(p) {
  assert(fs.realpathSync(p) === p && fs.lstatSync(p).isFile());
  const h = createHash("sha256"),
    fd = fs.openSync(p, "r"),
    b = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, b, 0, b.length, null);
      if (!n) break;
      h.update(b.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}
const pins = {};
const pin = (p) => {
  pins[path.relative(root, p)] = hash(p);
};
const walk = (dir, visit) => {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    assert(!fs.lstatSync(p).isSymbolicLink());
    if (fs.statSync(p).isDirectory()) walk(p, visit);
    else visit(p);
  }
};
assert.equal(
  hash(path.join(parent, "block-lock.json")),
  "d2ace54bc4e2681184210793a2b11ce9424b8491b326e2305c175b704590a859",
);
for (const [p, h] of Object.entries(read(path.join(parent, "block/export-pins.json"))))
  assert.equal(hash(path.join(root, p)), h);
const assets = path.join(run, "assets");
fs.mkdirSync(assets);
const compiled = path.join(parent, "xcode-coreml-compiled/vision-int8-block32.mlmodelc");
walk(compiled, pin);
fs.cpSync(compiled, path.join(assets, "vision-int8-block32.mlmodelc"), {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const modelFiles = {};
walk(path.join(assets, "vision-int8-block32.mlmodelc"), (p) => {
  modelFiles[path.relative(path.join(assets, "vision-int8-block32.mlmodelc"), p)] = hash(p);
});
const lock = read(path.join(parent, "lock.json")),
  cases = [];
for (const row of lock.rows) {
  assert(/^commons-[1-4]-clean$/.test(row.id));
  const image = path.join(root, row.file),
    tensor = path.join(run, `${row.id}.f32`);
  assert.equal(hash(image), row.imageSha256);
  const npy = fs.readFileSync(path.join(parent, `${row.id}-input.npy`));
  assert.equal(npy.subarray(0, 6).toString("latin1"), "\x93NUMPY");
  assert.equal(npy[6], 1);
  const header = npy.subarray(10, 10 + npy.readUInt16LE(8)).toString("ascii");
  assert(
    header.includes("'<f4'") && header.includes("False") && header.includes("(1, 3, 224, 224)"),
  );
  assert.deepEqual(
    fs.readFileSync(tensor),
    npy.subarray(10 + npy.readUInt16LE(8)),
    "native_input_must_be_byte_exact",
  );
  fs.copyFileSync(image, path.join(assets, `${row.id}.png`), fs.constants.COPYFILE_EXCL);
  const prefix = row.id.replace("-clean", "");
  for (const suffix of ["source", "receipt"])
    fs.copyFileSync(
      path.join(root, `work/object-clean-20261116.oaxGJU/dataset/${prefix}-${suffix}.json`),
      path.join(assets, `${prefix}-${suffix}.json`),
      fs.constants.COPYFILE_EXCL,
    );
  cases.push({ id: row.id, imageSha256: row.imageSha256, tensorSha256: hash(tensor) });
  pin(image);
  pin(tensor);
  pin(path.join(parent, `${row.id}-input.npy`));
}
fs.copyFileSync(
  path.join(root, "mobile/app/modules/local-vision/ios/Resources/Notices/pillow-mit-cmu.txt"),
  path.join(assets, "pillow-mit-cmu.txt"),
  fs.constants.COPYFILE_EXCL,
);
const apache = fs.readFileSync(
  path.join(
    root,
    "work/dinov2-comparison-2026-11-15.gkByIM/venv/lib/python3.12/site-packages/transformers-5.23.0.dist-info/licenses/LICENSE",
  ),
  "utf8",
);
assert(apache.includes("Version 2.0, January 2004"));
fs.writeFileSync(
  path.join(assets, "model-apache2.txt"),
  "Google SigLIP2 Base patch16 224; revision75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2.\nhttps://huggingface.co/google/siglip2-base-patch16-224\nOffline image-only block32 conversion; original weights unchanged before quantization.\n\nApache License" +
    apache.split("Apache License").slice(1).join("Apache License"),
  { flag: "wx" },
);
fs.writeFileSync(
  path.join(assets, "manifest.json"),
  JSON.stringify({ run: path.basename(run), cases, modelFiles }, null, 2),
  { flag: "wx" },
);
const project = path.join(run, "SiglipValidation.xcodeproj");
fs.copyFileSync(
  path.join(root, "scripts/qa/siglip-device-info.plist"),
  path.join(run, "host-info.plist"),
  fs.constants.COPYFILE_EXCL,
);
pin(path.join(run, "host-info.plist"));
fs.mkdirSync(project);
fs.copyFileSync(
  path.join(root, "scripts/qa/siglip-device-project.pbxproj"),
  path.join(project, "project.pbxproj"),
  fs.constants.COPYFILE_EXCL,
);
for (const p of [
  "mobile/app/modules/local-vision/ios/siglip-image-preprocessor.swift",
  "mobile/app/modules/local-vision/ios/siglip-image-encoder.swift",
  "mobile/app/modules/local-vision/ios/Resources/Notices/pillow-mit-cmu.txt",
  "scripts/qa/siglip-device-host.swift",
  "scripts/qa/siglip-device-project.pbxproj",
  "scripts/qa/siglip-device-info.plist",
  "scripts/qa/siglip-native-stage.mjs",
  "scripts/qa/siglip-native-main.swift",
  "scripts/qa/siglip-preprocessor-tests.swift",
  "scripts/qa/protocols/siglip-native-device-protocol-2026-11-16.md",
])
  pin(path.join(root, p));
for (const p of ["native-qa", "preprocessor-tests"]) pin(path.join(run, p));
for (const p of ["baseline.json", "text-prototypes.json", "block/results.json", "block-lock.json"])
  pin(path.join(parent, p));
walk(assets, pin);
walk(project, pin);
fs.writeFileSync(
  path.join(run, "native-lock.json"),
  JSON.stringify(
    { version: "siglip-native-device-v1", pins, cases, networkClient: false },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(`Staged4byte-exact native inputs, ${Object.keys(pins).length} pins;0newmodelcalls.`);
