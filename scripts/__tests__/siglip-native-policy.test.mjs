import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ios = "mobile/app/modules/local-vision/ios/";
test("normal app build stops before disk exhaustion without deleting caches or rollback", () => {
  const build = source("scripts/qa/build-siglip-client.mjs");
  assert.match(build, /statfsSync\(run\)/);
  assert.match(build, /availableBytes\(\) >= 2_000_000_000/);
  assert.match(build, /availableBytes\(\) < 1_200_000_000/);
  assert.match(build, /child.kill\("SIGTERM"\)/);
  assert.match(build, /rollback-prior.app/);
  assert.doesNotMatch(build, /rmSync|unlinkSync|removeSync|rm -|--clean/);
});
test("client23 verifier checks the real bundled shared recognition controls without changing model pins", () => {
  const verifier = source("scripts/qa/verify-siglip-client.mjs");
  assert.match(verifier, /Number\(build\) >= 23/);
  for (const marker of [
    "recognition-details-toggle",
    "recognition-manual-card",
    "recognition-material-code",
    "local-photo-recognize",
    "network-photo-consent",
  ])
    assert(verifier.includes(marker));
  assert.match(verifier, /legacyResourcePinsPreserved/);
  assert.match(verifier, /candidateModelAndPrototypePins/);
  assert.match(verifier, /profileAppDeviceBound/);
});
test("candidate native input is bounded, explicit orientation/RGB and never MobileCLIP padded", () => {
  const input = source(`${ios}siglip-image-encoder.swift`),
    resize = source(`${ios}siglip-image-preprocessor.swift`);
  assert.match(input, /imageData.count <= 8_000_000/);
  assert.match(input, /CGImageSourceGetCount\(source\) == 1/);
  assert.match(input, /w \* h <= 8_000_000/);
  assert.match(input, /rgba\[i \* 4 \+ 3\] == 255/);
  assert.match(resize, /\(1\.\.\.8\).contains\(exif\)/);
  assert.match(resize, /static let side = 224/);
  assert.match(resize, /1 << 22/);
  assert.match(resize, /Double\(pixel\) \/ 255.0/);
  assert.doesNotMatch(
    input + resize,
    /URLSession|URLRequest|print\(|NSLog|FileHandle|UserDefaults/,
  );
});
test("candidate consumer validates768D/model schema and fixesCPU compute, not a new bridge", () => {
  const encoder = source(`${ios}siglip-image-encoder.swift`);
  assert.match(encoder, /config.computeUnits = .cpuOnly/);
  assert.match(encoder, /input.shape.map\(\\.intValue\) == \[1, 3, 224, 224\]/);
  assert.match(encoder, /values.shape.map\(\\.intValue\) == \[1, 768\]/);
  assert.match(encoder, /vector.allSatisfy\(\\.isFinite\)/);
  assert.doesNotMatch(source(`${ios}local-vision-module.swift`), /Siglip/);
  assert.doesNotMatch(source(`${ios}mobileclip-predictor.swift`), /Siglip/);
});
test("device helper adopts UIScene lifecycle before running worker", () => {
  const host = source("scripts/qa/siglip-device-host.swift"),
    plist = source("scripts/qa/siglip-device-info.plist");
  assert.match(host, /UIWindowSceneDelegate/);
  assert.match(host, /configurationForConnecting/);
  assert.match(host, /UIWindow\(windowScene: windowScene\)/);
  assert.match(plist, /UIApplicationSceneManifest/);
  assert.match(plist, /UISceneDelegateClassName/);
  assert.match(
    source("scripts/qa/siglip-device-project.pbxproj"),
    /INFOPLIST_FILE = host-info.plist/,
  );
});
test("helper cannot replace real app, request private camera or silently repeat predictions", () => {
  const host = source("scripts/qa/siglip-device-host.swift");
  assert.match(
    source("scripts/qa/siglip-device-project.pbxproj"),
    /PRODUCT_BUNDLE_IDENTIFIER = fi.roopeaaltonen.siglipvalidation/,
  );
  assert.match(host, /\.withoutOverwriting/);
  assert(host.indexOf('"qa-started.json"') < host.indexOf("let encoder = try SiglipImageEncoder"));
  assert.doesNotMatch(
    host,
    /URLSession|URLRequest|AVCapture|UIImagePicker|PHPhotoLibrary|analytics|apiKey/,
  );
});

test("build recipe requires a device argument instead of publishing personal device IDs", () => {
  const build = source("scripts/qa/siglip-native-build.mjs");
  assert.match(build, /const device = process.argv\[3\]/);
  assert.match(build, /device_argument/);
  assert.doesNotMatch(build, /id=0000[0-9A-F-]{15,}/);
});
