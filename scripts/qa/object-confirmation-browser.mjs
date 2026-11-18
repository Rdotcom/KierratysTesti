// Deterministic UI/transport fixtures, NOT model accuracy evidence. Uses the real app.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { expect as baseExpect, chromium } from "@playwright/test";
import { isContainedPath } from "../lib/contained-path.mjs";

const expect = baseExpect.configure({ timeout: 20000 });
const root = fs.realpathSync(process.cwd());
const run = path.resolve(process.argv[2] ?? "work/object-confirmation-browser");
assert(isContainedPath(path.join(root, "work"), run));
fs.mkdirSync(run, { recursive: true });
assert.equal(fs.realpathSync(run), run);
const base = process.env.WEB_AI_URL ?? "http://localhost:8098";
const fixture = path.join(
  root,
  "mobile/app/modules/local-vision/android/src/androidTest/assets/parity/commons-2-clean.jpg",
);
const browser = await chromium.launch({
  headless: true,
  channel: process.env.WEB_AI_CHANNEL ?? "chrome",
});
const evidence = { fixtureOnly: true, cases: [], errors: [] };
try {
  for (const language of ["fi", "en"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      (lang) => localStorage.setItem("@kierratysappi/language/v1", lang),
      language,
    );
    let presentation = "confirm",
      focus = "single",
      requests = 0;
    await context.route("**/v1/recycling/object-image", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST,OPTIONS",
            "access-control-allow-headers": "content-type,accept",
          },
        });
        return;
      }
      requests++;
      assert.equal(
        route.request().headers().accept,
        "application/vnd.kierratysappi.object-suggestions.v2+json",
      );
      assert.equal(route.request().postDataJSON().consentVersion, "self-hosted-image-v1");
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        json: {
          status: "observed",
          observation: {
            focus,
            presentation,
            candidates: focus === "single" ? ["spoon", "fork", "knife", "cup"] : [],
            source: {
              modelId: "siglip2-server-onnx-weight-int8-v1",
              revision: "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2",
              preprocessing: "siglip2-server-pillow13-rgb-bilinear224-v1",
              checkedOn: "2026-11-16",
              observedAt: "2026-11-18T12:00:00.000Z",
              verification: "unverified",
              confidence: "uncalibrated",
              scope: "object_form_only",
              execution: "server",
            },
          },
        },
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => evidence.errors.push(error.message));
    async function recognize() {
      const before = requests;
      await page.goto(`${base}/local-photo`);
      await page.getByTestId("web-image-input").setInputFiles(fixture);
      assert.equal(requests, before, "preview does not upload");
      await page.getByTestId("local-photo-recognize").click();
      assert.equal(requests, before, "opening consent does not upload");
      await page.getByTestId("network-photo-send").click();
      await expect(page.getByTestId("object-candidate-title")).toBeVisible();
      assert.equal(requests, before + 1);
    }
    await recognize();
    await expect(page.getByTestId("object-candidate-title")).toHaveText(
      language === "fi" ? "Lusikka" : "Spoon",
    );
    await expect(page.getByTestId("object-confirm-yes")).toHaveText(
      language === "fi" ? "Kyllä, jatka" : "Yes, continue",
    );
    await expect(page.getByTestId("object-alternatives")).toHaveCount(0);
    await expect(page.getByTestId("object-sorting-flow")).toHaveCount(0);
    await page.screenshot({ path: path.join(run, `${language}-primary.png`), fullPage: true });
    await page.getByTestId("object-confirm-no").focus();
    await page.keyboard.press("Enter");
    assert.equal(requests, 1, "rejecting a suggestion does not upload or invoke a model again");
    await expect(page.getByTestId("object-alternatives")).toBeFocused();
    await expect(page.getByTestId("object-confirm-yes")).toHaveCount(0);
    await expect(page.getByTestId("object-choice-spoon")).toHaveCount(0);
    for (const kind of ["fork", "knife", "cup"])
      await expect(page.getByTestId(`object-choice-${kind}`)).toBeVisible();
    await expect(page.getByTestId("object-choice-none")).toBeVisible();
    await page.screenshot({ path: path.join(run, `${language}-alternatives.png`), fullPage: true });
    await page.getByTestId("object-choice-fork").click();
    await page.getByTestId("object-answer-material-metal").click();
    await expect(page.getByTestId("object-sorting-source").first()).toBeVisible();
    await page.getByTestId("object-sorting-change").click();
    await expect(page.getByTestId("object-alternatives")).toBeFocused();
    await page.getByTestId("object-choice-none").click();
    await expect(page).toHaveURL(/\/guide$/u);
    evidence.cases.push(
      `${language}: single → keyboard No → next three → material/source → change → none/guide`,
    );
    await recognize();
    await expect(page.getByTestId("object-confirm-yes")).toBeVisible();
    await page.getByTestId("object-confirm-yes").click();
    await expect(page.getByTestId("object-answer-material-metal")).toBeVisible();
    await page.getByTestId("object-sorting-back").click();
    await expect(page.getByTestId("object-confirm-yes")).toBeVisible();
    evidence.cases.push(
      `${language}: new image resets rejection; Yes requires material; change returns to confirmation`,
    );
    presentation = "alternatives";
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 700 });
    await recognize();
    await expect(page.getByTestId("object-confirm-yes")).toHaveCount(0);
    for (const kind of ["spoon", "fork", "knife"])
      await expect(page.getByTestId(`object-choice-${kind}`)).toBeVisible();
    await expect(page.getByTestId("object-choice-cup")).toHaveCount(0);
    await expect(page.getByTestId("object-choice-none")).toBeVisible();
    await page.screenshot({ path: path.join(run, `${language}-unclear-dark.png`), fullPage: true });
    evidence.cases.push(
      `${language}: unclear immediately shows three choices + none; dark/narrow/reduced motion`,
    );
    for (const next of ["multiple", "unknown"]) {
      focus = next;
      await recognize();
      await expect(page.getByTestId("object-confirm-yes")).toHaveCount(0);
      await expect(page.getByTestId("object-alternatives")).toHaveCount(0);
      await expect(page.getByTestId("object-candidate-guide")).toBeVisible();
    }
    evidence.cases.push(`${language}: unknown/multiple never force an object or sorting answer`);
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
} finally {
  await browser.close();
  fs.writeFileSync(path.join(run, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify(evidence, null, 2));
