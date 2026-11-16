import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
// Device identifiers stay in private invocation receipts, never source control.
const device = process.argv[3];
assert(typeof device === "string" && /^[A-Za-z0-9-]{24,64}$/.test(device), "device_argument");
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const lock = JSON.parse(fs.readFileSync(path.join(run, "native-lock.json")));
for (const [p, h] of Object.entries(lock.pins))
  assert.equal(
    createHash("sha256")
      .update(fs.readFileSync(path.join(root, p)))
      .digest("hex"),
    h,
  );
// Read only public provisioning metadata; never retrieve a private key/secret.
const profile = execFileSync(
  "/usr/bin/security",
  [
    "cms",
    "-D",
    "-i",
    path.join(root, "work/ios-renewal-2026-11-16.XZmRUX/KeepItGreen.app/embedded.mobileprovision"),
  ],
  { maxBuffer: 4000000 },
);
const team = execFileSync(
  "/usr/bin/plutil",
  ["-extract", "TeamIdentifier.0", "raw", "-o", "-", "-"],
  {
    input: profile,
    maxBuffer: 4000000,
    encoding: "utf8",
  },
).trim();
assert(/^[A-Z0-9]{10}$/.test(team));
const log = fs.openSync(path.join(run, "device-build.log"), "wx");
const r = spawnSync(
  "/Applications/Xcode-beta.app/Contents/Developer/usr/bin/xcodebuild",
  [
    "-project",
    path.join(run, "SiglipValidation.xcodeproj"),
    "-scheme",
    "SiglipValidation",
    "-configuration",
    "Release",
    "-destination",
    `id=${device}`,
    "-derivedDataPath",
    path.join(run, "DerivedData"),
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    `DEVELOPMENT_TEAM=${team}`,
    "build",
  ],
  {
    cwd: root,
    stdio: ["ignore", log, log],
    timeout: 600000,
    env: { ...process.env, DEVELOPER_DIR: "/Applications/Xcode-beta.app/Contents/Developer" },
  },
);
fs.closeSync(log);
fs.writeFileSync(
  path.join(run, "device-build-process.json"),
  JSON.stringify({ status: r.status, signal: r.signal, errorCode: r.error?.code ?? null }),
  { flag: "wx" },
);
assert.equal(r.status, 0, "build_failed_receipt_retained");
console.log("Native test host built; current app untouched.");
