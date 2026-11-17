// Portable Node launcher: no shell syntax/.cmd execution or service-key/.env loading.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { browserRecognitionRuntime } from "./lib/browser-recognition-runtime.mjs";
const root = fs.realpathSync(process.cwd()),
  runtime = browserRecognitionRuntime(root, process.env);
if (!fs.existsSync(runtime.python) || !fs.existsSync(path.join(runtime.assets, "vision-int8.onnx")))
  throw Error("Prepare the Python environment and model first: docs/final/BROWSER_AI.md");
const require = createRequire(path.join(root, "mobile/app/package.json")),
  expoManifest = require.resolve("expo/package.json");
const expo = JSON.parse(fs.readFileSync(expoManifest, "utf8"));
const expoCli = path.resolve(
  path.dirname(expoManifest),
  typeof expo.bin === "string" ? expo.bin : expo.bin.expo,
);
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () =>
      reject(
        Error(
          `Port ${port} is already used; keep the existing service intact or choose WEB_AI_PORT/SIGLIP_PORT.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
const children = [];
let closing = false;
function launch(args, options) {
  const child = spawn(process.execPath, args, {
    shell: false,
    windowsHide: true,
    stdio: "inherit",
    ...options,
  });
  children.push(child);
  child.once("error", () => void stop(1));
  child.once("exit", (code) => {
    if (!closing && code !== 0) void stop(1);
  });
  return child;
}
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of [...children].reverse()) if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => {
            const timer = setTimeout(resolve, 3000);
            child.once("close", () => {
              clearTimeout(timer);
              resolve();
            });
          }),
    ),
  );
  process.exitCode = code;
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
async function ready(url) {
  const deadline = Date.now() + 120000;
  while (!closing && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      /* Still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error("Recognition service/browser startup timed out");
}
try {
  await freePort(runtime.apiPort);
  await freePort(runtime.webPort);
  launch(["--import", "tsx", "src/siglip-server.ts"], {
    cwd: path.join(root, "backend/api"),
    env: {
      ...process.env,
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(runtime.apiPort),
      SIGLIP_PYTHON: runtime.python,
      SIGLIP_ASSETS: runtime.assets,
      SIGLIP_WEB_ORIGINS: `${runtime.webOrigin},http://127.0.0.1:${runtime.webPort}`,
    },
  });
  launch([expoCli, "start", "--web", "--localhost", "--port", String(runtime.webPort)], {
    cwd: path.join(root, "mobile/app"),
    env: {
      ...process.env,
      EXPO_PUBLIC_APP_ENV: "development",
      EXPO_PUBLIC_SIGLIP_BASE_URL: runtime.apiOrigin,
      EXPO_NO_DOTENV: "1",
      EXPO_NO_TELEMETRY: "1",
      BROWSER: "none",
    },
  });
  await Promise.all([
    ready(runtime.apiOrigin + "/v1/recycling/object-image-capabilities"),
    ready(runtime.webOrigin + "/local-photo"),
  ]);
  console.log(
    `Browser recognition ready: ${runtime.webOrigin}/local-photo (Ctrl-C stops both services)`,
  );
  if (process.argv.includes("--test")) {
    const test = launch(
      ["scripts/qa/browser-ai-smoke.mjs", process.env.WEB_AI_EVIDENCE ?? "work/browser-ai-proof"],
      { cwd: root, env: { ...process.env, WEB_AI_URL: runtime.webOrigin } },
    );
    const code = await new Promise((resolve) => test.once("close", resolve));
    await stop(code ?? 1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Browser recognition failed");
  await stop(1);
}
