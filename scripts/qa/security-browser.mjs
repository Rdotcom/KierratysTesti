// Actual production web export with enforced headers; attacks are bounded and local only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { expect as baseExpect, chromium } from "@playwright/test";
import { isContainedPath } from "../lib/contained-path.mjs";

const expect = baseExpect.configure({ timeout: 20000 });
const base = process.env.SECURITY_WEB_URL ?? "http://localhost:8099";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(process.argv[2] ?? "work/security-browser-proof");
assert(isContainedPath(path.join(root, "work"), run));
fs.mkdirSync(run, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const evidence = { actualProductionExport: true, cases: [], errors: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    window.__securityCalls = { camera: 0, location: 0 };
    window.__securityViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.__securityViolations.push(event.violatedDirective),
    );
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        window.__securityCalls.camera++;
        throw Error("camera_not_requested_in_test");
      };
    navigator.geolocation.getCurrentPosition = () => {
      window.__securityCalls.location++;
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  const response = await page.goto(base);
  assert.equal(response.status(), 200);
  assert.match(response.headers()["content-security-policy"], /frame-ancestors 'none'/u);
  assert.equal(response.headers()["x-frame-options"], "DENY");
  assert.equal(response.headers()["referrer-policy"], "no-referrer");
  await expect(page.getByTestId("home-search-input")).toBeVisible();
  await page.getByTestId("home-search-input").fill("kaukosäädin");
  await page.getByTestId("home-search-submit").click();
  await expect(page.getByTestId("object-sorting-heading")).toContainText("Sähkölaitteiden");
  await page.screenshot({ path: path.join(run, "secure-local-guide.png"), fullPage: true });
  assert.deepEqual(await page.evaluate(() => window.__securityViolations), []);
  evidence.cases.push(
    "Real export bootstraps and sourced local guidance works under CSP without unsafe-inline/eval scripts",
  );
  for (const route of ["/local-photo", "/nearby"]) {
    await page.goto(base + route);
    await expect(page.getByRole("heading").first()).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.__securityCalls), { camera: 0, location: 0 });
    assert.deepEqual(await page.evaluate(() => window.__securityViolations), []);
  }
  evidence.cases.push("Direct/deep-link opening does not activate camera or location");
  let outbound = 0;
  await context.route("https://attacker.example/**", async (route) => {
    outbound++;
    await route.abort();
  });
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__securityInjected = true";
    document.body.append(script);
    const image = new Image();
    image.src = "https://attacker.example/fixture-only";
    document.body.append(image);
  });
  await expect
    .poll(async () => page.evaluate(() => window.__securityViolations.length))
    .toBeGreaterThanOrEqual(2);
  assert.equal(await page.evaluate(() => window.__securityInjected), undefined);
  assert.equal(outbound, 0);
  evidence.cases.push(
    "Injected inline script and external tracking image are actually blocked by the browser",
  );
  for (const route of [
    "/.env",
    "/../package.json",
    "/%2e%2e%2fAGENTS.md",
    "/index.html.map",
    "/_headers",
  ]) {
    const result = await fetch(base + route);
    assert.equal(result.status, 404, route);
    assert.equal(await result.text(), "Unavailable");
  }
  evidence.cases.push(
    "Hidden files, traversal, source maps and header configuration are not served",
  );
  assert.deepEqual(evidence.errors, []);
  await context.close();
} finally {
  await browser.close();
  fs.writeFileSync(path.join(run, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify(evidence, null, 2));
