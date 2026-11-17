// Real web application controls, isolated browser storage and no private camera/GPS.
// This complements the real-model smoke, not a physical iPhone/Samsung assertion.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { translate } from "../../mobile/localization/dist/index.js";
import { isContainedPath } from "../lib/contained-path.mjs";

const root = fs.realpathSync(process.cwd());
const run = path.resolve(process.argv[2]);
assert(isContainedPath(path.join(root, "work"), run));
fs.mkdirSync(run, { recursive: true });
assert.equal(fs.realpathSync(run), run);
const base = process.env.WEB_AI_URL ?? "http://localhost:8097";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
    : {}),
});
const evidence = { platform: process.platform, browser: browser.version(), cases: [], errors: [] };
try {
  for (const [language, colorScheme, width] of [
    ["fi", "light", 390],
    ["en", "light", 390],
    ["fi", "dark", 320],
    ["en", "dark", 320],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      colorScheme,
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      (language) => localStorage.setItem("@kierratysappi/language/v1", language),
      language,
    );
    const page = await context.newPage();
    const get = (id) => page.getByTestId(id);
    const t = (key) => translate(language, key);
    page.on("pageerror", (error) => evidence.errors.push(error.message));
    let uploads = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/v1/recycling/object-image"))
        uploads++;
    });
    async function inspect(stage) {
      await page.evaluate(() => document.fonts.ready);
      const issues = await page.evaluate(() => {
        const issues = [];
        if (document.documentElement.scrollWidth > innerWidth + 1)
          issues.push("horizontal-page-overflow");
        for (const element of document.querySelectorAll(
          '[role="button"], [role="link"], input:not([type="file"])',
        )) {
          if (element.closest('[aria-hidden="true"]')) continue;
          const rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          if (rect.width < 44 || rect.height < 44)
            issues.push(`small-control:${element.getAttribute("aria-label")}`);
          if (rect.left < -1 || rect.right > innerWidth + 1)
            issues.push("horizontal-control-overflow");
        }
        return issues;
      });
      assert.deepEqual(issues, [], `${language}/${colorScheme}/${stage}`);
      await page.screenshot({
        path: path.join(run, `${language}-${colorScheme}-${stage}.png`),
        fullPage: true,
      });
      evidence.cases.push({ language, colorScheme, width, stage });
    }
    await page.goto(`${base}/`);
    await get("home-identify-action").click();
    await expect(get("identify-photo-action")).toContainText(t("identifyPhotoDetail"));
    await inspect("identify");
    await get("identify-scan-action").click();
    await expect(get("scanner-permission-screen")).toBeVisible();
    await get("scanner-permission-manual-action").click();
    await expect(get("manual-entry-screen")).toBeVisible();
    await get("manual-gtin-input").fill("123");
    await get("manual-submit-action").click();
    await expect(page.getByRole("alert")).toContainText(t("invalidGtin"));
    await get("manual-gtin-input").fill("6408430030309");
    await get("manual-submit-action").click();
    await expect(get("packaging-missing-result")).toBeVisible();
    await expect(get("product-result-screen")).toContainText("Oivariini");
    await inspect("barcode-result");
    await page.goto(`${base}/local-photo`);
    await expect(get("offline-product-manual-submit")).toBeDisabled();
    await inspect("photo-start");
    await get("recognition-details-toggle").click();
    await expect(get("recognition-details")).toContainText(t("recognitionMarkingManual"));
    await get("recognition-details-toggle").click();
    await expect(get("recognition-details")).toHaveCount(0);
    await get("offline-product-manual-input").fill("123");
    await get("offline-product-manual-submit").click();
    await expect(get("recognition-manual-error")).toBeVisible();
    await get("offline-product-manual-input").fill("6408430030309");
    await expect(get("recognition-manual-error")).toHaveCount(0);
    await get("offline-product-manual-submit").click();
    await expect(get("packaging-missing-result")).toBeVisible();
    await page.goto(`${base}/local-photo`);
    await get("recognition-material-code").click();
    await page.getByRole("textbox", { name: t("materialCodeLabel"), exact: true }).fill("05 PP");
    await page.getByRole("button", { name: t("materialCodeParseAction"), exact: true }).click();
    await expect(get("recycle-mark-action")).toBeVisible();
    await get("recycle-mark-action").click();
    await get("recycle-confirm-action").click();
    await inspect("material-recorded");
    await page.goto(`${base}/local-photo`);
    await get("recognition-component-action").click();
    await expect(page).toHaveURL(/\/component$/);
    await page.goto(`${base}/settings`);
    await get("settings-overview-action").click();
    await expect(get("overview-screen")).toBeVisible();
    await page.goto(`${base}/settings`);
    await get("settings-history-action").click();
    await expect(page).toHaveURL(/\/history$/);
    await page.goto(`${base}/settings`);
    await get("settings-guide-action").click();
    await expect(get("guide-screen")).toBeVisible();
    await page.goto(`${base}/settings`);
    await get("settings-legal-action").click();
    await expect(page).toHaveURL(/\/legal$/);
    await page.goto(`${base}/`);
    await get("tab-nearby").click();
    await expect(get("nearby-screen")).toBeVisible();
    await inspect("location-recovery");
    assert.equal(uploads, 0, "Navigation/manual actions must never send a photo");
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(run, "controls-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}
console.log(JSON.stringify(evidence, null, 2));
