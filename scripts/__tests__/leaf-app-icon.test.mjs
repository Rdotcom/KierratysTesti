import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
const root = "mobile/app/assets/brand/",
  config = JSON.parse(fs.readFileSync("mobile/app/app.json")).expo;
const pins = {
  "leaf-mark-v1.png": "bb137dfe7cd1e1a4062a52acf2ae19e167ad44d3b0da1751ea7c28274dcd08b0",
  "leaf-app-icon.png": "4d6dacacf310f1a1fb9c77cbda1da8b0da5cedf0375b5b794134e9ca4b4894fa",
  "leaf-adaptive-foreground.png":
    "09273019e08974a6d45ff507c4bb781987c85544e7687643617dfd89f68ffb56",
  "leaf-adaptive-monochrome.png":
    "db82671f40168b68df3581a1b92927e00ddb9e03039268ba2bfd362dcb6f57bf",
  "leaf-favicon.png": "f3cc08185eefc8ed7e25c2473fdbf2fe28c26108682d8bdfc3f760d8c79bab73",
};
test("selected leaf master and native variants remain pinned with correct PNG dimensions/alpha", () => {
  for (const [name, pin] of Object.entries(pins)) {
    const bytes = fs.readFileSync(root + name);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), pin);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.subarray(12, 16).toString(), "IHDR");
    const size = name.includes("favicon") ? 64 : name.includes("mark-v1") ? 1254 : 1024;
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.equal(bytes[25], name.includes("app-icon") || name.includes("favicon") ? 2 : 6);
  }
});
test("all launcher platforms reference the new leaf without changing application identity", () => {
  assert.equal(config.icon, "./assets/brand/leaf-app-icon.png");
  assert.equal(config.ios.icon, config.icon);
  assert.equal(
    config.android.adaptiveIcon.foregroundImage,
    "./assets/brand/leaf-adaptive-foreground.png",
  );
  assert.equal(
    config.android.adaptiveIcon.monochromeImage,
    "./assets/brand/leaf-adaptive-monochrome.png",
  );
  assert.equal(config.android.adaptiveIcon.backgroundColor, "#F4FAF5");
  assert.equal(config.web.favicon, "./assets/brand/leaf-favicon.png");
  assert.equal(config.ios.bundleIdentifier, "fi.roopeaaltonen.kierratysappi");
  assert.equal(config.android.package, config.ios.bundleIdentifier);
});
test("original Home artwork and crop are preserved rather than replaced by the derived app icon", () => {
  const original = fs.readFileSync("mobile/app/assets/backgrounds/welcome-background.png");
  assert.equal(
    createHash("sha256").update(original).digest("hex"),
    "e848d48323ba50a1930b861bedcdd8546449f4bcd27543bcc28af2ed59de96e0",
  );
  const component = fs.readFileSync("mobile/app/src/components/reference-artwork.tsx", "utf8");
  assert.match(component, /welcome-background\.png/);
  assert.doesNotMatch(component, /leaf-mark-v1/);
});
