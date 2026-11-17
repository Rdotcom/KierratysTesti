import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const screen = () => source("mobile/app/src/app/local-photo.tsx");

function button(sourceText, id) {
  const marker = sourceText.indexOf(`testID="${id}"`);
  assert.ok(marker >= 0, `Missing ${id}`);
  const start = sourceText.lastIndexOf("<Button", marker);
  const end = sourceText.indexOf("/>", marker);
  assert.ok(start >= 0 && end >= marker, `Invalid button ${id}`);
  return sourceText.slice(start, end + 2);
}

// These source guards complement pure lifecycle tests and real browser recovery.
// They do not execute an iPhone camera, infer image accuracy or prove native focus.
test("capture guidance stays visible and localized without hiding long text", () => {
  const text = screen();
  assert.match(text, /testID="local-photo-capture-guidance"/);
  assert.match(
    text,
    /mode === "product" \? "offlineProductGuidance" : "localVisionCaptureGuidance"/,
  );
  const copy = source("mobile/localization/src/local-vision.ts");
  for (const phrase of [
    "Kuvaa yksi pakkaus",
    "vältä heijastuksia",
    "Photograph one package",
    "avoid reflections",
  ])
    assert.ok(copy.includes(phrase), phrase);
  assert.doesNotMatch(
    text,
    /numberOfLines=|maxFontSizeMultiplier=|allowFontScaling=\{false\}|adjustsFontSizeToFit/,
  );
});

test("permanent camera denial renders one recovery alert without hiding unrelated errors", () => {
  const text = screen();
  assert.match(text, /localPhotoPresentation/);
  assert.match(text, /presentation\.inlineError &&/);
  assert.match(text, /presentation\.permanentDenied \?/);
  assert.match(text, /testID="local-photo-permission-denied"/);
  assert.equal([...text.matchAll(/t\("cameraDenied"\)/gu)].length, 1);
  const presentation = source("mobile/app/src/features/local-vision/presentation.ts");
  assert.match(
    presentation,
    /inlineError: permanentDenied && input\.error === "cameraDenied" \? undefined : input\.error/u,
  );
});

test("late camera-ready, mount-error and size callbacks cannot update a newer generation", () => {
  const text = screen();
  assert.match(text, /const cameraGeneration = generation\.current/u);
  assert.equal(
    [...text.matchAll(/if \(cameraGeneration !== generation\.current\) return;/gu)].length,
    2,
  );
  assert.match(
    text,
    /if \(cameraGeneration !== generation\.current \|\| camera\.current !== view\) return;\s*setPictureSize\(size\);\s*setReady\(true\)/u,
  );
});

test("retake explicitly clears the previous image then opens a fresh camera without recognition", () => {
  const text = screen();
  const handler = text.match(/const retake = (?:async )?\(\) => \{([\s\S]*?)\n {2}\};/u)?.[1];
  assert.ok(handler, "Missing explicit retake handler");
  assert.ok(handler.indexOf("clear()") >= 0);
  assert.ok(handler.indexOf("open()") > handler.indexOf("clear()"));
  assert.doesNotMatch(handler, /recognize|takePicture|capture\(/u);
  assert.match(button(text, "local-photo-reset"), /onPress=\{retake\}/u);
  assert.match(text, /<RecognitionPreview[\s\S]*?onRetake=\{retake\}/u);
  assert.match(
    button(source("mobile/app/src/components/recognition-presentation.tsx"), "local-photo-retake"),
    /onPress=\{onRetake\}/u,
  );
});

test("local failure has an explicit barcode recovery that clears sensitive view state", () => {
  assert.match(screen(), /<RecognitionRecovery\s+beforeNavigate=\{clear\}/);
  const shared = source("mobile/app/src/components/recognition-presentation.tsx");
  const recovery = button(shared, "local-photo-barcode-action");
  assert.match(recovery, /navigate\("\/scan"\)/u);
  assert.match(shared, /beforeNavigate\(\);\s*router.push\(route\)/);
  assert.doesNotMatch(recovery, /requestPermission|recognizeLocalPhoto|takePicture/u);
});

test("material-code query prefill waits for hydration without checking or confirming", () => {
  const text = source("mobile/app/src/app/material-code.tsx");
  assert.match(text, /const \[value, setValue\] = useState\(""\)/u);
  assert.match(text, /const prefill = materialCodePrefill\(params\.code\)/u);
  const effect = text.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[prefill\]\)/u)?.[1];
  assert.ok(effect);
  assert.match(effect, /setValue\(prefill\)/u);
  assert.match(effect, /setAttempt\(undefined\)/u);
  assert.match(effect, /setSorting\(undefined\)/u);
  assert.doesNotMatch(effect, /parseMaterial|sortRecognized|confirm\(/u);
  assert.match(text, /disabled=\{value\.trim\(\)\.length === 0\}/u);
});
