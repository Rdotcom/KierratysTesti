import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const screen = read("mobile/app/src/app/local-photo.tsx");
const client = read("mobile/app/src/features/local-vision/readiness.ts");

test("local readiness precedes permission and stale/unavailable checks precede camera entry", () => {
  const open = screen.slice(
    screen.indexOf("const open = async"),
    screen.indexOf("const capture = async"),
  );
  const inspect = open.indexOf("await inspectLocalVisionReadiness(controller.signal)");
  const stale = open.indexOf("ticket !== generation.current || controller.signal.aborted");
  const unavailable = open.indexOf('inspected.status === "unavailable"');
  const permission = open.indexOf("await requestPermission()");
  assert.ok(inspect >= 0 && inspect < stale && stale < unavailable && unavailable < permission);
  assert.match(
    open.slice(unavailable, permission),
    /setError\(localReadinessMessage\(inspected\)\);\s*return;/,
  );
  assert.ok(permission < open.indexOf('setPhase("camera")'));
  assert.doesNotMatch(open, /recognizeLocalPhoto|takePicture|fetch\(|requestPhoto/);
});

test("background/blur clear aborts readiness, removes partial snapshot and cannot reopen camera late", () => {
  const clear = screen.slice(
    screen.indexOf("const clear = useCallback"),
    screen.indexOf("useFocusEffect("),
  );
  assert.match(clear, /pending\.current\?\.abort\(\)/);
  assert.match(clear, /setReadiness\(undefined\)/);
  assert.match(clear, /setChecking\(false\)/);
  assert.match(clear, /generation\.current\+\+/);
  assert.match(screen, /AppState\.addEventListener\("change"/);
  assert.match(
    screen,
    /shouldClearLocalPhotoState\(state, Platform\.OS, permissionPrompt\.current\)/,
  );
  assert.match(screen, /waitForCameraPermissionResume/);
});

test("readiness UI reports only partial support, not verified inference or arbitrary success metrics", () => {
  assert.match(screen, /readiness\?\.status === "primary_only"/);
  assert.match(screen, /testID="local-photo-readiness-partial"/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
  assert.match(screen, /checking\s*\?\s*"localVisionChecking"/);
  assert.doesNotMatch(screen, /readiness\.(?:accuracy|confidence|material|destination)/);
  assert.match(client, /normalizeLocalVisionReadiness\(result\)/);
  assert.doesNotMatch(client, /fetch\(|requestPermission|recognize\(|readFile|\.write|console\./);
});

test("legacy readiness does not assert that a model is absent and both locales recover", () => {
  const copy = read("mobile/localization/src/local-vision.ts");
  assert.match(copy, /ei ilmoita täydentävän mallin valmiutta/);
  assert.match(copy, /does not report supplemental-model readiness/);
  for (const key of [
    "localVisionChecking",
    "localVisionReadinessLegacy",
    "localVisionReadinessPlatform",
    "localVisionReadinessPartial",
    "localVisionReadinessBusy",
    "localVisionReadinessTimeout",
    "localVisionReadinessError",
  ])
    assert.equal([...copy.matchAll(new RegExp(`${key}:`, "gu"))].length, 2, key);
});
