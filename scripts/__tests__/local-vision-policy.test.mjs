import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const local = () => source("mobile/app/src/app/local-photo.tsx");

test("the local module packages an explicit no-tracking privacy manifest and elapsed-time API reason", () => {
  const manifest = source("mobile/app/modules/local-vision/ios/PrivacyInfo.xcprivacy");
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(manifest, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
  assert.match(manifest, /NSPrivacyAccessedAPICategorySystemBootTime/);
  assert.match(manifest, /<string>35F9\.1<\/string>/);
  const podspec = source("mobile/app/modules/local-vision/ios/KierratysLocalVision.podspec");
  assert.match(podspec, /s\.resource_bundles/);
  assert.match(podspec, /'KierratysLocalVisionPrivacy' => \['PrivacyInfo\.xcprivacy'\]/);
});

test("native recognition uses local bounded Vision work and per-class operating points, not global score ranking", () => {
  const engine = source("mobile/app/modules/local-vision/ios/local-vision-engine.swift");
  assert.match(engine, /import Vision/);
  assert.match(engine, /hasPrecisionRecallCurve/);
  assert.match(engine, /hasMinimumRecall\(/);
  assert.match(engine, /apple-class-operating-point-v1/);
  assert.match(engine, /local-vision-v4/);
  assert.match(engine, /material-code-lexicon-v1/);
  assert.match(engine, /text\.usesLanguageCorrection = true/);
  assert.match(engine, /text\.customWords =/);
  const lexicon = engine.match(/materialCodeAbbreviations = \[([\s\S]*?)\]/u)?.[1];
  assert.ok(lexicon);
  assert.deepEqual(
    [...lexicon.matchAll(/"([A-Z]+)"/gu)].map((match) => match[1]),
    ["PET", "HDPE", "PVC", "LDPE", "PP", "PS", "PAP", "FE", "ALU", "FOR", "COT", "TEX", "GL"],
  );
  assert.match(engine, /maxBytes = 1_500_000/);
  assert.match(engine, /16_000_000/);
  assert.match(engine, /inFlight/);
  assert.match(engine, /deadlineSeconds/);
  assert.match(engine, /lines.count <= 24 \? lines : \[\]/);
  assert.doesNotMatch(
    engine,
    /URLSession|URLRequest|CGImageSourceCreateWithURL|FileHandle|NSLog|print\(/,
  );
  const module = source("mobile/app/modules/local-vision/ios/local-vision-module.swift");
  assert.match(module, /Name\("KierratysLocalVision"\)/);
  assert.match(module, /AsyncFunction\("recognize"\)/);
});

test("cloud fee disclosure remains specific to the explicit separate cloud entry", () => {
  const screen = local();
  assert.match(screen, /t\("localVisionCloudCost"\)/);
  const messages = source("mobile/localization/src/local-vision.ts");
  assert.match(messages, /maksullista rajapintaa/);
  assert.match(messages, /paid API/);
  const privacy = source("mobile/app/src/app/legal.tsx");
  assert.match(privacy, /t\("localVisionPrivacy"\)/);
  assert.match(privacy, /t\("localVisionCloud"\)/);
});

// Source-policy checks supplement pure/native tests and browser interaction;
// they are not physical camera, recognition accuracy or a network packet audit.
test("the AI entry defaults to local recognition, with cloud available only by a named separate action", () => {
  const identify = source("mobile/app/src/app/identify.tsx");
  assert.match(identify, /router\.push\("\/local-photo"\)/);
  assert.doesNotMatch(identify, /router\.push\("\/photo"\)/);
  const screen = local();
  assert.match(screen, /testID="local-photo-cloud-action"/);
  assert.match(screen, /label=\{t\("localVisionCloud"\)\}/);
  assert.match(screen, /accessibilityHint=\{t\("localVisionCloudHint"\)\}/);
  assert.match(screen, /onPress=\{\(\) => router\.push\("\/photo"\)\}/);
  assert.doesNotMatch(
    screen,
    /photoAvailable|requestPhoto|features\/photo\/api|fetch\(|XMLHttpRequest|WebSocket|https?:\/\//,
  );
});

test("local camera capture and recognition remain separate explicit actions without a server-capability gate", () => {
  const screen = local();
  assert.match(screen, /const open = async/);
  assert.match(screen, /requestPermission\(\)/);
  assert.match(screen, /const capture = async/);
  assert.match(screen, /testID="local-photo-capture"/);
  assert.match(screen, /const recognize = async/);
  assert.match(screen, /phase !== "preview"/);
  assert.match(screen, /recognizeLocalPhoto\(jpeg, controller\.signal\)/);
  assert.match(screen, /testID="local-photo-recognize"/);
  assert.match(screen, /!canUseLocalPhotoCapture\(Platform\.OS, Constants, available\)/);
  assert.match(screen, /local-photo-unavailable/);
  assert.doesNotMatch(screen, /useEffect|photoAvailable|requestPhoto|AsyncStorage|console\./);
});

test("local media is bounded and cleared on cancellation, blur and background without preserving raw OCR", () => {
  const screen = local();
  assert.match(screen, /preparePhotoBase64\(picture\.base64/);
  assert.match(screen, /exif: false/);
  assert.match(screen, /finally\s*\{\s*removeCapture\(picture\.uri\)/);
  assert.match(screen, /isLocalCaptureUri\(uri, Paths\.cache\.uri\)/);
  assert.match(screen, /pending\.current\?\.abort\(\)/);
  assert.match(screen, /generation\.current\+\+/);
  assert.match(screen, /ticket !== generation\.current/);
  assert.match(screen, /AppState\.addEventListener\("change"/);
  assert.match(
    screen,
    /shouldClearLocalPhotoState\(state, Platform\.OS, permissionPrompt\.current\)/,
  );
  assert.match(screen, /waitForCameraPermissionResume/);
  assert.match(screen, /subscription\.remove\(\)/);
  assert.match(screen, /setJpeg\(undefined\)/);
  assert.match(screen, /setObservation\(undefined\)/);
  assert.doesNotMatch(
    screen,
    /textLines|writeAsString|writeFile|history\/storage|analytics|telemetry/,
  );
});

test("native availability is explicit and platform-specific, never a fake web or cloud implementation", () => {
  const native = source("mobile/app/src/features/local-vision/native.ts");
  assert.match(native, /Platform\.OS !== "ios"/);
  assert.match(native, /Platform\.OS !== "android"/);
  assert.match(native, /recognizeAndroidEvidence/);
  assert.match(native, /requireOptionalNativeModule/);
  assert.match(native, /KierratysLocalVision/);
  assert.match(native, /typeof module\.recognize === "function"/);
  assert.doesNotMatch(
    native,
    /fetch\(|requestPhoto|photoAvailable|OPENAI|https?:\/\/|process\.env/,
  );
  const runner = source("mobile/app/src/features/local-vision/recognizer.ts");
  assert.match(runner, /normalizeLocalVisionResult\(raw\)/);
  assert.match(runner, /preparePhotoBase64\(jpeg\)/);
  assert.match(runner, /if \(running\) return failure\("busy"\)/);
  assert.match(runner, /Promise\.race\(\[operation, cancelled\]\)/);
  assert.match(runner, /signal\.removeEventListener\("abort", abort\)/);
  assert.doesNotMatch(runner, /fetch\(|requestPhoto|photoAvailable|console\.|writeFile/);
});

test("local estimates do not infer sorting, and marking navigation still requires manual confirmation", () => {
  const screen = local();
  assert.match(screen, /localVisionEstimate/);
  assert.match(screen, /localVisionUnknown/);
  assert.match(screen, /localVisionLimit/);
  assert.match(screen, /localVisionSource/);
  for (const field of [
    "classificationRevision",
    "ocrRevision",
    "osVersion",
    "normalizerVersion",
    "observedAt",
  ])
    assert.ok(screen.includes(`observation.source.${field}`), field);
  assert.match(screen, /observation\.markings\.status === "candidates"/);
  assert.match(screen, /pathname: "\/material-code"/);
  assert.match(screen, /code: marking\.text/);
  assert.doesNotMatch(
    screen,
    /sortPackagingComponent|sortRecognizedMaterialCode|SortingResultCard|canConfirmPhotoPart|PhotoEstimate/,
  );
  const markingScreen = source("mobile/app/src/app/material-code.tsx");
  assert.match(markingScreen, /const prefill = materialCodePrefill\(params\.code\)/);
  assert.match(markingScreen, /useState\(""\)/);
  assert.match(markingScreen, /useEffect\(\(\) => \{\s*setValue\(prefill\);/);
  assert.match(markingScreen, /materialCodeParseAction/);
  assert.doesNotMatch(markingScreen, /materialCodeConfirmAction/);
  assert.match(
    markingScreen,
    /nextAttempt.status === "recognized"[\s\S]*sortRecognizedMaterialCode/,
  );
  const prefillEffect = markingScreen.match(
    /useEffect\(\(\) => \{([\s\S]*?)\}, \[prefill\]\)/,
  )?.[1];
  assert.match(
    prefillEffect ?? "",
    /^\s*setValue\(prefill\);\s*setAttempt\(undefined\);\s*setSorting\(undefined\);\s*$/,
  );
  assert.doesNotMatch(markingScreen, /useFocusEffect/);
});

test("FI and EN local copy keep image inference, material checking, unavailable recovery and cloud recipient explicit", () => {
  const messages = source("mobile/localization/src/local-vision.ts");
  const en = messages.indexOf("export const localVisionEn:");
  assert.ok(en > 0);
  for (const block of [messages.slice(0, en), messages.slice(en)]) {
    for (const key of [
      "localVisionTitle",
      "localVisionIntro",
      "localVisionLimit",
      "localVisionPrivacy",
      "localVisionUnavailable",
      "localVisionUnknown",
      "localVisionMarkingHint",
      "localVisionConflicting",
      "localVisionSource",
      "localVisionCloud",
      "localVisionCloudHint",
      "localVisionBusy",
      "localVisionTimeout",
    ])
      assert.match(block, new RegExp(`\\b${key}:`));
    assert.match(block, /OpenAI/);
    assert.match(block, /Apple Vision/);
    assert.match(block, /ei varmista|does not verify/);
    assert.match(block, /ei varmennettu|not verified/);
  }
  assert.doesNotMatch(messages, /100\s*%|guaranteed|varmasti tunnistaa|kaikki tuotteet/iu);
  const screen = local();
  assert.doesNotMatch(
    screen,
    /numberOfLines=|maxFontSizeMultiplier=|allowFontScaling=\{false\}|adjustsFontSizeToFit/,
  );
  assert.match(screen, /accessibilityRole="alert"/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
});
