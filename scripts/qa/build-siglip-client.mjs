import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const origin = new URL(process.argv[3]);
assert(
  ["http:", "https:"].includes(origin.protocol) &&
    !origin.username &&
    !origin.password &&
    !origin.search &&
    !origin.hash &&
    origin.pathname === "/",
);
const build = JSON.parse(fs.readFileSync(path.join(root, "mobile/app/app.json"))).expo.ios
  .buildNumber;
assert(/^\d{1,5}$/.test(build));
const prior = path.resolve(
  root,
  process.argv[4] ?? "work/ios-renewal-2026-11-16.XZmRUX/KeepItGreen.app",
);
assert(prior.startsWith(`${root}/work/`) && fs.realpathSync(prior) === prior);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", prior], { stdio: "pipe" });
const backup = path.join(run, "rollback-prior.app");
assert(!fs.existsSync(backup));
execFileSync("/bin/cp", ["-cR", prior, backup]);
const profile = execFileSync(
  "/usr/bin/security",
  ["cms", "-D", "-i", path.join(prior, "embedded.mobileprovision")],
  { maxBuffer: 4000000 },
);
const team = execFileSync(
  "/usr/bin/plutil",
  ["-extract", "TeamIdentifier.0", "raw", "-o", "-", "-"],
  { input: profile, encoding: "utf8" },
).trim();
assert(/^[A-Z0-9]{10}$/.test(team));
// Reuse current build cache, never remove/clean it or upgrade dependencies.
const derived = path.join(root, "work/native-reference-ports-2026-11-14.P5tYhw/DerivedData");
assert(fs.realpathSync(derived) === derived);
const log = fs.openSync(path.join(run, `client${build}-build.log`), "wx");
const r = spawnSync(
  "/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild",
  [
    "-workspace",
    "mobile/app/ios/KeepItGreen.xcworkspace",
    "-scheme",
    "KeepItGreen",
    "-configuration",
    "Release",
    "-sdk",
    "iphoneos",
    "-destination",
    "generic/platform=iOS",
    "-derivedDataPath",
    derived,
    "-jobs",
    "2",
    "-hideShellScriptEnvironment",
    "-allowProvisioningUpdates",
    `DEVELOPMENT_TEAM=${team}`,
    "CODE_SIGN_STYLE=Automatic",
    "CODE_SIGN_IDENTITY=Apple Development",
    "COMPILER_INDEX_STORE_ENABLE=NO",
    "build",
  ],
  {
    cwd: root,
    timeout: 1200000,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      DEVELOPER_DIR: "/Applications/Xcode.app/Contents/Developer",
      EXPO_NO_DOTENV: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_APP_ENV: "development",
      EXPO_PUBLIC_API_BASE_URL: origin.origin,
    },
  },
);
fs.closeSync(log);
fs.writeFileSync(
  path.join(run, `client${build}-build-process.json`),
  JSON.stringify({ status: r.status, signal: r.signal, errorCode: r.error?.code ?? null }),
  { flag: "wx" },
);
assert.equal(r.status, 0, "native_build_failed_retained");
const app = path.join(derived, "Build/Products/Release-iphoneos/KeepItGreen.app"),
  out = path.join(run, `client${build}.app`);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" });
assert(!fs.existsSync(out));
execFileSync("/bin/cp", ["-cR", app, out]);
console.log(`Signed client${build} preserved; verify before replacement installation.`);
