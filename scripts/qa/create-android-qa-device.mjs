import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const sdk = path.join(run, "android-sdk"),
  java = path.join(run, "jdk/jdk-21.0.13+9/Contents/Home"),
  avds = path.join(run, "avds"),
  device = path.join(avds, "kig-api35.avd");
assert(fs.realpathSync(sdk) === sdk && fs.realpathSync(java) === java && !fs.existsSync(device));
fs.mkdirSync(avds, { recursive: true });
const result = spawnSync(
  path.join(sdk, "cmdline-tools/23.0/bin/avdmanager"),
  [
    "create",
    "avd",
    "--name",
    "KIG_QA_API35",
    "--path",
    device,
    "--package",
    "system-images;android-35;default;arm64-v8a",
    "--device",
    "pixel_5",
  ],
  {
    env: {
      ...process.env,
      JAVA_HOME: java,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      ANDROID_AVD_HOME: avds,
    },
    input: "no\n",
    encoding: "utf8",
    timeout: 120000,
  },
);
fs.writeFileSync(path.join(run, "create-avd.log"), (result.stdout ?? "") + (result.stderr ?? ""), {
  flag: "wx",
});
assert.equal(result.status, 0, "avd_creation_failed");
const config = path.join(device, "config.ini");
let text = fs.readFileSync(config, "utf8");
for (const [k, v] of Object.entries({
  "hw.ramSize": "3072",
  "disk.dataPartition.size": "1536M",
  "hw.keyboard": "yes",
  "hw.camera.back": "virtualscene",
  "hw.camera.front": "none",
  showDeviceFrame: "no",
})) {
  text =
    text
      .split("\n")
      .filter((line) => !line.startsWith(`${k}=`) && !line.startsWith(`${k} =`))
      .join("\n") + `\n${k}=${v}\n`;
}
fs.writeFileSync(config, text);
console.log(
  "Created new isolated ARM64 Android15/API35 QA emulator; no existing device data changed.",
);
