import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (file) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
test("scheduled dependency audits use the same fail-closed policy as CI", () => {
  const workflow = read(".github/workflows/security.yml");
  assert.match(workflow, /dependency-audit:[\s\S]*?github.event_name == 'schedule'/u);
  assert.match(workflow, /pnpm install --frozen-lockfile[\s\S]*?pnpm security:audit/u);
});
test("native builds explicitly override arbitrary-load defaults and disable unused OTA delivery", () => {
  const config = JSON.parse(read("mobile/app/app.json")).expo;
  assert.equal(config.android.allowBackup, false);
  assert.equal(config.updates.enabled, false);
  assert.equal(config.updates.checkAutomatically, "NEVER");
  assert.ok(config.plugins.includes("./plugins/with-security-boundaries.cjs"));
  const plugin = read("mobile/app/plugins/with-security-boundaries.cjs");
  assert.match(plugin, /EXPO_PUBLIC_APP_ENV === "development"/u);
  assert.match(plugin, /NSAllowsArbitraryLoads: development/u);
  assert.match(plugin, /"android:usesCleartextTraffic"\] = development \? "true" : "false"/u);
});
test("schema validation is bootstrapped without JIT before Router to retain strict CSP", () => {
  const pkg = JSON.parse(read("mobile/app/package.json"));
  assert.equal(pkg.main, "index.ts");
  const entry = read("mobile/app/index.ts");
  assert.ok(entry.indexOf('"./src/security-bootstrap"') < entry.indexOf('"expo-router/entry"'));
  assert.match(read("mobile/app/src/security-bootstrap.ts"), /z\.config\(\{ jitless: true \}\)/u);
});
test("every external app URL opening passes through the guarded boundary", () => {
  function visit(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? visit(file) : [file];
    });
  }
  const root = fileURLToPath(new URL("../../mobile/app/src/", import.meta.url));
  const files = visit(root).filter(
    (file) => /\.tsx?$/u.test(file) && !file.includes("__tests__") && !file.includes(".test."),
  );
  const direct = files.filter((file) => fs.readFileSync(file, "utf8").includes("Linking.openURL("));
  assert.equal(direct.length, 1);
  assert.ok(direct[0].endsWith(path.join("features", "security", "external-links.ts")));
  assert.match(
    read("mobile/app/src/features/scan/api.ts"),
    /readBoundedJson\(response, 1_000_000\)/u,
  );
  assert.doesNotMatch(read("mobile/app/src/features/scan/api.ts"), /response\.json\(\)/u);
});
