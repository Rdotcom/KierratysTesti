const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
if (!modulePath || !executablePath) throw new Error("Set installed browser and Playwright paths.");
const { chromium } = require(modulePath);
const base = process.env.APP_QA_URL ?? "http://127.0.0.1:8110";
const evidence = path.resolve(process.env.APP_QA_EVIDENCE_DIR ?? "work/overview-qa");
const storageKey = "@kierratysappi/recycling-overview/v1";
// Valid synthetic test code absent from the offline product catalogue.
const gtin = "1234567890128";
fs.mkdirSync(evidence, { recursive: true });

const provenance = {
  sourceId: "qa-only",
  sourceName: "QA fixture provider",
  sourceRecordId: gtin,
  sourceUrl: "https://example.test/overview-fixture",
  retrievedAt: "2026-10-30T12:00:00.000Z",
  confidence: 0.65,
  verificationStatus: "mock",
  license: {
    id: "qa-only",
    name: "QA-only fixture",
    url: "https://example.test/license",
    attributionText: "Not real product data",
    shareAlike: false,
  },
};
const observed = (value) => ({ value, provenance });
const part = (id, material) => ({
  id,
  packagingStatus: observed("packaging"),
  materialFamily: observed(material),
  shape: observed("other"),
  conditions: { hazardousResidue: "unknown", pressurized: "unknown", emptied: "unknown" },
});
const plastic = part("qa-plastic", "plastic");
const unknown = part("qa-unknown", "unknown");
const ambiguous = part("qa-ambiguous", "glass");
const confidence = { tier: "medium", score: 0.65, reasons: ["QA fixture"] };
const trace = { evaluatedBranches: ["qa"], decisiveFields: ["materialFamily"] };
const rule = {
  id: "qa-rule",
  version: "qa-only-v1",
  jurisdiction: "FI",
  sourceName: "QA rule fixture",
  sourceUrl: "https://example.test/rule",
  checkedAt: "2026-10-08",
  effectiveFrom: "2026-10-08",
  verificationStatus: "verified",
};
const resolved = {
  status: "resolved",
  gtin,
  product: {
    gtin,
    name: observed("QA fixture — three parts"),
    packagingCompleteness: observed("partial"),
    packagingComponents: [plastic, unknown, ambiguous],
  },
  provider: { id: "qa-only", name: "QA fixture provider" },
  cache: {
    hit: false,
    storedAt: "2026-10-30T12:00:00.000Z",
    expiresAt: "2026-10-30T18:00:00.000Z",
  },
  components: [
    {
      observation: plastic,
      sorting: {
        status: "resolved",
        componentId: plastic.id,
        confidence,
        trace,
        destination: {
          id: "plastic_packaging",
          label: { fi: "QA — muovinkeräys", en: "QA — plastic collection" },
        },
        preparation: { fi: "QA-valmistelu", en: "QA preparation" },
        explanation: { fi: "QA-selitys, ei oikea ohje", en: "QA explanation, not real guidance" },
        exceptions: [],
        rule,
      },
    },
    {
      observation: unknown,
      sorting: {
        status: "unknown",
        componentId: unknown.id,
        confidence: { tier: "unknown", score: 0, reasons: ["QA fixture"] },
        trace,
        reason: "material_missing",
        nextAction: { fi: "QA — tarkista osa", en: "QA — check the part" },
        sources: [],
      },
    },
    {
      observation: ambiguous,
      sorting: {
        status: "ambiguous",
        reason: "deposit_status_unknown",
        componentId: ambiguous.id,
        confidence,
        trace,
        question: { fi: "QA — tarkista panttimerkki", en: "QA — check the deposit mark" },
        candidateDestinations: ["deposit_return", "glass_packaging"],
        sources: [rule],
      },
    },
  ],
};
const estimate = {
  status: "observed",
  observation: {
    focus: "single",
    candidates: ["jar"],
    source: {
      modelId: "siglip2-server-onnx-weight-int8-v1",
      revision: "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2",
      preprocessing: "siglip2-server-pillow13-rgb-bilinear224-v1",
      checkedOn: "2026-11-16",
      observedAt: "2026-11-17T12:00:00.000Z",
      verification: "unverified",
      confidence: "uncalibrated",
      scope: "object_form_only",
      execution: "server",
    },
  },
};
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};
const get = (page, id) =>
  id.startsWith("recycle-")
    ? page
        .getByTestId("sorting-result-resolved")
        .locator("..")
        .getByTestId(id)
        .or(page.getByTestId("object-sorting-flow").getByTestId(id))
    : page.getByTestId(id);

