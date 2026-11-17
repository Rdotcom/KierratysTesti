// Scoped QA emulator only. Never selects or resets a personal Android device.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const root = fs.realpathSync(process.cwd());
const run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const sdk = path.join(run, "android-sdk");
assert(fs.realpathSync(sdk) === sdk);
const check = spawnSync(
  path.join(sdk, "platform-tools/adb"),
  ["-s", "emulator-5580", "shell", "getprop", "ro.kernel.qemu"],
  { encoding: "utf8", timeout: 10000 },
);
assert(check.status === 0 && check.stdout.trim() === "1", "isolated_emulator_required");
const args = process.argv.slice(3);
assert(args.length > 0);
const result = spawnSync(
  "agent-device",
  [...args, "--platform", "android", "--device", "KIG QA API35", "--session", "kig-android6"],
  {
    stdio: "inherit",
    timeout: 120000,
    env: {
      ...process.env,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      AGENT_DEVICE_STATE_DIR: path.join(run, "agent-device-state"),
      PATH: `${path.join(sdk, "platform-tools")}:${process.env.PATH}`,
    },
  },
);
process.exit(result.status ?? 1);
