import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (p) => fs.readFileSync(p, "utf8");
test("Expo Go routes separate opt-in own-server inference from native and paid routes", () => {
  assert.match(
    read("mobile/app/src/app/local-photo.tsx"),
    /usesNetworkRecognition\(Platform\.OS,\s*isExpoGoHost\(\)\)\s*\?\s*\(\s*<NetworkPhotoScreen \/>\s*\)\s*:\s*\(\s*<NativeLocalPhotoScreen \/>/,
  );
  assert.match(
    read("mobile/app/src/app/photo.tsx"),
    /isExpoGoHost\(\) \? <ExpoGoRecognition \/> : <Native/,
  );
  const network = read("mobile/app/src/components/network-photo-screen.tsx");
  assert.match(network, /client\.recognize\(jpeg,\s*true,\s*controller.signal\)/);
  assert.match(network, /testID="network-photo-send"/);
  assert.doesNotMatch(network, /requestPhoto|recognizeOfflineProduct|OpenAI/);
  const recovery = read("mobile/app/src/components/expo-go-recognition.tsx");
  for (const route of ["scan", "manual", "guide", "material-code"])
    assert.ok(recovery.includes(`router.push("/${route}")`));
  assert.doesNotMatch(
    recovery,
    /useCameraPermissions|requestPhoto|fetch\(|recognizeOfflineProduct|OpenAI/,
  );
  assert.match(read("mobile/app/src/features/runtime/host.ts"), /isRunningInExpoGo\(\)/);
});
test("Expo Go startup is explicit and keeps native development workflow separate", () => {
  const root = JSON.parse(read("package.json")).scripts,
    mobile = JSON.parse(read("mobile/app/package.json")).scripts;
  assert.equal(root["dev:expo-go"], "pnpm --filter @kierratysappi/mobile start:go");
  assert.equal(mobile["start:go"], "expo start --go");
  assert.equal(mobile["start:dev-client"], "expo start --dev-client");
  assert.doesNotMatch(read("mobile/app/src/features/runtime/host.ts"), /expoConfig|appOwnership/);
});
