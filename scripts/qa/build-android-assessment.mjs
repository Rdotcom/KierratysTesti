import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const sdk = path.join(run, "android-sdk"),
  java = path.join(run, "jdk/jdk-21.0.13+9/Contents/Home");
assert(fs.realpathSync(sdk) === sdk && fs.realpathSync(java) === java);
assert(fs.existsSync(path.join(sdk, "platforms/android-37.0/android.jar")));
const tasks = process.argv.slice(3);
assert(tasks.length > 0 && tasks.every((t) => /^[A-Za-z0-9:_-]+$/.test(t)));
const stem = `gradle-${tasks.join("-").replaceAll(":", "_")}-${Date.now()}`;
const log = fs.openSync(path.join(run, `${stem}.log`), "wx");
const child = spawn(
  "./gradlew",
  [
    ...tasks,
    "--no-daemon",
    "--max-workers=2",
    "-PreactNativeArchitectures=arm64-v8a",
    "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m",
    "-Dorg.gradle.parallel=false",
  ],
  {
    cwd: path.join(root, "mobile/app/android"),
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      JAVA_HOME: java,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      GRADLE_USER_HOME: path.join(run, "gradle-home"),
      EXPO_NO_DOTENV: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_APP_ENV: "development",
      EXPO_PUBLIC_API_BASE_URL: "http://192.168.10.42:3003",
    },
  },
);
let lowSpace = false;
const watch = setInterval(() => {
  const stat = fs.statfsSync(run);
  if (stat.bavail * stat.bsize < 1_200_000_000) {
    lowSpace = true;
    child.kill("SIGTERM");
  }
}, 5000);
const timeout = setTimeout(() => child.kill("SIGTERM"), 1800000);
const result = await new Promise((resolve) =>
  child.on("exit", (code, signal) => resolve({ code, signal, lowSpace })),
);
clearInterval(watch);
clearTimeout(timeout);
fs.closeSync(log);
fs.writeFileSync(path.join(run, `${stem}-process.json`), JSON.stringify(result, null, 2), {
  flag: "wx",
});
assert.equal(
  result.code,
  0,
  lowSpace
    ? "Stopped before disk exhaustion; no automatic broad cleanup"
    : "Android Gradle task failed; inspect retained log",
);
console.log(`PASS Android task: ${tasks.join(" ")}`);
