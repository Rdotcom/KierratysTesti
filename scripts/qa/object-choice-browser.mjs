// Loopback-only actual component QA. Suggestions are explicitly synthetic;
// no camera/native inference, provider, history or device evidence is claimed.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
assert(process.env.PLAYWRIGHT_MODULE_PATH && process.env.BROWSER_EXECUTABLE_PATH);
const require = createRequire(import.meta.url),
  mobileRequire = createRequire(path.join(root, "mobile/app/package.json"));
const { build } = createRequire(require.resolve("tsup"))("esbuild");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
const out = path.join(run, "component-host");
fs.mkdirSync(out);
await build({
  entryPoints: ["scripts/qa/object-choice-harness.tsx"],
  bundle: true,
  outfile: path.join(out, "app.js"),
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  tsconfig: "mobile/app/tsconfig.json",
  mainFields: ["browser", "module", "main"],
  resolveExtensions: [
    ".web.tsx",
    ".web.ts",
    ".web.jsx",
    ".web.js",
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".json",
  ],
  alias: {
    react: path.dirname(mobileRequire.resolve("react/package.json")),
    "react-dom": path.dirname(mobileRequire.resolve("react-dom/package.json")),
    "react-native": mobileRequire.resolve("react-native-web"),
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
      '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;background:#f3f8f3}#root{max-width:520px;margin:auto}button{min-height:44px;min-width:44px;margin-bottom:8px}@media(prefers-color-scheme:dark){body{background:#10211c;color:white}}</style><div id="root"></div><script type="module" src="/app.js"></script></html>',
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
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE_PATH,
  headless: true,
});
const evidence = [];
try {
  for (const [language, colorScheme, width, scale] of [
    ["fi", "light", 390, 1],
    ["fi", "dark", 320, 1.3],
    ["en", "light", 390, 1],
    ["en", "dark", 320, 2],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      colorScheme,
      reducedMotion: "reduce",
    });
    await context.addInitScript(
      ({ language, scale }) => {
        localStorage.setItem("@kierratysappi/language/v1", language);
        if (scale !== 1) {
          const seen = new WeakSet();
          const apply = () =>
            document.querySelectorAll("div,span").forEach((el) => {
              if (
                seen.has(el) ||
                ![...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())
              )
                return;
              seen.add(el);
              const style = getComputedStyle(el);
              el.style.fontSize = `${parseFloat(style.fontSize) * scale}px`;
              if (style.lineHeight !== "normal")
                el.style.lineHeight = `${parseFloat(style.lineHeight) * scale}px`;
            });
          new MutationObserver(apply).observe(document, { childList: true, subtree: true });
        }
      },
      { language, scale },
    );
    const page = await context.newPage(),
      errors = [],
      unexpected = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      if (!req.url().startsWith(base)) unexpected.push(req.url());
    });
    await page.goto(base);
    const get = (id) => page.getByTestId(id);
    await get("object-choice-spoon").waitFor();
    if (language === "en") await page.getByRole("button", { name: "Spoon", exact: true }).waitFor();
    await context.setOffline(true);
    async function inspect(stage) {
      const issues = await page.evaluate(() => {
        const bad = [];
        if (document.documentElement.scrollWidth > innerWidth) bad.push("page_overflow");
        document.querySelectorAll('[role="button"], [role="link"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (r.width < 44 || r.height < 44) bad.push(`small:${el.getAttribute("aria-label")}`);
          if (r.left < -1 || r.right > innerWidth + 1) bad.push("control_overflow");
        });
        return bad;
      });
      assert.deepEqual(issues, [], `${language}/${colorScheme}/${stage}`);
      await page.screenshot({
        path: path.join(run, `${language}-${colorScheme}-${stage}.png`),
        fullPage: true,
      });
    }
    await inspect("choices");
    await get("object-choice-spoon").focus();
    await get("object-choice-spoon").press("Enter");
    await get("object-answer-material-metal").waitFor();
    assert.equal(await get("object-sorting-preparation").count(), 0);
    await get("object-answer-material-metal").click();
    assert.match(
      await get("object-sorting-heading").innerText(),
      /Metallinkeräys|Metal collection/,
    );
    assert.match(await get("object-sorting-source").innerText(), /2026-11-16|2026-08-10/);
    await inspect("metal");
    const overview = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("@kierratysappi/recycling-overview/v1") ?? "null"),
      );
    assert.equal(await overview(), null, "Guidance alone never records recycling");
    await get("recycle-mark-action").click();
    await get("recycle-confirm-cancel").click();
    assert.equal(await overview(), null, "Cancelling never records recycling");
    await get("recycle-mark-action").click();
    await get("recycle-confirm-action").dblclick();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("@kierratysappi/recycling-overview/v1") ?? "null")?.counts
          .metal === 1,
    );
    assert.equal((await overview()).recent.length, 1, "Repeated confirmation is idempotent");
    await get("object-sorting-change").click();
    await get("object-choice-cup").click();
    await get("object-answer-material-ceramic").click();
    await get("object-answer-region-elsewhere").click();
    assert.equal(await get("object-sorting-preparation").count(), 0);
    await get("object-sorting-back").click();
    await get("object-answer-region-hsy").click();
    assert.match(await get("object-sorting-heading").innerText(), /Sekajäte|Mixed waste/);
    assert.match(await get("object-sorting-source").innerText(), /HSY/);
    await inspect("ceramic");
    assert.equal(
      await get("recycle-mark-action").count(),
      0,
      "Changing an object choice in one capture must not count it twice",
    );
    await get("qa-new-result").click();
    await get("object-choice-cup").click();
    await get("object-answer-material-ceramic").click();
    await get("object-answer-region-hsy").click();
    await get("recycle-mark-action").click();
    assert.equal(
      await get("recycle-confirm-action").isEnabled(),
      false,
      "Unknown material needs an explicit self-report",
    );
    await get("recycle-material-other").click();
    await inspect("record-material-choice");
    await get("recycle-confirm-action").click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("@kierratysappi/recycling-overview/v1") ?? "null")?.counts
          .other === 1,
    );
    assert.equal((await overview()).recent.length, 2);
    await get("object-sorting-change").click();
    await get("object-choice-bottle").click();
    await get("object-answer-material-plastic").click();
    await inspect("packaging-question");
    await get("object-answer-use-deposit").click();
    assert.match(
      await get("object-sorting-heading").innerText(),
      /palautusautomaatti|Retail return/,
    );
    await get("object-sorting-back").click();
    await get("object-answer-use-item").click();
    await get("object-answer-region-hsy").click();
    assert.match(
      await get("object-sorting-preparation").innerText(),
      /Ei muovipakkausten|Not plastic-packaging/,
    );
    await get("qa-new-result").click();
    await get("object-choice-spoon").waitFor();
    assert.equal(await get("object-sorting-flow").count(), 0);
    await get("qa-multiple").click();
    assert.equal(await get("object-choice-spoon").count(), 0);
    await get("object-candidate-guide").click();
    await get("qa-guide-opened").waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    evidence.push({
      language,
      colorScheme,
      width,
      simulatedTextScale: scale,
      reducedMotion: true,
      offlineChoices: true,
      keyboardSelection: true,
      staleReset: true,
      recordingRequiresConfirmation: true,
      unknownMaterialRequiresChoice: true,
      sameCaptureIdempotent: true,
      multipleRecovery: true,
      overflowAnd44pxChecks: true,
      externalRequests: unexpected.length,
      errors,
    });
    await context.close();
  }
  fs.writeFileSync(
    path.join(run, "browser-evidence.json"),
    JSON.stringify(
      { syntheticComponentOnly: true, nativeInferenceVerified: false, evidence },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(
    `Actual component ${evidence.length} FI/EN light/dark cases passed; no inference or external requests.`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
