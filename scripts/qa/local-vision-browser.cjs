// Actual web UI, explicit unsupported-native path. No fake inference, camera image,
// user location, live product request or paid recognition call.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
if (!process.env.PLAYWRIGHT_MODULE_PATH || !process.env.BROWSER_EXECUTABLE_PATH)
  throw new Error("Set installed Playwright and browser paths.");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
const base = process.env.APP_QA_URL ?? "http://127.0.0.1:8095";
const evidence = path.resolve(
  process.env.APP_QA_EVIDENCE_DIR ?? "work/local-vision-browser-2026-11-03",
);
const overviewKey = "@kierratysappi/recycling-overview/v1";
fs.mkdirSync(evidence, { recursive: true });

async function storedRecycling(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, overviewKey);
}

async function inspect(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const issues = await page.evaluate(() => {
    const result = [];
    if (document.documentElement.scrollWidth > innerWidth) result.push("Page overflow");
    for (const el of document.querySelectorAll('[role="button"], [role="link"], input')) {
      if (el.closest('[aria-hidden="true"]')) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.width < 44 || b.height < 44)
        result.push(`Small control: ${el.getAttribute("aria-label")}`);
      if (b.left < -1 || b.right > innerWidth + 1)
        result.push(`Overflow: ${el.getAttribute("aria-label")}`);
    }
    return result;
  });
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
  assert.deepEqual(issues, [], name);
}

async function scaleText(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("div, span, input")) {
      if (
        ![...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
        )
      )
        continue;
      const style = getComputedStyle(el);
      el.style.fontSize = `${Number.parseFloat(style.fontSize) * 1.3}px`;
      if (style.lineHeight !== "normal")
        el.style.lineHeight = `${Number.parseFloat(style.lineHeight) * 1.3}px`;
    }
  });
}

