import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const screen = fs.readFileSync(
  new URL("../../mobile/app/src/app/local-photo.tsx", import.meta.url),
  "utf8",
);
test("every local camera mount gets a bounded size instead of Expo Photo default", () => {
  assert.match(screen, /useState<string>\(localPhotoInitialSize\)/);
  assert.match(screen, /pictureSize=\{pictureSize\}/);
  assert.match(screen, /setPictureSize\(localPhotoInitialSize\)/);
  assert.doesNotMatch(screen, /pictureSize \? \{ pictureSize \} : \{\}/);
});
test("shutter readiness waits for size selection and ignores stale view/generation", () => {
  const handler = screen.slice(
    screen.indexOf("onCameraReady="),
    screen.indexOf('testID="local-photo-capture"'),
  );
  assert(handler.indexOf("setReady(false)") < handler.indexOf("resolvePhotoCaptureSize"));
  assert(handler.indexOf("resolvePhotoCaptureSize") < handler.indexOf("setReady(true)"));
  assert.match(handler, /cameraGeneration !== generation.current \|\| camera.current !== view/);
  assert.match(screen, /disabled=\{busy \|\| !ready\}/);
});