async function stored(page) {
  return page.evaluate((key) => {
    const value = window.overviewRawGetItem(key);
    return value ? JSON.parse(value) : null;
  }, storageKey);
}

async function total(page, expected) {
  await get(page, "overview-total").waitFor();
  await page.waitForFunction(
    (value) =>
      document.querySelector('[data-testid="overview-total"]')?.textContent === String(value),
    expected,
  );
}

async function open(page, route, id) {
  await page.goto(base + route, { waitUntil: "networkidle" });
  await get(page, id).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function add(page, material, quantity, expected, label = "") {
  await get(page, `overview-material-${material}`).click();
  await get(page, "overview-quantity-input").fill(String(quantity));
  await get(page, "overview-label-input").fill(label);
  await get(page, "overview-add-action").click();
  await total(page, expected);
}

async function clear(page) {
  await get(page, "overview-clear-action").click();
  await get(page, "overview-confirm-panel").waitFor();
  await get(page, "overview-confirm-action").click();
  await total(page, 0);
}

async function layout(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("div,input")]
      .filter((element) => {
        if (element.closest('[aria-hidden="true"]')) return false;
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.left < -1 || box.right > innerWidth + 1);
      })
      .map((element) => element.textContent.slice(0, 80)),
  );
  assert.deepEqual(overflow, [], name);
  for (const id of [
    "overview-material-plastic",
    "overview-material-composite",
    "overview-add-action",
  ]) {
    const box = await get(page, id).boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `${id} touch target`);
  }
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
}

