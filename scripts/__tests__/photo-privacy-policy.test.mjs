import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("photo entry passes the real native constants to the tested compatibility guard", () => {
  const screen = read("mobile/app/src/app/photo.tsx");
  assert.match(screen, /canUsePhotoCapture\(Platform\.OS, Constants\)/u);
  assert.doesNotMatch(screen, /Constants\.nativeBuildVersion|Constants\.expoConfig/u);
  assert.match(screen, /photoOpening/u);
});

test("photo upload is a separate explicit preview action, with metadata removal and cancellation", () => {
  const screen = read("mobile/app/src/app/photo.tsx");
  assert.match(screen, /phase !== "preview"/u);
  assert.match(screen, /preparePhotoBase64/u);
  assert.match(screen, /removeCapture\(picture.uri\)/u);
  assert.match(screen, /pending.current\?\.abort/u);
  assert.match(screen, /state === "background"/u);
  assert.match(screen, /photoSend/u);
  assert.doesNotMatch(screen, /addHistoryEntry|AsyncStorage|trackTechnicalEvent/u);
  assert.doesNotMatch(
    read("mobile/app/src/features/photo/api.ts"),
    /OPENAI_API_KEY|api.openai.com/u,
  );
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
  assert.equal(app.ios.buildNumber, "13");
  assert.equal(app.android.versionCode, 3);
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

test("paid photo boundary is development-only, bounded and separate from normal lookup logging/cache", () => {
  const config = read("backend/api/src/config.ts");
  assert.match(config, /NODE_ENV === "development"/u);
  const routes = read("backend/api/src/photo-routes.ts");
  assert.match(routes, /admitted >= 20/u);
  assert.match(routes, /active >= 2/u);
  assert.match(routes, /max: 3/u);
  assert.match(routes, /no-store/u);
  assert.doesNotMatch(routes, /request.log|console\.|writeFile|cache\.set/u);
  assert.match(read("backend/data-providers/src/photo-recognition.ts"), /store: false/u);
});
