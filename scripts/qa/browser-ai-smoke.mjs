// Actual exported/development web app + actual own-server model. No API/model mocking.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { isContainedPath } from "../lib/contained-path.mjs";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(process.argv[2] ?? "work/browser-ai-proof");
assert(isContainedPath(path.join(root, "work"), run));
fs.mkdirSync(run, { recursive: true });
assert.equal(fs.realpathSync(run), run);
const base = process.env.WEB_AI_URL ?? "http://localhost:8097";
const fixture = path.join(
  root,
  "mobile/app/modules/local-vision/android/src/androidTest/assets/parity/commons-2-clean.jpg",
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.WEB_AI_CHANNEL ? { channel: process.env.WEB_AI_CHANNEL } : {}),
  ...(process.env.BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
    : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const evidence = {
  platform: process.platform,
  browser: browser.version(),
  actualModel: true,
  cases: [],
  errors: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1000 },
    permissions: ["camera"],
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    const original = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
    window.__qaMediaStreams = [];
    if (original)
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.__qaMediaStreams.push(stream);
        return stream;
      };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  const posts = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/v1/recycling/object-image"))
      posts.push(request);
  });
  await page.goto(base + "/identify");
  await page.getByTestId("identify-photo-action").click();
  await expect(page.getByTestId("web-image-choose")).toBeVisible();
  assert.equal(posts.length, 0);
  await page.getByTestId("web-image-input").setInputFiles(fixture);
  await expect(page.getByTestId("local-photo-recognize")).toBeVisible();
  await expect(page.getByTestId("network-photo-preview-title")).toHaveText("Tarkista kuva");
  await expect(page.getByTestId("local-photo-recognize")).toHaveText("Tunnista kuva");
  await expect(page.getByTestId("network-photo-send")).toHaveCount(0);
  assert.equal(posts.length, 0, "Preview must not upload");
  await page.screenshot({ path: path.join(run, "browser-preview.png"), fullPage: true });
  await page.getByTestId("local-photo-recognize").click();
  await expect(page.getByTestId("network-photo-consent")).toBeVisible();
  assert.equal(posts.length, 0, "Opening consent must not upload");
  await page.getByTestId("network-consent-back").click();
  await expect(page.getByTestId("network-photo-send")).toHaveCount(0);
  await page.getByTestId("local-photo-recognize").click();
  await expect(page.getByTestId("network-photo-send")).toHaveText("Lähetä kuva ja tunnista");
  await page.screenshot({ path: path.join(run, "browser-consent.png"), fullPage: true });
  await page.getByTestId("network-photo-send").click();
  await expect(page.getByTestId("object-choice-spoon")).toBeVisible();
  assert.equal(posts.length, 1);
  await page.getByTestId("object-choice-spoon").click();
  await page.getByTestId("object-answer-material-metal").click();
  await expect(page.getByTestId("object-sorting-heading")).toContainText("Metallinkeräys");
  await expect(page.getByTestId("object-sorting-source").first()).toBeVisible();
  await page.screenshot({ path: path.join(run, "browser-spoon-guidance.png"), fullPage: true });
  evidence.cases.push(
    "Actual JPEG → no-upload preview → consent → real SigLIP spoon → chosen metal → sourced guidance",
  );
  // A PNG exercises browser decode/canvas/re-encode, not only direct bounded JPEG reuse.
  const png = await page.evaluate(async (jpeg) => {
    const image = new Image();
    image.src = "data:image/jpeg;base64," + jpeg;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, fs.readFileSync(fixture).toString("base64"));
  await page.getByTestId("web-image-input").setInputFiles({
    name: "licensed-spoon.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByTestId("local-photo-recognize")).toBeVisible();
  assert.equal(posts.length, 1);
  await page.getByTestId("local-photo-recognize").click();
  await page.getByTestId("network-photo-send").click();
  await expect(page.getByTestId("object-choice-spoon")).toBeVisible();
  assert.equal(posts.length, 2);
  evidence.cases.push("Actual PNG → canvas JPEG → consent → real SigLIP spoon");
  await page.getByTestId("network-photo-cancel").click();
  await page.getByTestId("web-image-input").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  });
  await expect(page.getByTestId("network-photo-error")).toBeVisible();
  assert.equal(posts.length, 2);
  evidence.cases.push("SVG rejected locally, no upload");
  // Isolated Chromium's fake camera only; never opens the Mac's real camera.
  await page.getByTestId("web-camera-open").click();
  await expect(page.getByTestId("web-camera-capture")).toBeEnabled();
  assert.equal(
    await page.evaluate(() =>
      window.__qaMediaStreams.some((stream) =>
        stream.getTracks().some((track) => track.readyState === "live"),
      ),
    ),
    true,
  );
  await page.getByTestId("web-camera-capture").click();
  await expect(page.getByTestId("local-photo-recognize")).toBeVisible();
  await expect(page.getByTestId("network-photo-send")).toHaveCount(0);
  assert.equal(posts.length, 2);
  assert.equal(await page.locator("video").count(), 0, "Camera unmounted after capture");
  assert.equal(
    await page.evaluate(() =>
      window.__qaMediaStreams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
    true,
    "Every camera track stopped after capture",
  );
  await page.getByTestId("network-photo-cancel").click();
  assert.equal(posts.length, 2);
  evidence.cases.push("Fake camera capture → preview → cancel, no upload");
  await page.goto(base + "/settings");
  await page.getByRole("radio", { name: "English", exact: true }).click();
  await page.goto(base + "/local-photo");
  await expect(page.getByTestId("web-image-choose")).toHaveText("Choose a photo");
  await page.reload();
  await expect(page.getByTestId("web-image-choose")).toHaveText("Choose a photo");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const heading = page.getByRole("heading", { name: "Recognize an image", exact: true });
  // Capture the top, not a scroll position restored from the previous interaction.
  await heading.evaluate((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      parent.scrollTop = 0;
  });
  await expect(heading).toBeInViewport();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeInViewport();
  await page.screenshot({ path: path.join(run, "browser-en-dark-mobile.png"), fullPage: true });
  evidence.cases.push(
    "EN persistence across navigation/reload; dark, narrow viewport and reduced motion",
  );
  // Connection failure is an actual browser transport error, not a fabricated model result.
  await context.setOffline(true);
  await page.getByTestId("web-camera-open").click();
  await expect(page.getByTestId("network-photo-error")).toContainText("Cannot reach");
  await context.setOffline(false);
  evidence.cases.push("Offline capability recovery without camera or upload");
  assert.deepEqual(evidence.errors, []);
  await context.close();
} finally {
  await browser.close();
  fs.writeFileSync(
    path.join(run, "browser-evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
}
console.log(JSON.stringify(evidence, null, 2));
