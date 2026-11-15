const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH);
const root = path.resolve(__dirname, "../../mobile/app/dist");
const output = path.resolve(process.env.APP_QA_EVIDENCE_DIR);
assert.ok(output.includes("/work/") && !fs.existsSync(output));
fs.mkdirSync(output);
const server = http.createServer((req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (name === "/") name = "/index.html";
    else if (!path.extname(name)) name += ".html";
    const target = path.resolve(root, `.${name}`);
    if (!target.startsWith(`${root}/`) || !fs.statSync(target).isFile()) throw Error("not_found");
    const type =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      }[path.extname(target)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    headless: true,
  });
  const evidence = [];
  try {
    for (const [language, width, colorScheme] of [
      ["fi", 390, "light"],
      ["en", 320, "dark"],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        colorScheme,
        reducedMotion: "reduce",
      });
      const external = [],
        errors = [];
      await context.addInitScript(
        (language) => localStorage.setItem("@kierratysappi/language/v1", language),
        language,
      );
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (!url.startsWith(origin) && !url.startsWith("data:")) {
          external.push(url);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}/local-photo`, { waitUntil: "networkidle" });
      const input = page.getByTestId("offline-product-manual-input");
      await input.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, `${language}-intro.png`), fullPage: true });
      await context.setOffline(true);
      const cases = [
        ["3017620422003", "Nutella"],
        ["4008400404127", "750 g"],
        ["5449000000996", "Coca-Cola"],
        ["8076800195057", "Spaghetti"],
        ["7622210449283", "Prince"],
        ["1234567890128", "1234567890128"],
        ["3017620422004", language === "fi" ? "Tarkista" : "Check"],
      ];
      for (const [code, expected] of cases) {
        await input.fill(code);
        await page.getByTestId("offline-product-manual-submit").focus();
        await page.keyboard.press("Enter");
        const result = page.getByTestId("offline-product-result");
        await result.waitFor();
        assert.ok((await result.innerText()).includes(expected));
        const issues = await page.evaluate(() => {
          const issues = [];
          if (document.documentElement.scrollWidth > innerWidth) issues.push("horizontal_overflow");
          for (const e of document.querySelectorAll('[role="button"], [role="link"], input')) {
            const r = e.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            if (r.width < 44 || r.height < 44) issues.push(`small_control:${e.textContent}`);
          }
          return issues;
        });
        assert.deepEqual(issues, []);
        if (code === "3017620422003")
          await page.screenshot({
            path: path.join(output, `${language}-known-offline.png`),
            fullPage: true,
          });
        if (code === "1234567890128")
          await page.screenshot({
            path: path.join(output, `${language}-unknown-offline.png`),
            fullPage: true,
          });
        await page.getByTestId("offline-product-reset").click();
        assert.equal(await input.inputValue(), "");
      }
      assert.deepEqual(errors, []);
      evidence.push({
        language,
        width,
        colorScheme,
        cases: cases.length,
        offlineDuringInteraction: true,
        externalRequestAttempts: external,
        pageErrors: errors,
      });
      await context.close();
    }
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
