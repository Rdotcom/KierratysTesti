import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const require = createRequire(import.meta.url),
  mobileRequire = createRequire(path.join(root, "mobile/app/package.json"));
const { build } = createRequire(require.resolve("tsup"))("esbuild"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
const out = path.join(run, "guide-host");
fs.mkdirSync(out);
await build({
  entryPoints: ["scripts/qa/guide-region-harness.tsx"],
  outfile: path.join(out, "app.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  tsconfig: "mobile/app/tsconfig.json",
  mainFields: ["browser", "module", "main"],
  resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".json"],
  alias: {
    react: path.dirname(mobileRequire.resolve("react/package.json")),
    "react-dom": path.dirname(mobileRequire.resolve("react-dom/package.json")),
    "react-native": mobileRequire.resolve("react-native-web"),
    "react-native-safe-area-context": path.dirname(
      mobileRequire.resolve("react-native-safe-area-context/package.json"),
    ),
    "expo-router": path.join(root, "scripts/qa/object-choice-router-stub.mjs"),
  },
  loader: { ".png": "file", ".ttf": "file" },
  define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
});
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  if (pathname === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(
      '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#root{max-width:520px;margin:auto}</style><div id="root"></div><script type="module" src="/app.js"></script></html>',
    );
  }
  const file = path.resolve(out, `.${pathname}`);
  if (!file.startsWith(`${out}/`) || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".js") ? "text/javascript" : "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    headless: true,
  });
const evidence = [];
try {
  for (const [language, colorScheme, width] of [
    ["fi", "light", 390],
    ["fi", "dark", 320],
    ["en", "light", 390],
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
    const page = await context.newPage(),
      errors = [],
      external = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    page.on("request", (r) => {
      if (!r.url().startsWith(base)) external.push(r.url());
    });
    await page.goto(`${base}/?q=kaukos%C3%A4%C3%A4din`);
    console.log(`Guide opened: ${language}/${colorScheme}`);
    const get = (id) => page.getByTestId(id);
    const capture = async (stage) => {
      const issues = await page.evaluate(() => {
        const failures = [];
        if (document.documentElement.scrollWidth > innerWidth) failures.push("overflow");
        document.querySelectorAll('[role="button"],[role="link"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width && r.height && (r.width < 44 || r.height < 44))
            failures.push("small-control");
        });
        return failures;
      });
      await page.screenshot({
        path: path.join(run, `guide-${language}-${colorScheme}-${stage}.png`),
        fullPage: true,
      });
      assert.deepEqual(issues, [], `${language}/${colorScheme}/${stage}`);
    };
    await get("object-sorting-heading").waitFor();
    assert.match(await get("object-sorting-heading").innerText(), /Sähkölaitteiden keräys|WEEE/);
    assert.match(await get("object-sorting-preparation").innerText(), /paristo|batter/i);
    await get("guide-search-input").press("Enter");
    assert.equal(await get("guide-material-all").count(), 0);
    const headingBox = await get("object-sorting-heading").boundingBox(),
      preparationBox = await get("object-sorting-preparation").boundingBox(),
      regionBox = await get("sorting-region-picker").boundingBox();
    assert(headingBox && preparationBox && regionBox);
    assert(headingBox.y + headingBox.height < 844, "result_heading_in_first_viewport");
    assert(preparationBox.y < 844, "instruction_starts_in_first_viewport");
    assert(headingBox.y < regionBox.y, "region_controls_after_result");
    await capture("remote");
    await context.setOffline(true);
    await get("guide-search-input").fill("lusikka");
    await get("object-answer-material-metal").click();
    assert.match(await get("object-sorting-preparation").innerText(), /aterin|cutlery/);
    assert.doesNotMatch(
      await get("object-sorting-preparation").innerText(),
      /Suurempi|larger|aukkoon/,
    );
    await capture("cutlery");
    await get("guide-search-input").fill("muki");
    await get("object-answer-material-ceramic").click();
    await get("sorting-region-manual").click();
    await get("sorting-region-input").fill("Turku");
    await get("sorting-region-853").click();
    // Municipality change invalidates old answers; user confirms material again.
    await get("object-answer-material-ceramic").click();
    assert.match(await get("object-sorting-preparation").innerText(), /Topinoja/);
    await capture("lsjh-ceramic");
    for (const [town, code, source] of [
      ["Oulu", "564", "Kiertokaari"],
      ["Helsinki", "091", "HSY"],
      ["Tampere", "837", null],
    ]) {
      await get("sorting-region-manual").click();
      await get("sorting-region-input").fill(town);
      await get(`sorting-region-${code}`).click();
      assert.equal(await get("object-sorting-preparation").count(), 0);
      await get("object-answer-material-ceramic").click();
      if (source) assert.match(await get("object-sorting-source").innerText(), new RegExp(source));
      else assert.equal(await get("object-sorting-preparation").count(), 0);
    }
    await get("guide-search-input").fill("unknown-object-839");
    assert.equal(await get("object-sorting-preparation").count(), 0);
    await get("guide-search-empty").waitFor();
    await get("sorting-region-locate").click();
    assert.match(await get("sorting-region-current").innerText(), /Helsinki.*HSY/);
    await page.screenshot({
      path: path.join(run, `guide-${language}-${colorScheme}-before-check.png`),
      fullPage: true,
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow)
      console.error(
        await page.evaluate(() =>
          Array.from(document.querySelectorAll("body *"))
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 12)
            .map((el) => ({
              tag: el.tagName,
              testID: el.getAttribute("data-testid"),
              width: el.getBoundingClientRect().width,
              text: el.textContent?.slice(0, 80),
            })),
        ),
      );
    assert.equal(overflow, false);
    await page.screenshot({
      path: path.join(run, `guide-${language}-${colorScheme}.png`),
      fullPage: true,
    });
    await context.setOffline(false);
    await page.goto(`${base}/?q=muki&coast=1`);
    await get("sorting-region-locate").click();
    await get("sorting-region-confirm").waitFor();
    assert.doesNotMatch(await get("sorting-region-current").innerText(), /Helsinki/);
    await get("sorting-region-confirm").click();
    assert.match(await get("sorting-region-current").innerText(), /Helsinki.*HSY/);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-testid="qa-region-state"]')
          ?.textContent?.includes("Helsinki"),
    );
    await page.goto(`${base}/?q=muki&pending=1`);
    await get("sorting-region-locate").click();
    await get("qa-clear").click();
    await get("qa-finish").click();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.doesNotMatch(await get("qa-region-state").innerText(), /Helsinki|"busy":true/);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    evidence.push({
      language,
      colorScheme,
      width,
      offlineManualSearch: true,
      regionalInvalidation: true,
      unsupportedSafe: true,
      coastConfirmation: true,
      staleLocationCancelled: true,
      externalRequests: 0,
      errors,
    });
    await context.close();
  }
  fs.writeFileSync(
    path.join(run, "guide-browser-evidence.json"),
    JSON.stringify({ controlledLocation: true, nativeGpsVerified: false, evidence }, null, 2),
    { flag: "wx" },
  );
  console.log(`Actual guide/context ${evidence.length} FI/EN cases passed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
