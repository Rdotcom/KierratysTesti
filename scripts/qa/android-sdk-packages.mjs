import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const java = path.join(run, "jdk/jdk-21.0.13+9/Contents/Home"),
  sdk = path.join(run, "android-sdk");
assert(fs.realpathSync(java) === java && fs.realpathSync(sdk) === sdk);
for (const name of [
  "platform-tools",
  "platforms/android-37.0",
  "build-tools/37.0.0",
  "ndk/27.1.12297006",
  "emulator",
  "system-images/android-35/default/arm64-v8a",
]) {
  assert(/^[A-Za-z0-9./-]+$/.test(name));
  console.log(`Installing only approved Android package: ${name}`);
  const result = spawnSync(
    path.join(sdk, "cmdline-tools/23.0/bin/android"),
    ["--no-metrics", "--sdk", sdk, "sdk", "install", name],
    {
      env: { ...process.env, JAVA_HOME: java },
      input: "y\n".repeat(30),
      encoding: "utf8",
      maxBuffer: 10000000,
      timeout: 600000,
    },
  );
  fs.writeFileSync(
    path.join(run, `sdk-install-${name.replaceAll("/", "-")}.log`),
    (result.stdout ?? "") + (result.stderr ?? ""),
  );
  assert.equal(result.status, 0, `sdk_package_failed:${name}`);
}
console.log("All six scoped SDK packages installed; no CLI metrics.");