async function largeText(page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const elements = new Set();
    while (walker.nextNode())
      if (walker.currentNode.textContent.trim()) elements.add(walker.currentNode.parentElement);
    for (const element of elements) {
      const style = getComputedStyle(element);
      const font = parseFloat(style.fontSize);
      const line = parseFloat(style.lineHeight);
      element.style.fontSize = `${font * 1.3}px`;
      element.style.lineHeight = `${(Number.isFinite(line) ? line : font * 1.4) * 1.3}px`;
    }
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    for (const language of ["fi", "en"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
        permissions: ["camera"],
      });
      await context.addInitScript((lang) => {
        if (!localStorage.getItem("@kierratysappi/language/v1"))
          localStorage.setItem("@kierratysappi/language/v1", lang);
        const original = Storage.prototype.setItem;
        const originalGet = Storage.prototype.getItem;
        window.overviewRawGetItem = (key) => originalGet.call(localStorage, key);
        Storage.prototype.getItem = function (key) {
          if (window.overviewFailReads && key === "@kierratysappi/recycling-overview/v1")
            throw new DOMException("QA storage read unavailable", "InvalidStateError");
          return originalGet.call(this, key);
        };
        Storage.prototype.setItem = function (key, value) {
          if (key === "@kierratysappi/recycling-overview/v1")
            window.overviewWriteAttempts = (window.overviewWriteAttempts ?? 0) + 1;
          if (window.overviewFailWrites && key === "@kierratysappi/recycling-overview/v1")
            throw new DOMException("QA storage quota", "QuotaExceededError");
          if (window.overviewCommitThenFail && key === "@kierratysappi/recycling-overview/v1") {
            original.call(this, key, value);
            window.overviewCommitThenFail = false;
            window.overviewFailReads = Boolean(window.overviewBlockReadAfterCommit);
            throw new DOMException("QA committed write acknowledgement lost", "InvalidStateError");
          }
          return original.call(this, key, value);
        };
      }, language);
      let lookups = 0;
      let photos = 0;
      await context.route("**/v1/recycling/lookup", async (route) => {
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers: cors });
        lookups++;
        assert.equal(route.request().postDataJSON().gtin, gtin);
        return route.fulfill({ headers: cors, json: resolved });
      });
      await context.route("**/v1/recycling/object-image-capabilities", (route) =>
        route.fulfill({
          headers: cors,
          json: {
            enabled: true,
            consentVersion: "self-hosted-image-v1",
            modelId: "siglip2-server-onnx-weight-int8-v1",
            execution: "server",
            retention: "memory-only",
            maxImageBytes: 1500000,
          },
        }),
      );
      await context.route("**/v1/recycling/object-image", async (route) => {
        if (route.request().method() === "OPTIONS")
          return route.fulfill({ status: 204, headers: cors });
        photos++;
        assert.equal(route.request().postDataJSON().consentVersion, "self-hosted-image-v1");
        return route.fulfill({ headers: cors, json: estimate });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await open(page, "/", "home-overview-action");
      await get(page, "home-overview-action").click();
      await total(page, 0);
      assert.equal(await get(page, "overview-empty").count(), 1);
      assert.equal(await get(page, "overview-add-action").getAttribute("aria-disabled"), "true");
      assert.equal(await get(page, "tab-settings").getAttribute("aria-selected"), "true");
      assert.equal(await get(page, "bottom-navigation").getByRole("tab").count(), 4);
      assert.equal(await stored(page), null);
      assert.equal(lookups, 0);
      assert.equal(photos, 0);
      await layout(page, `${language}-empty-390`);

      await open(page, "/manual", "manual-gtin-input");
      await get(page, "manual-gtin-input").fill(gtin);
      await get(page, "manual-submit-action").click();
      await get(page, "product-result-screen").waitFor();
      await get(page, "recycle-mark-action").waitFor({ state: "visible" });
      assert.equal(await get(page, "recycle-mark-action").count(), 1);
      assert.equal(await get(page, "sorting-result-unknown").count(), 1);
      assert.equal(await get(page, "sorting-result-ambiguous").count(), 1);
      assert.equal(await stored(page), null, "A lookup does not record recycling");
      assert.ok(
        (await get(page, "sorting-result-resolved").innerText()).includes("QA rule fixture"),
      );
      await get(page, "recycle-mark-action").click();
      await get(page, "recycle-confirm-panel").waitFor();
      await get(page, "recycle-confirm-cancel").click();
      assert.equal(await stored(page), null, "Cancelled confirmation does not record recycling");
      await get(page, "recycle-mark-action").click();
      await get(page, "recycle-confirm-action").click();
      await page.waitForFunction(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.counts.plastic === 1,
        storageKey,
      );
      await get(page, "recycle-mark-action").waitFor({ state: "hidden" });
      await get(page, "recycle-overview-action").click();
      await total(page, 1);
      await page.goBack({ waitUntil: "networkidle" });
      await get(page, "product-result-screen").waitFor();
      await get(page, "recycle-mark-action").waitFor({ state: "hidden" });
      assert.equal(
        await get(page, "recycle-mark-action").count(),
        0,
        "Current part is already recorded",
      );
      assert.equal((await stored(page)).counts.plastic, 1);
      await get(page, "result-scan-another-action").click();
      await get(page, "home-manual-action").click();
      await get(page, "manual-gtin-input").fill(gtin);
      await get(page, "manual-submit-action").click();
      await get(page, "product-result-screen").waitFor();
      await get(page, "recycle-mark-action").click();
      await get(page, "recycle-confirm-action").click();
      await page.waitForFunction(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.counts.plastic === 2,
        storageKey,
      );
      await get(page, "recycle-overview-action").click();
      await total(page, 2);
      await clear(page);
      process.stdout.write(`${language}: explicit result recording and session identity passed.\n`);

      await page.evaluate(() => {
        window.overviewWriteAttempts = 0;
        window.overviewCommitThenFail = true;
      });
      await add(page, "metal", 1, 1, "QA acknowledged once");
      assert.equal(await page.evaluate(() => window.overviewWriteAttempts), 1);
      assert.equal((await stored(page)).recent.length, 1);
      assert.equal(await get(page, "overview-label-input").inputValue(), "");
      assert.equal(await get(page, "overview-save-unconfirmed").count(), 0);
      await clear(page);

      await get(page, "overview-material-wood").click();
      await get(page, "overview-quantity-input").fill("2");
      await get(page, "overview-label-input").fill("QA pending intent");
      await page.evaluate(() => {
        window.overviewWriteAttempts = 0;
        window.overviewCommitThenFail = true;
        window.overviewBlockReadAfterCommit = true;
      });
      await get(page, "overview-add-action").click();
      await get(page, "overview-save-unconfirmed").waitFor();
      assert.equal((await stored(page)).counts.wood, 2, "The first write really committed");
      assert.equal(await get(page, "overview-label-input").isEditable(), false);
      assert.equal(await get(page, "overview-quantity-input").isEditable(), false);
      assert.equal(
        await get(page, "overview-material-metal").getAttribute("aria-disabled"),
        "true",
      );
      await assert.rejects(
        get(page, "overview-label-input").fill("QA changed label", { timeout: 250 }),
      );
      await assert.rejects(get(page, "overview-quantity-input").fill("7", { timeout: 250 }));
      await get(page, "overview-material-metal").click({ force: true });
      assert.equal(await get(page, "overview-material-wood").getAttribute("aria-checked"), "true");
      assert.equal(await get(page, "overview-label-input").inputValue(), "QA pending intent");
      await page.evaluate(() => {
        window.overviewFailReads = false;
        window.overviewBlockReadAfterCommit = false;
      });
      await get(page, "overview-add-action").click();
      await total(page, 2);
      const reconciled = await stored(page);
      assert.equal(reconciled.counts.wood, 2);
      assert.equal(reconciled.recent.length, 1);
      assert.equal(
        await page.evaluate(() => window.overviewWriteAttempts),
        1,
        "Retry performs no second committed write",
      );
      assert.equal(await get(page, "overview-save-unconfirmed").count(), 0);
      assert.equal(await get(page, "overview-label-input").inputValue(), "");
      await clear(page);

      await get(page, "overview-material-wood").click();
      await get(page, "overview-label-input").fill("QA pending clear");
      await page.evaluate(() => {
        window.overviewCommitThenFail = true;
        window.overviewBlockReadAfterCommit = true;
      });
      await get(page, "overview-add-action").click();
      await get(page, "overview-save-unconfirmed").waitFor();
      await clear(page);
      await page.evaluate(() => {
        window.overviewFailReads = false;
        window.overviewBlockReadAfterCommit = false;
      });
      assert.equal(await stored(page), null);
      assert.equal(await get(page, "overview-label-input").isEditable(), true);
      assert.equal(await get(page, "overview-label-input").inputValue(), "");
      assert.equal(await get(page, "overview-quantity-input").inputValue(), "1");
      await add(page, "metal", 1, 1, "QA after confirmed clear");
      assert.equal(
        (await stored(page)).counts.wood,
        0,
        "Clearing cannot resurrect the old pending entry",
      );
      await clear(page);
      process.stdout.write(
        `${language}: acknowledgement loss, locked edits, stable retry and confirmed-clear recovery passed.\n`,
      );

      await get(page, "overview-material-plastic").click();
      await get(page, "overview-quantity-input").fill("0");
      assert.equal(await get(page, "overview-add-action").getAttribute("aria-disabled"), "true");
      await add(page, "plastic", 3, 3, "QA plastic parts");
      await add(page, "glass", 1, 4, "QA glass jar");
      assert.equal(await get(page, "overview-percent-plastic").innerText(), "75%");
      assert.equal(await get(page, "overview-percent-glass").innerText(), "25%");
      await page.reload({ waitUntil: "networkidle" });
      await total(page, 4);
      const another = await context.newPage();
      await open(another, "/overview", "overview-total");
      await total(another, 4);
      await another.close();
      await add(page, "paper", 1, 5);
      await add(page, "carton", 1, 6);
      assert.equal(await get(page, "overview-row-paper").count(), 1);
      assert.equal(await get(page, "overview-row-carton").count(), 1);
      const percentages = await page
        .locator('[data-testid^="overview-percent-"]')
        .allTextContents();
      assert.equal(
        percentages.reduce((sum, value) => sum + parseInt(value, 10), 0),
        100,
      );
      const beforeFailure = await stored(page);
      await page.evaluate(() => {
        window.overviewFailWrites = true;
      });
      await get(page, "overview-material-glass").click();
      await get(page, "overview-quantity-input").fill("2");
      await get(page, "overview-add-action").click();
      await page.getByRole("alert").waitFor();
      await total(page, 6);
      assert.deepEqual(
        await stored(page),
        beforeFailure,
        "A failed write must not alter stored totals",
      );
      await page.evaluate(() => {
        window.overviewFailWrites = false;
      });
      await get(page, "overview-add-action").click();
      await total(page, 8);
      const restored = await stored(page);
      assert.equal(restored.counts.glass, 3, "Retry stores the intended quantity once");
      const latest = restored.recent[0];
      await get(page, `overview-remove-${latest.id}`).click();
      await get(page, "overview-confirm-cancel").click();
      await total(page, 8);
      await get(page, `overview-remove-${latest.id}`).click();
      await get(page, "overview-confirm-action").click();
      await total(page, 6);

      process.stdout.write(
        `${language}: persistence, percentages, failed-write retry and removal passed.\n`,
      );
      await page.evaluate(() => {
        localStorage.setItem("@kierratysappi/history-enabled/v1", "true");
        localStorage.setItem("@kierratysappi/history/v1", "[]");
      });
      await open(page, "/history", "bottom-navigation");
      await page
        .getByRole("button", {
          name:
            language === "fi"
              ? "Lopeta tallennus ja tyhjennä historia"
              : "Stop saving and clear history",
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () =>
          localStorage.getItem("@kierratysappi/history-enabled/v1") === "false" &&
          localStorage.getItem("@kierratysappi/history/v1") === null,
      );
      assert.equal(
        (await stored(page)).counts.plastic,
        3,
        "History opt-out retains explicit recycling records",
      );
      await open(page, "/settings", "settings-overview-action");
      await get(page, "settings-overview-action").click();
      await total(page, 6);
      for (const width of [390, 320, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await layout(page, `${language}-overview-${width}`);
      }
      await page.setViewportSize({ width: 320, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(
        () =>
          getComputedStyle(document.getElementById("app-screen-surface")).backgroundColor ===
          "rgb(20, 34, 27)",
      );
      await largeText(page);
      await layout(page, `${language}-overview-dark-320-large`);
      await page.reload({ waitUntil: "networkidle" });
      await total(page, 6);
      await page.emulateMedia({ colorScheme: "light" });
      await page.setViewportSize({ width: 390, height: 844 });
      await get(page, "overview-clear-action").click();
      await get(page, "overview-confirm-cancel").click();
      await total(page, 6);
      await clear(page);
      assert.equal(await stored(page), null);

      await page.evaluate((key) => localStorage.setItem(key, "{broken-qa-json"), storageKey);
      await page.reload({ waitUntil: "networkidle" });
      await get(page, "overview-read-error").waitFor();
      assert.equal(await get(page, "overview-total").count(), 0);
      await get(page, "overview-retry-action").click();
      await get(page, "overview-read-error").waitFor();
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
        "{broken-qa-json",
      );
      await get(page, "overview-clear-action").click();
      await get(page, "overview-confirm-cancel").click();
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), storageKey),
        "{broken-qa-json",
      );
      await get(page, "overview-clear-action").click();
      await get(page, "overview-confirm-action").click();
      await total(page, 0);
      await add(page, "metal", 2, 2);
      await page.evaluate(() => localStorage.setItem("@another-app/keep", "keep"));
      await open(page, "/legal", "privacy-delete-action");
      await get(page, "privacy-delete-action").click();
      await get(page, "privacy-delete-cancel").click();
      assert.equal((await stored(page)).counts.metal, 2);
      await get(page, "privacy-delete-action").click();
      await get(page, "privacy-delete-confirm-action").click();
      await page.waitForFunction(() =>
        Object.keys(localStorage).every(
          (key) => !key.startsWith("@kierratysappi/") || key === "@kierratysappi/language/v1",
        ),
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem("@kierratysappi/language/v1")),
        language,
      );
      assert.equal(await page.evaluate(() => localStorage.getItem("@another-app/keep")), "keep");
      await open(page, "/overview", "overview-total");
      await total(page, 0);

      process.stdout.write(
        `${language}: layouts, corrupt-data recovery and privacy deletion passed.\n`,
      );
      await open(page, "/photo", "web-image-choose");
      assert.equal(new URL(page.url()).pathname, "/local-photo");
      await get(page, "web-image-input").setInputFiles(
        path.resolve(
          "mobile/app/modules/local-vision/android/src/androidTest/assets/parity/commons-2-clean.jpg",
        ),
      );
      await get(page, "local-photo-recognize").click();
      await get(page, "network-photo-send").click();
      await get(page, "object-choice-jar").click();
      assert.equal(await get(page, "recycle-mark-action").count(), 0);
      await get(page, "object-answer-material-glass").click();
      await get(page, "object-answer-use-packaging").click();
      await get(page, "recycle-mark-action").click();
      await get(page, "recycle-confirm-action").click();
      await page.waitForFunction(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.counts.glass === 1,
        storageKey,
      );
      const photoRecord = await stored(page);
      assert.equal(photoRecord.counts.plastic, 0, "Only the chosen material is recorded");
      assert.equal(photoRecord.counts.glass, 1);
      await get(page, "object-sorting-back").click();
      await get(page, "object-sorting-back").click();
      await get(page, "object-answer-material-plastic").click();
      await get(page, "object-answer-use-packaging").click();
      await page
        .getByText(
          language === "fi" ? "Tallennettu yhteenvetoon · Lasi" : "Saved to Overview · Glass",
          { exact: true },
        )
        .waitFor();
      await get(page, "recycle-mark-action").waitFor({ state: "hidden" });
      assert.equal(
        await get(page, "recycle-mark-action").count(),
        0,
        "Changing the material cannot double-count the same image",
      );
      assert.equal((await stored(page)).counts.glass, 1);
      await page
        .getByText(
          language === "fi" ? "Tallennettu yhteenvetoon · Lasi" : "Saved to Overview · Glass",
          { exact: true },
        )
        .waitFor();
      assert.equal(photos, 1);
      assert.equal(lookups, 1, "Repeated same-code lookup uses the local product cache");
      assert.deepEqual(errors, []);
      await context.close();
      process.stdout.write(
        `PASS ${language}: explicit component recording, persistence, percentages, correction, failure recovery, privacy and layouts.\n`,
      );
    }
    process.stdout.write(
      "PASS: Overview FI/EN/light/dark/narrow/large-text, explicit recycled-part counts, stable retries and local deletion; isolated lookup/photo fixtures only. No live provider or paid requests.\n",
    );
  } catch (error) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.at(-1);
    if (page && !page.isClosed()) {
      fs.writeFileSync(
        path.join(evidence, "failure.json"),
        JSON.stringify(
          {
            url: page.url(),
            body: await page.locator("body").innerText(),
          },
          null,
          2,
        ),
      );
      await page.screenshot({ path: path.join(evidence, "failure.png"), fullPage: true });
    }
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${String(error.stack ?? error)}\n`);
  process.exitCode = 1;
});