async function main() {
  const { messages } = await import("../../mobile/localization/dist/index.js");
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    headless: true,
  });
  try {
    for (const language of ["fi", "en"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      const requests = [];
      const errors = [];
      await context.addInitScript((language) => {
        localStorage.setItem("@kierratysappi/language/v1", language);
        localStorage.setItem("@kierratysappi/history-enabled/v1", "false");
        window.qaCameraCalls = 0;
        window.qaGpsCalls = 0;
        if (navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia = () => {
            window.qaCameraCalls++;
            return Promise.reject(new Error("Unexpected camera request"));
          };
        }
        navigator.geolocation.getCurrentPosition = () => {
          window.qaGpsCalls++;
          throw new Error("Unexpected GPS request");
        };
        navigator.geolocation.watchPosition = () => {
          window.qaGpsCalls++;
          throw new Error("Unexpected GPS request");
        };
      }, language);
      await context.route("**/v1/**", (route) => {
        requests.push(new URL(route.request().url()).pathname);
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ status: "unavailable" }),
        });
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base);
      await page.getByTestId("home-screen").waitFor();
      await page.getByTestId(`language-${language}`).click();
      await page.getByTestId("home-identify-action").click();
      await page.getByTestId("identify-screen").waitFor();
      await page.getByTestId("identify-photo-action").focus();
      await page.getByTestId("identify-photo-action").press("Enter");
      await page.getByTestId("local-photo-screen").waitFor();
      assert.equal(new URL(page.url()).pathname, "/local-photo");
      assert.equal(await page.getByTestId("bottom-navigation").count(), 0);
      await page
        .getByRole("heading", {
          name: language === "fi" ? "Tunnista kuva laitteessa" : "Recognize an image on device",
          exact: true,
        })
        .waitFor();
      await page.getByTestId("local-photo-unavailable").waitFor();
      await page.getByTestId("local-photo-capture-guidance").waitFor();
      assert.equal(
        await page.getByTestId("local-photo-capture-guidance").innerText(),
        messages[language].offlineProductGuidance,
        "The current localized capture instructions must render; stale bundles cannot pass",
      );
      for (const key of ["localVisionIntro", "offlineProductScope", "objectCandidateIntro"]) {
        const text = messages[language][key];
        assert.equal(
          await page.getByText(text, { exact: true }).count(),
          1,
          `${language}/${key} must render current scope and uncertainty`,
        );
      }
      assert.equal(await page.getByTestId("local-photo-open-camera").count(), 0);
      assert.equal(await page.getByTestId("local-photo-recognize").count(), 0);
      assert.equal(await page.getByTestId("local-photo-object").count(), 0);
      assert.equal(await page.getByTestId("local-photo-retake").count(), 0);
      assert.equal(await page.getByTestId("local-photo-reset").count(), 0);
      assert.equal(await page.getByTestId("local-photo-cloud-action").count(), 0);
      const assertPassive = async () => {
        assert.deepEqual(requests, [], "Local entry/recovery must not request an API");
        assert.equal(await page.evaluate(() => window.qaCameraCalls), 0);
        assert.equal(await page.evaluate(() => window.qaGpsCalls), 0);
      };
      await assertPassive();
      // Unavailable or inconclusive local recognition has a useful barcode
      // recovery. Opening its permission explanation is not permission/capture.
      const barcodeRecovery = page.getByTestId("local-photo-barcode-action");
      await barcodeRecovery.focus();
      assert.notEqual(
        await barcodeRecovery.evaluate((el) => getComputedStyle(el).boxShadow),
        "none",
        "Barcode recovery keeps a visible keyboard-focus ring",
      );
      await barcodeRecovery.press("Enter");
      await page.getByTestId("scanner-permission-screen").waitFor();
      assert.equal(new URL(page.url()).pathname, "/scan");
      assert.equal(await page.getByTestId("scanner-camera").count(), 0);
      await assertPassive();
      await page.getByTestId("scanner-close-action").click();
      await page.getByTestId("local-photo-screen").waitFor();
      await page.getByTestId("local-photo-capture-guidance").waitFor();
      await page.getByTestId("local-photo-marking-action").focus();
      assert.notEqual(
        await page
          .getByTestId("local-photo-marking-action")
          .evaluate((el) => getComputedStyle(el).boxShadow),
        "none",
        "Manual recovery keeps a visible keyboard-focus ring",
      );
      await page.getByTestId("local-photo-marking-action").press("Enter");
      await page
        .getByRole("heading", {
          name: language === "fi" ? "Pakkauksen materiaalikoodi" : "Package material code",
          exact: true,
        })
        .waitFor();
      assert.equal(await page.locator('[data-testid^="sorting-result-"]').count(), 0);
      await page
        .getByRole("button", { name: language === "fi" ? "Takaisin" : "Back", exact: true })
        .click();
      await page.getByTestId("local-photo-screen").waitFor();

      // An explicit, named cloud entry opens its consent screen, not the camera
      // or a capability/upload request. Do not press its camera/send controls.
      await page.getByTestId("local-photo-cloud-action").click();
      await page.getByTestId("photo-screen").waitFor();
      await page.getByTestId("photo-open-camera").waitFor();
      await assertPassive();
      await page
        .getByRole("button", { name: language === "fi" ? "Takaisin" : "Back", exact: true })
        .click();
      await page.getByTestId("local-photo-screen").waitFor();

      for (const scheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.waitForFunction(
          (dark) =>
            getComputedStyle(document.querySelector('[data-testid="local-photo-screen"]'))
              .backgroundColor === (dark ? "rgb(20, 34, 27)" : "rgb(245, 252, 250)"),
          scheme === "dark",
        );
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          await inspect(page, `${language}-${scheme}-${width}`);
        }
        await page.setViewportSize({ width: 320, height: 844 });
        await scaleText(page);
        await inspect(page, `${language}-${scheme}-320-large`);
        // Reload resets synthetic font modifications without pretending native Dynamic Type.
        await page.reload();
        await page.getByTestId("local-photo-screen").waitFor();
      }
      await assertPassive();
      // This is a public-code navigation fixture, not OCR/inference evidence.
      // A suggested code only prefills: checking and comparison remain explicit.
      // Web cannot fabricate native OCR. Enter via the real local manual recovery,
      // then supply a public suggested code through the same public query boundary.
      await page.getByTestId("local-photo-marking-action").click();
      await page.waitForURL("**/material-code");
      await page.getByRole("textbox").waitFor();
      assert.equal(new URL(page.url()).pathname, "/material-code");
      assert.equal(await storedRecycling(page), null, "No automatic recycling record on recovery");
      await page.goto(`${base}/material-code?code=05%20PP`);
      const codeField = page.getByRole("textbox", {
        name: language === "fi" ? "Pakkauksessa näkyvä koodi" : "Code visible on the package",
        exact: true,
      });
      await codeField.waitFor();
      await page.waitForFunction((el) => el.value === "05 PP", await codeField.elementHandle());
      assert.equal(await codeField.inputValue(), "05 PP");
      const confirm = page.getByRole("button", {
        name:
          language === "fi" ? "Näen tämän koodin pakkauksessa" : "I see this code on the package",
        exact: true,
      });
      assert.equal(await confirm.count(), 0);
      assert.equal(await page.locator('[data-testid^="sorting-result-"]').count(), 0);
      assert.equal(await page.getByTestId("recycle-mark-action").count(), 0);
      assert.equal(await storedRecycling(page), null, "No automatic recycling record from prefill");
      const checkCode = page.getByRole("button", {
        name: language === "fi" ? "Tarkista koodi" : "Check code",
        exact: true,
      });
      assert.equal(await checkCode.isEnabled(), true, "Hydrated query enables explicit Check");
      await codeField.fill("");
      assert.equal(await checkCode.isEnabled(), false, "Editable empty code disables Check");
      await codeField.fill("05 PP");
      assert.equal(await checkCode.isEnabled(), true, "Typing enables Check without parsing");
      assert.equal(await confirm.count(), 0);
      await inspect(page, `${language}-material-prefill-editable`);
      await checkCode.click();
      assert.equal(await confirm.count(), 0);
      await page.locator('[data-testid^="sorting-result-"]').waitFor();
      await page.waitForFunction(() => {
        const heading = document.querySelector(
          '[data-testid="sorting-result-resolved"] [role="heading"]',
        );
        const rect = heading?.getBoundingClientRect();
        return rect && rect.top >= 0 && rect.bottom < innerHeight - 40;
      });
      assert.equal(await storedRecycling(page), null, "No automatic recycling record from Check");
      await inspect(page, `${language}-material-single-check`);
      await page.locator('[data-testid^="sorting-result-"]').waitFor();
      const mark = page.getByTestId("recycle-mark-action");
      await mark.waitFor();
      assert.equal(
        await storedRecycling(page),
        null,
        "Physical confirmation only enables recording",
      );
      await mark.click();
      await page.getByTestId("recycle-confirm-panel").waitFor();
      assert.equal(await storedRecycling(page), null, "Opening recycling confirmation is passive");
      await page.getByTestId("recycle-confirm-cancel").click();
      assert.equal(
        await storedRecycling(page),
        null,
        "Cancelled recording preserves empty storage",
      );
      await mark.click();
      await page.getByTestId("recycle-confirm-action").click();
      await page.waitForFunction(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.counts.plastic === 1,
        overviewKey,
      );
      const confirmedRecord = await storedRecycling(page);
      assert.equal(confirmedRecord.recent.length, 1);
      assert.equal(confirmedRecord.recent[0].quantity, 1);
      assert.equal(confirmedRecord.recent[0].material, "plastic");
      assert.equal(confirmedRecord.recent[0].label, "PP 5");
      assert.equal(
        Object.values(confirmedRecord.counts).reduce((sum, n) => sum + n, 0),
        1,
      );
      await page.getByTestId("recycle-overview-action").click();
      await page.getByTestId("overview-total").waitFor();
      await page.waitForFunction(
        () => document.querySelector('[data-testid="overview-total"]')?.textContent === "1",
      );
      assert.equal(await page.getByTestId("tab-settings").getAttribute("aria-selected"), "true");
      await inspect(page, `${language}-local-recovery-confirmed-overview`);
      await page.goto(`${base}/material-code?code=05%20PP&code=01%20PET`);
      await codeField.waitFor();
      assert.equal(await codeField.inputValue(), "");
      assert.equal(await confirm.count(), 0);
      assert.equal(await page.locator('[data-testid^="sorting-result-"]').count(), 0);
      assert.equal(await page.getByTestId("recycle-mark-action").count(), 0);
      assert.deepEqual(
        await storedRecycling(page),
        confirmedRecord,
        "Invalid prefill cannot mutate records",
      );
      await assertPassive();
      await page.goto(`${base}/legal`);
      await page
        .getByRole("heading", {
          name: language === "fi" ? "Tunnista kuva laitteessa" : "Recognize an image on device",
          exact: true,
        })
        .waitFor();
      assert.doesNotMatch(await page.locator("body").innerText(), /OpenAI/u);
      const localPrivacy = messages[language].localVisionPrivacy;
      assert.equal(await page.getByText(localPrivacy, { exact: true }).count(), 1);
      const modelAttribution = page.getByText(messages[language].localVisionModelAttribution, {
        exact: true,
      });
      assert.equal(await modelAttribution.count(), 1);
      await modelAttribution.scrollIntoViewIfNeeded();
      await inspect(page, `${language}-privacy-model-attribution`);
      assert.equal(
        await page.getByText(messages[language].networkConsent, { exact: true }).count(),
        1,
      );
      await page.getByTestId("privacy-delete-action").click();
      await page.getByTestId("privacy-delete-confirm-panel").waitFor();
      assert.deepEqual(await storedRecycling(page), confirmedRecord, "Opening deletion is passive");
      await inspect(page, `${language}-privacy-local-server-overview-deletion`);
      await page.getByTestId("privacy-delete-cancel").click();
      assert.equal(await page.getByTestId("privacy-delete-confirm-panel").count(), 0);
      assert.deepEqual(
        await storedRecycling(page),
        confirmedRecord,
        "Cancelling deletion retains records",
      );
      await inspect(page, `${language}-privacy-local-and-cloud`);
      await assertPassive();
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(
      "PASS: actual FI/EN web scope/uncertainty/cloud disclosures, unsupported-native recovery, no implicit API/camera/GPS, keyboard navigation, 44pt controls, dark/light 320/390/1280 and 130% synthetic text. Suggested code only prefills; one explicit Check reveals guidance in the viewport without a redundant confirmation. Recycling remains a separate cancel-safe confirmation with one stored record. Invalid query, local-image privacy, model attribution and cancel-safe deletion pass. Native capture and recognition accuracy are not verified here.",
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
