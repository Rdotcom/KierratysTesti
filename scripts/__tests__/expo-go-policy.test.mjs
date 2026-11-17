import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (p) => fs.readFileSync(p, "utf8");
test("Expo Go routes separate opt-in own-server inference from native; old links use the same flow", () => {
  const smoke = read("scripts/qa/browser-ai-smoke.mjs");
  assert.match(smoke, /baseExpect\.configure\(\{ timeout: 20000 \}\)/u);
  assert.match(smoke, /expect\(page\)\.toHaveURL/u);
  assert.match(
    read("mobile/app/src/app/local-photo.tsx"),
    /usesNetworkRecognition\(Platform\.OS,\s*isExpoGoHost\(\)\)\s*\?\s*\(\s*<NetworkPhotoScreen \/>\s*\)\s*:\s*\(\s*<NativeLocalPhotoScreen \/>/,
  );
  assert.match(read("mobile/app/src/app/photo.tsx"), /<Redirect href="\/local-photo" \/>/);
  const network = read("mobile/app/src/components/network-photo-screen.tsx");
  assert.match(network, /client\.recognize\(jpeg,\s*true,\s*controller.signal\)/);
  assert.match(network, /<RecognitionConsent/);
  assert.match(network, /phase !== "preview" \|\| !consent/);
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
test("native, Go and browser use the same heading, start, preview and recovery components", () => {
  for (const file of [
    "app/local-photo.tsx",
    "components/network-photo-screen.tsx",
    "components/network-photo-screen.web.tsx",
  ]) {
    const source = read(`mobile/app/src/${file}`);
    for (const component of [
      "RecognitionHeading",
      "RecognitionStart",
      "RecognitionPreview",
      "RecognitionRecovery",
    ])
      assert.match(source, new RegExp(`<${component}\\b`));
  }
  const shared = read("mobile/app/src/components/recognition-presentation.tsx");
  assert.match(shared, /height: 300/);
  assert.match(shared, /t\("localVisionPreview"\)/);
  assert.match(shared, /t\("recognitionAction"\)/);
  assert.doesNotMatch(shared, /isExpoGoHost|usesNetworkRecognition|Platform\.OS/);
});
test("Go and web require a fresh explicit consent after the shared preview", () => {
  for (const file of ["network-photo-screen.tsx", "network-photo-screen.web.tsx"]) {
    const source = read(`mobile/app/src/components/${file}`);
    assert.match(source, /const \[consent, setConsent\] = useState\(false\)/);
    assert.match(source, /phase !== "preview" \|\| !consent/);
    assert.match(source, /setJpeg\(undefined\);\s*setConsent\(false\)/);
    assert.match(source, /onRecognize=\{\(\) => setConsent\(true\)\}/);
    assert.match(source, /onConfirm=\{\(\) => void send\(\)\}/);
    assert.match(source, /phase === "result" \? "offlineProductNewCode" : "localVisionCancel"/);
  }
  const shared = read("mobile/app/src/components/recognition-presentation.tsx");
  assert.match(shared, /testID="network-photo-send"/);
  assert.match(shared, /t\("networkConsent"\)/);
  assert.match(shared, /t\("networkHttpNotice"\)/);
  assert.match(shared, /t\("networkRecipient"\)/);
});
test("shared manual barcode uses the actual expanded session and ignores late navigation", () => {
  const shared = read("mobile/app/src/components/recognition-presentation.tsx");
  assert.match(shared, /lookupBarcode\(value, "manual"\)/);
  assert.match(shared, /ticket !== generation.current/);
  assert.match(shared, /Keyboard.dismiss\(\)/);
  assert.match(shared, /locked.current \|\| captureBusy \|\| !value.trim\(\)/);
  assert.match(shared, /editable=\{!captureBusy && !busy\}/);
  assert.match(shared, /AppState.addEventListener\("change"/);
  assert.match(shared, /testID="recognition-manual-error"/);
  assert.match(shared, /beforeNavigate\(\);\s*router.push\("\/result"\)/);
  assert.doesNotMatch(shared, /offlineCatalogue|fetch\(|AsyncStorage|recognizeLocalPhoto/);
});
test("Expo Go startup is explicit and keeps native development workflow separate", () => {
  const root = JSON.parse(read("package.json")).scripts,
    mobile = JSON.parse(read("mobile/app/package.json")).scripts;
  assert.equal(root["dev:expo-go"], "pnpm --filter @kierratysappi/mobile start:go");
  assert.equal(mobile["start:go"], "expo start --go");
  assert.equal(mobile["start:dev-client"], "expo start --dev-client");
  assert.doesNotMatch(read("mobile/app/src/features/runtime/host.ts"), /expoConfig|appOwnership/);
});
