import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("own-server recognition is explicit, ephemeral, bounded and separate from paid inference", () => {
  const screen = read("mobile/app/src/components/network-photo-screen.tsx");
  const capture = screen.slice(screen.indexOf("const capture ="), screen.indexOf("const send ="));
  assert.doesNotMatch(capture, /client\.recognize|fetch\(|requestPhoto/);
  assert.match(capture, /preparePhotoBase64/);
  assert.match(capture, /removeCapture\(photo.uri\)/);
  assert.match(screen, /phase !== "preview"/);
  assert.match(screen, /pending.current\?\.abort/);
  assert.match(read("mobile/app/src/components/recognition-presentation.tsx"), /networkHttpNotice/);
  assert.match(screen, /networkRecipient/);
  assert.doesNotMatch(screen, /AsyncStorage|addHistoryEntry|trackTechnicalEvent|console\./);
  const worker = read("backend/data-providers/python/siglip-worker.py");
  assert.doesNotMatch(worker, /requests\.|urllib|openai|write_bytes|write_text/);
  const provider = read("backend/data-providers/src/siglip-recognition.ts");
  assert.match(provider, /12_000/);
  assert.match(provider, /SIGKILL/);
  assert.match(provider, /input.fill\(0\)/);
  const routes = read("backend/api/src/object-image-routes.ts");
  assert.match(routes, /max: 4/);
  assert.match(routes, /no-store/);
  assert.doesNotMatch(routes, /request.log|console\.|writeFile|cache\.set/);
  assert.match(read("mobile/app/src/app/legal.tsx"), /networkConsent/);
});

test("native photo entry passes real installed constants to the camera guard", () => {
  const screen = read("mobile/app/src/app/local-photo.tsx");
  assert.match(screen, /canUseLocalPhotoCapture\(Platform\.OS, Constants, available\)/u);
  assert.doesNotMatch(screen, /Constants\.nativeBuildVersion|Constants\.expoConfig/u);
});

test("legacy photo links redirect without camera, upload or paid provider code", () => {
  const screen = read("mobile/app/src/app/photo.tsx");
  assert.match(screen, /<Redirect href="\/local-photo" \/>/u);
  assert.doesNotMatch(screen, /useCameraPermissions|fetch\(|requestPhoto|OpenAI|CameraView/u);
});

test("native permission purpose includes both barcode and explicitly approved image recognition", () => {
  const app = JSON.parse(read("mobile/app/app.json")).expo;
  const camera = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-camera");
  for (const purpose of [app.ios.infoPlist.NSCameraUsageDescription, camera[1].cameraPermission]) {
    assert.match(purpose, /viivakoodin/u);
    assert.match(purpose, /tuotteen kuvaamiseen/u);
    assert.match(purpose, /erillisellä hyväksynnälläsi/u);
    assert.doesNotMatch(purpose, /ei lähetetä/u);
  }
  assert.equal(camera[1].recordAudioAndroid, false);
  assert.equal(app.ios.buildNumber, "23");
  assert.equal(app.android.versionCode, 7);
  assert.equal(
    JSON.parse(read("mobile/app/locales/fi.json")).ios.NSCameraUsageDescription,
    camera[1].cameraPermission,
  );
  assert.match(
    JSON.parse(read("mobile/app/locales/en.json")).ios.NSCameraUsageDescription,
    /separate approval/u,
  );
});

test("standalone development client describes the real local product server in FI and EN", () => {
  const app = JSON.parse(read("mobile/app/app.json")).expo;
  const fi = JSON.parse(read("mobile/app/locales/fi.json")).ios;
  const en = JSON.parse(read("mobile/app/locales/en.json")).ios;
  assert.equal(app.ios.infoPlist.NSLocalNetworkUsageDescription, fi.NSLocalNetworkUsageDescription);
  assert.match(fi.NSLocalNetworkUsageDescription, /tuotehakuun Macin palvelimelta/u);
  assert.match(en.NSLocalNetworkUsageDescription, /look up products.*server on your Mac/u);
  for (const purpose of [fi.NSLocalNetworkUsageDescription, en.NSLocalNetworkUsageDescription])
    assert.doesNotMatch(purpose, /Dev Launcher|discover/u);
});

test("server startup and public exports cannot enable the removed paid implementation", () => {
  for (const path of [
    "backend/api/src/server.ts",
    "backend/api/src/config.ts",
    "backend/api/src/app.ts",
    "backend/data-providers/src/index.ts",
  ]) {
    assert.doesNotMatch(
      read(path),
      /OpenAiPhotoRecognizer|OPENAI_API_KEY|PHOTO_AI_ENABLED|registerPhotoRoutes|photoRecognizer/u,
    );
  }
  assert.doesNotMatch(read("backend/api/.env.example"), /OPENAI|PHOTO_AI/u);
  assert.doesNotMatch(read("shared/contracts/package.json"), /photo-recognition/u);
});
