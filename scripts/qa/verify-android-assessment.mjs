import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const sdk = path.join(run, "android-sdk"),
  java = path.join(run, "jdk/jdk-21.0.13+9/Contents/Home");
const apk = path.join(root, "mobile/app/android/app/build/outputs/apk/release/app-release.apk");
assert(fs.realpathSync(apk) === apk && fs.statSync(apk).isFile());
function command(exe, args, env = process.env) {
  const r = spawnSync(exe, args, { env, encoding: "utf8", timeout: 30000, maxBuffer: 8000000 });
  assert.equal(r.status, 0, `${path.basename(exe)} failed`);
  return r.stdout;
}
const badge = command(path.join(sdk, "build-tools/37.0.0/aapt2"), ["dump", "badging", apk]);
assert.match(badge, /name='fi\.roopeaaltonen\.kierratysappi' versionCode='7'/);
assert.match(badge, /minSdkVersion:'26'/);
for (const permission of [
  "RECORD_AUDIO",
  "ACCESS_BACKGROUND_LOCATION",
  "READ_EXTERNAL_STORAGE",
  "WRITE_EXTERNAL_STORAGE",
  "SYSTEM_ALERT_WINDOW",
])
  assert(!badge.includes(`android.permission.${permission}`), permission);
const signature = command(
  path.join(sdk, "build-tools/37.0.0/apksigner"),
  ["verify", "--verbose", apk],
  { ...process.env, JAVA_HOME: java },
);
assert.match(signature, /Verified using v2 scheme .*: true/);
command(path.join(sdk, "build-tools/37.0.0/zipalign"), ["-c", "-P", "16", "4", apk]);
const entries = command("/usr/bin/unzip", ["-Z1", apk]).trim().split("\n");
assert(entries.includes("assets/index.android.bundle"));
assert(entries.includes("lib/arm64-v8a/libonnxruntime.so"));
assert(
  !entries.some((p) => /commons-|synthetic-|parity\/|expected\.json|MemoryProbe|\.env/.test(p)),
);
assert(entries.filter((p) => p.startsWith("lib/")).every((p) => p.startsWith("lib/arm64-v8a/")));
let nativeLibraries = 0;
for (const entry of entries.filter((p) => p.startsWith("lib/") && p.endsWith(".so"))) {
  const result = spawnSync("/usr/bin/unzip", ["-p", apk, entry], {
    timeout: 30000,
    maxBuffer: 150_000_000,
  });
  assert.equal(result.status, 0);
  const elf = result.stdout;
  assert.equal(elf.subarray(0, 6).toString("hex"), "7f454c460201", "ELF64 little endian required");
  const offset = Number(elf.readBigUInt64LE(32)),
    stride = elf.readUInt16LE(54),
    count = elf.readUInt16LE(56);
  assert(stride >= 56 && count > 0 && offset + stride * count <= elf.length);
  let loads = 0;
  for (let i = 0; i < count; i++) {
    const header = offset + stride * i;
    if (elf.readUInt32LE(header) !== 1) continue;
    loads++;
    assert(elf.readBigUInt64LE(header + 48) >= 16384n, `ELF LOAD alignment:${entry}`);
  }
  assert(loads > 0);
  nativeLibraries++;
}
async function hashEntry(name) {
  const child = spawn("/usr/bin/unzip", ["-p", apk, name], { stdio: ["ignore", "pipe", "pipe"] }),
    hash = createHash("sha256");
  let bytes = 0;
  child.stdout.on("data", (chunk) => {
    bytes += chunk.length;
    hash.update(chunk);
  });
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0);
  return { sha256: hash.digest("hex"), bytes };
}
const model = await hashEntry("assets/siglip/vision-int8.onnx");
assert.equal(model.sha256, "d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b");
assert.equal(model.bytes, 95661204);
const prototypes = await hashEntry("assets/siglip/prototypes.json");
assert.equal(prototypes.sha256, "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21");
for (const name of ["LICENSE-APACHE2.txt", "pillow-mit-cmu.txt"])
  assert(entries.includes(`assets/siglip/${name}`));
const log = fs.readFileSync(path.join(run, "android-instrumentation-v4.log"), "utf8");
assert(log.includes("OK (1 test)") && !log.includes("FAILURES!!!"));
const native = JSON.parse(log.match(/kigAndroidEvidence=(\{[^\n]+\})/)?.[1] ?? "null");
assert(native?.jpegCases.length === 4 && native.materialMarking && native.gtinDecoded);
assert(native.jpegCases.every((row) => row.maxScoreError <= 0.005 && row.elapsedMs <= 12000));
const receipt = {
  version: "0.1.0",
  build: 7,
  minSdk: 26,
  targetSdk: 36,
  abi: "arm64-v8a",
  apkBytes: fs.statSync(apk).size,
  apkSha256: createHash("sha256").update(fs.readFileSync(apk)).digest("hex"),
  signature: true,
  signatureScope: "local Android development/test key, not store release",
  alignment16KiB: true,
  nativeElf16KiB: true,
  nativeLibraries,
  model,
  prototypes,
  testFixturesAbsent: true,
  blockedPermissionsAbsent: true,
  native,
  samsungPhysicalVerified: false,
};
fs.writeFileSync(
  path.join(run, "android7-final-release-verification-v2.json"),
  JSON.stringify(receipt, null, 2),
  { flag: "wx" },
);
console.log(JSON.stringify(receipt));
