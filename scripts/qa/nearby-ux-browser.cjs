const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH;
const browserExecutable = process.env.BROWSER_EXECUTABLE_PATH;
if (!playwrightModule || !browserExecutable) throw new Error("Set installed local QA tool paths.");
const { chromium } = require(playwrightModule);
const baseUrl = process.env.NEARBY_QA_URL ?? "http://127.0.0.1:8093";
const evidenceDir = path.resolve(process.env.APP_QA_EVIDENCE_DIR ?? "work/nearby-ux-qa");
fs.mkdirSync(evidenceDir, { recursive: true });
const directory = JSON.parse(
  fs.readFileSync("mobile/app/assets/data/finland-recycling.json", "utf8"),
);
const sample = directory.points.find(
  (p) => !p.name && !p.address && p.reportedMaterials.length > 0 && p.reportedMaterials.length <= 3,
);
const unknown = directory.points.find((p) => !p.reportedMaterials.length);
assert.ok(sample && unknown);
function expectedPoints(position, accepts = (p) => p.reportedMaterials.length > 0) {
  const rad = (v) => (v * Math.PI) / 180;
  return directory.points
    .filter(accepts)
    .map((point) => {
      const a =
        Math.sin(rad(point.coordinates.latitude - position.latitude) / 2) ** 2 +
        Math.cos(rad(position.latitude)) *
          Math.cos(rad(point.coordinates.latitude)) *
          Math.sin(rad(point.coordinates.longitude - position.longitude) / 2) ** 2;
      return { point, distance: 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) };
    })
    .filter((p) => p.distance <= 100000)
    .sort((a, b) => a.distance - b.distance || a.point.id.localeCompare(b.point.id, "en"))
    .slice(0, 5);
}
async function observeLocation(context, hanging = false) {
  await context.addInitScript((hold) => {
    window.qaLocation = { watch: 0, clear: 0 };
    const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    const clear = navigator.geolocation.clearWatch.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = (...args) => {
      window.qaLocation.watch++;
      return hold ? 123456 : watch(...args);
    };
    navigator.geolocation.clearWatch = (id) => {
      window.qaLocation.clear++;
      if (!hold) clear(id);
    };
  }, hanging);
}
async function openFromHome(page) {
  await page.goto(baseUrl + "/");
  await page.getByTestId("home-nearby-action").click();
  await page.getByTestId("nearby-result").waitFor();
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Horizontal overflow",
  );
}
(async () => {
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["geolocation"],
      geolocation: { ...sample.coordinates, accuracy: 10 },
      reducedMotion: "reduce",
    });
    await observeLocation(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl + "/nearby");
    await page.getByTestId("nearby-find").waitFor();
    await page.getByTestId("nearby-location-toggle").click();
    await page
      .getByText(
        "Osoitehaku toimii iPhone- ja Android-sovelluksessa. Selaimessa voit hakea laitteen sijainnilla.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page.getByTestId("nearby-location-input").count(),
      0,
      "Web must not collect an address for an unavailable provider",
    );
    await page.screenshot({ path: path.join(evidenceDir, "manual-web-fi.png"), fullPage: true });
    await page.getByTestId("nearby-location-toggle").click();
    assert.equal(
      await page.evaluate(() => window.qaLocation.watch),
      0,
      "Direct URL must not read location",
    );
    await openFromHome(page);
    // Expo removes both its position and error subscriptions; browser clearWatch may repeat.
    await page.waitForFunction(() => window.qaLocation.clear >= 1);
    assert.equal(
      await page.evaluate(() => window.qaLocation.watch),
      1,
      "Home must require just one search",
    );
    const expected = expectedPoints(sample.coordinates);
    assert.equal(await page.locator('[data-testid^="nearby-point-"]').count(), expected.length);
    const map = page.getByTestId("nearby-map-0");
    assert.ok(
      (await map.boundingBox()).y + (await map.boundingBox()).height <= 844,
      "First map must fit phone viewport",
    );
    await page.getByText("Yhteisötieto · ei paikan päällä varmennettu", { exact: true }).waitFor();
    await page.getByText("© OpenStreetMap contributors · ODbL 1.0", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("nearby-details-0").count(), 0);
    assert.equal(
      await page.getByTestId("nearby-details-toggle-0").getAttribute("aria-expanded"),
      "false",
    );
    const labels = (await import("../../mobile/localization/dist/index.js")).messages.fi;
    const labelKeys = {
      glass: "pointGlass",
      glassBottles: "pointGlassBottles",
      plastic: "pointPlastic",
      plasticPackaging: "pointPlasticPackaging",
      plasticBottles: "pointPlasticBottles",
      paper: "pointPaper",
      paperPackaging: "pointPaperPackaging",
      cardboard: "pointCardboard",
      cartons: "pointCartons",
      beverageCartons: "pointBeverageCartons",
      metal: "pointMetal",
      metalPackaging: "pointMetalPackaging",
      smallMetal: "pointSmallMetal",
      scrapMetal: "pointScrapMetal",
      cans: "pointCans",
      aluminium: "pointAluminium",
      batteries: "pointBatteries",
      carBatteries: "pointCarBatteries",
      electricalAppliances: "pointElectricalAppliances",
      smallElectricalAppliances: "pointSmallElectricalAppliances",
      clothes: "pointClothes",
      textiles: "pointTextiles",
      shoes: "pointShoes",
      wood: "pointWood",
      gardenWaste: "pointGardenWaste",
      foodWaste: "pointFoodWaste",
      hazardousWaste: "pointHazardousWaste",
      fluorescentTubes: "pointFluorescentTubes",
      lightBulbs: "pointLightBulbs",
      tyres: "pointTyres",
    };
    for (const [index, { point }] of expected.entries()) {
      for (const material of point.reportedMaterials.slice(0, 4))
        assert.ok(
          (await page.getByTestId("nearby-materials-" + index).innerText()).includes(
            labels[labelKeys[material]],
          ),
        );
      await page.getByTestId("nearby-details-toggle-" + index).focus();
      await page.getByTestId("nearby-details-toggle-" + index).press("Enter");
      const details = page.getByTestId("nearby-details-" + index);
      await details.waitFor();
      if (index === 0) {
        await details.getByTestId("recycle-mark-action").click();
        assert.equal(await details.getByTestId("recycle-confirm-action").isEnabled(), false);
        await details.getByTestId("recycle-material-other").click();
        await details.getByTestId("recycle-confirm-action").click();
        await page.waitForFunction(
          () =>
            JSON.parse(localStorage.getItem("@kierratysappi/recycling-overview/v1") ?? "null")
              ?.counts.other === 1,
        );
      }
      for (const excluded of point.reportedExclusions)
        assert.ok((await details.innerText()).includes(labels[labelKeys[excluded]]));
      assert.ok(
        (await details.innerText()).includes(point.id),
        "Real nearest order must match independent distance calculation",
      );
      assert.equal(
        await page.getByTestId("nearby-details-toggle-" + index).getAttribute("aria-expanded"),
        "true",
      );
      await page.getByTestId("nearby-details-toggle-" + index).click();
    }
    await page.getByTestId("nearby-screen").evaluate((screen) => {
      for (const element of screen.querySelectorAll("div")) element.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(evidenceDir, "fi-light.png"), fullPage: true });
    await page.getByTestId("nearby-filter-batteries").click();
    assert.equal(
      await page.evaluate(() => window.qaLocation.watch),
      1,
      "Filtering must not reacquire location",
    );
    const batteries = expectedPoints(sample.coordinates, (p) =>
      p.reportedMaterials.some(
        (m) => ["batteries", "carBatteries"].includes(m) && !p.reportedExclusions.includes(m),
      ),
    );
    assert.equal(await page.locator('[data-testid^="nearby-point-"]').count(), batteries.length);
    for (const [i, { point }] of batteries.entries()) {
      await page.getByTestId("nearby-details-toggle-" + i).click();
      assert.ok((await page.getByTestId("nearby-details-" + i).innerText()).includes(point.id));
      await page.getByTestId("nearby-details-toggle-" + i).click();
    }
    await page.screenshot({ path: path.join(evidenceDir, "fi-batteries.png"), fullPage: true });
    await page.getByTestId("nearby-filter-all").click();
    await context.setOffline(true);
    await page.getByTestId("nearby-find").click();
    await page.getByTestId("nearby-result").waitFor();
    assert.equal(await page.locator('[data-testid^="nearby-point-"]').count(), 5);
    await context.setOffline(false);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('[data-testid="nearby-screen"]'))
          .backgroundColor === "rgb(20, 34, 27)",
    );
    await page.screenshot({ path: path.join(evidenceDir, "fi-dark.png"), fullPage: true });
    // Browser-only synthetic text sizing; not native Dynamic Type.
    await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.querySelector('[data-testid="nearby-screen"]'),
        NodeFilter.SHOW_TEXT,
      );
      const elements = new Set();
      while (walker.nextNode())
        if (walker.currentNode.textContent.trim()) elements.add(walker.currentNode.parentElement);
      const sizes = [...elements].map((el) => [
        el,
        parseFloat(getComputedStyle(el).fontSize),
        parseFloat(getComputedStyle(el).lineHeight),
      ]);
      for (const [el, size, line] of sizes) {
        el.style.fontSize = size * 1.3 + "px";
        el.style.lineHeight = (Number.isFinite(line) ? line : size * 1.4) * 1.3 + "px";
      }
    });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(page);
      if (width === 320) {
        await page.waitForFunction(() => {
          const card = document.querySelector('[data-testid="nearby-point-0"]');
          const heading = card?.querySelector('[role="heading"]');
          return (
            heading &&
            heading.getBoundingClientRect().width >= card.getBoundingClientRect().width - 36
          );
        });
        const card = await page.getByTestId("nearby-point-0").boundingBox();
        const heading = await page.getByTestId("nearby-point-0").getByRole("heading").boundingBox();
        assert.ok(
          heading.width >= card.width - 36,
          "Large-text name needs full card width, not a cramped distance column",
        );
      }
    }
    await page.screenshot({ path: path.join(evidenceDir, "fi-large.png"), fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();

    const english = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["geolocation"],
      geolocation: { ...unknown.coordinates, accuracy: 150 },
    });
    await observeLocation(english);
    const en = await english.newPage();
    await en.goto(baseUrl + "/");
    await en.getByRole("radio", { name: "English", exact: true }).click();
    await en.getByTestId("home-nearby-action").click();
    await en.getByTestId("nearby-result").waitFor();
    await en
      .getByText("Your location is approximate. The order of nearby points may vary.", {
        exact: true,
      })
      .waitFor();
    assert.ok(
      !(await en.getByTestId("nearby-result").innerText()).includes(
        "Accepted materials have not been reported.",
      ),
    );
    await en.getByTestId("nearby-missing-toggle").click();
    await en.getByTestId("nearby-missing-results").waitFor();
    assert.ok(
      (await en.getByTestId("nearby-missing-results").innerText()).includes(
        "not collection recommendations",
      ),
    );
    assert.ok(
      (await en.getByTestId("nearby-missing-results").innerText()).includes(
        "Accepted materials have not been reported.",
      ),
    );
    assert.equal(await en.evaluate(() => window.qaLocation.watch), 1);
    await noOverflow(en);
    await en.screenshot({ path: path.join(evidenceDir, "en.png"), fullPage: true });
    await en.getByTestId("nearby-location-toggle").click();
    await en
      .getByText(
        "Address search is available in the iPhone and Android app. In a browser, use device location instead.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await en.getByTestId("nearby-location-input").count(), 0);
    await english.close();

    const denied = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await denied.addInitScript(() => {
      navigator.permissions.query = async () => ({ state: "denied" });
    });
    const d = await denied.newPage();
    await d.goto(baseUrl + "/");
    await d.getByTestId("home-nearby-action").click();
    await d
      .getByText(
        "Sijaintilupaa ei annettu. Yritä uudelleen tai salli sijainti sovelluksen asetuksissa.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await d.getByTestId("nearby-result").count(), 0);
    await denied.close();

    const held = await browser.newContext({ permissions: ["geolocation"] });
    await observeLocation(held, true);
    const h = await held.newPage();
    await h.goto(baseUrl + "/");
    await h.getByTestId("home-nearby-action").click();
    await h.getByTestId("nearby-cancel").waitFor();
    await h.waitForFunction(() => window.qaLocation.watch === 1);
    await h.getByTestId("nearby-cancel").click();
    await h.getByTestId("nearby-find").waitFor();
    await h.waitForFunction(() => window.qaLocation.clear >= 1);
    assert.equal(await h.getByTestId("nearby-result").count(), 0);
    const clearsBeforeTimeout = await h.evaluate(() => window.qaLocation.clear);
    await h.getByTestId("nearby-find").click();
    await h
      .getByText(
        "Sijaintia ei saatu 20 sekunnissa. Siirry avoimempaan paikkaan ja yritä uudelleen.",
        { exact: true },
      )
      .waitFor({ timeout: 25000 });
    await h.waitForFunction((before) => window.qaLocation.clear > before, clearsBeforeTimeout);
    await held.close();
    console.log(
      "PASS: one-press Home, non-acquiring direct URL, independently ranked five real points, reported/unknown/excluded materials, source/date, keyboard details, offline, FI/EN, dark, 320/390 and 130% synthetic text, denial/cancel/timeout and watcher cleanup; manual-address web limitation in FI/EN with no address input. No user GPS or native acceptance.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
