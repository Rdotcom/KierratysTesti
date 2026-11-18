import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const mobile = path.join(root, "mobile/app");
// Both children must see exactly the same explicit public configuration. Expo
// otherwise loads .env in its child only, leaving CSP unaware of those origins.
const env = { ...process.env, EXPO_NO_DOTENV: "1" };
for (const script of [
  [path.join(mobile, "node_modules/expo/bin/cli"), "export", "--platform", "web"],
  [path.join(root, "scripts/write-web-security-headers.mjs")],
]) {
  const result = spawnSync(process.execPath, script, { cwd: mobile, env, stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
