import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]),
  device = process.argv[3];
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
assert(/^[A-Za-z0-9-]{24,64}$/.test(device));
const app = path.join(run, "client12.app"),
  id = "fi.roopeaaltonen.kierratysappi";
function command(exe, args, input) {
  const r = spawnSync(exe, args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 4000000 });
  assert.equal(r.status, 0, `${path.basename(exe)}_failed`);
  return r.stdout;
}
const extract = (file, key) => command("/usr/bin/plutil", ["-extract", key, "raw", file]).trim();
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
assert.equal(extract(path.join(app, "Info.plist"), "CFBundleIdentifier"), id);
assert.equal(extract(path.join(app, "Info.plist"), "CFBundleVersion"), "12");
command("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
const frameworks = fs
  .readdirSync(path.join(app, "Frameworks"))
  .filter((n) => n.endsWith(".framework") || n.endsWith(".dylib"));
assert(frameworks.length > 0 && frameworks.length < 50);
for (const n of frameworks)
  command("/usr/bin/codesign", ["--verify", "--strict", path.join(app, "Frameworks", n)]);
const profile = command("/usr/bin/security", [
  "cms",
  "-D",
  "-i",
  path.join(app, "embedded.mobileprovision"),
]);
const field = (key, fmt = "json") =>
  command("/usr/bin/plutil", ["-extract", key, fmt, "-o", "-", "-"], profile);
const team = JSON.parse(field("TeamIdentifier"))[0],
  entitlements = JSON.parse(field("Entitlements"));
assert.equal(entitlements["application-identifier"], `${team}.${id}`);
assert(JSON.parse(field("ProvisionedDevices")).includes(device));
const expiry = field("ExpirationDate", "xml1").match(/<date>([^<]+)<\/date>/)?.[1];
assert(expiry && Date.parse(expiry) > Date.now());
const expected = JSON.parse(
  fs.readFileSync(path.join(root, "work/siglip-native-v2-20261116.fkWS2e/assets/manifest.json")),
);
const candidate = path.join(app, "KierratysSiglipCandidates.bundle");
for (const [p, h] of Object.entries(expected.modelFiles))
  assert.equal(hash(path.join(candidate, "vision-int8-block32.mlmodelc", p)), h);
assert.equal(
  hash(path.join(candidate, "prototypes.json")),
  "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21",
);
assert(
  ["model-apache2.txt", "Notices/model-apache2.txt"].some((name) => {
    const file = path.join(candidate, name);
    return fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 1000;
  }),
);
const js = fs.readFileSync(path.join(app, "main.jsbundle")),
  binary = fs.readFileSync(path.join(app, "KeepItGreen"));
assert.equal(js.subarray(0, 8).toString("hex"), "c61fbc03c103191f");
for (const marker of [
  "object-candidate-result",
  "recognizeObjectCandidates",
  "google-siglip2-base224-block32-v1",
  "recognizeProductEvidence",
  "offline-product-evidence-v1",
])
  assert(js.includes(Buffer.from(marker)), marker);
for (const marker of [
  "recognizeObjectCandidates",
  "cancelObjectCandidates",
  "recognizeProductEvidence",
])
  assert(binary.includes(Buffer.from(marker)), marker);
for (const marker of [
  "configureQAResources",
  "qaResourceURL",
  "object_pre_dispatch_cancel",
  "commons-1-clean",
  "SiglipValidationDelegate",
])
  assert(!js.includes(Buffer.from(marker)) && !binary.includes(Buffer.from(marker)), marker);
assert(
  !/sk-proj-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(
    js.toString("latin1"),
  ),
);
const prior = path.join(run, "rollback-client11.app"),
  legacy = "KierratysLocalVisionModels.bundle",
  pins = {};
function walk(dir, prefix = "") {
  for (const n of fs.readdirSync(dir)) {
    const file = path.join(dir, n),
      rel = prefix + n;
    assert(!fs.lstatSync(file).isSymbolicLink());
    if (fs.statSync(file).isDirectory()) walk(file, rel + "/");
    else {
      pins[rel] = hash(file);
    }
  }
}
walk(path.join(prior, legacy));
for (const [p, h] of Object.entries(pins))
  assert.equal(hash(path.join(app, legacy, p)), h, `legacy:${p}`);
const privacy = "KierratysLocalVisionPrivacy.bundle/PrivacyInfo.xcprivacy";
assert.equal(hash(path.join(app, privacy)), hash(path.join(prior, privacy)));
const result = {
  build: "12",
  version: "0.1.0",
  signature: true,
  embeddedSignatures: frameworks.length,
  profileAppDeviceBound: true,
  profileExpiresAt: expiry,
  candidateModelAndPrototypePins: true,
  legacyResourcePinsPreserved: Object.keys(pins).length,
  privacyUnchanged: true,
  embeddedJavaScript: true,
  newBridge: true,
  qaHooksAbsent: true,
  binarySha256: hash(path.join(app, "KeepItGreen")),
  hermesSha256: hash(path.join(app, "main.jsbundle")),
  cameraCaptureVerified: false,
};
fs.writeFileSync(path.join(run, "client12-verification.json"), JSON.stringify(result, null, 2), {
  flag: "wx",
});
console.log(JSON.stringify(result));
