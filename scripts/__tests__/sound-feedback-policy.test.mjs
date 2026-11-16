import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
test("audio plugin disables recording and both background modes, preserving mic block", () => {
  const config = JSON.parse(read("mobile/app/app.json")).expo;
  const audio = config.plugins.find((item) => Array.isArray(item) && item[0] === "expo-audio");
  assert.deepEqual(audio[1], {
    microphonePermission: false,
    recordAudioAndroid: false,
    enableBackgroundPlayback: false,
    enableBackgroundRecording: false,
  });
  assert.ok(config.android.blockedPermissions.includes("android.permission.RECORD_AUDIO"));
  assert.equal(config.ios.infoPlist.NSMicrophoneUsageDescription, undefined);
  assert.ok(!(config.ios.infoPlist.UIBackgroundModes ?? []).includes("audio"));
});

test("playback adapter is local-only, quiet, non-recording and guarded lazy native loading", () => {
  const loader = read("mobile/app/src/features/sound-feedback/load-driver.ts");
  assert.match(loader, /await import\("expo-audio"\)/u);
  assert.doesNotMatch(loader, /import\s+.*\s+from\s+["']expo-audio/u);
  for (const key of [
    "playsInSilentMode",
    "allowsRecording",
    "shouldPlayInBackground",
    "allowsBackgroundRecording",
    "downloadFirst",
    "keepAudioSessionActive",
  ])
    assert.match(loader, new RegExp(`${key}: false`, "u"));
  assert.match(loader, /interruptionMode: "mixWithOthers"/u);
  for (const cue of ["tap", "ready", "confirm", "attention"])
    assert.match(loader, new RegExp(`sounds/${cue}\\.wav`, "u"));
  assert.doesNotMatch(loader, /https?:|requestRecording|sampling|setActiveForLockScreen/u);
  const driver = read("mobile/app/src/features/sound-feedback/driver.ts");
  assert.match(driver, /player\.loop = false/u);
  assert.match(driver, /player\.volume = 0\.28/u);
  assert.match(driver, /isCurrent\(\)/u);
});

test("sound lifecycle remains optional and respects screen, reader, foreground and preference", () => {
  const context = read("mobile/app/src/features/sound-feedback/context.tsx");
  assert.match(context, /isScreenReaderEnabled/u);
  assert.match(context, /screenReaderChanged/u);
  assert.match(context, /AppState\.addEventListener/u);
  assert.match(context, /previousPath\.current === pathname/u);
  assert.match(context, /instance\.dispose\(\)/u);
  assert.match(context, /ticket !== generation\.current/u);
  assert.match(context, /readSoundPreference/u);
  const root = read("mobile/app/src/app/_layout.tsx");
  assert.ok(root.indexOf("<SoundFeedbackProvider>") < root.indexOf("<ScanSessionProvider>"));
  assert.match(
    read("mobile/app/src/app/legal.tsx"),
    /await clearAllLocalData\(\);\s+reloadAfterDeletion\(\)/u,
  );
});

test("FI and EN sound controls are visible, labelled and at least44pt, not per-key noise", () => {
  const settings = read("mobile/app/src/app/settings.tsx");
  assert.match(settings, /testID="sound-feedback-switch"/u);
  assert.match(settings, /accessibilityLabel=\{t\("soundFeedbackTitle"\)\}/u);
  assert.match(settings, /minimumTouchTarget/u);
  assert.match(settings, /event\.key !== " "/u);
  assert.match(settings, /event\.preventDefault\(\)/u);
  assert.match(settings, /event\.repeat === true/u);
  const translations = read("mobile/localization/src/sound-feedback.ts");
  assert.match(translations, /soundFeedbackFi/u);
  assert.match(translations, /soundFeedbackEn/u);
  assert.doesNotMatch(read("mobile/app/src/components/ui.tsx"), /useSoundFeedback|play\("tap"\)/u);
});

test("neutral completion and explicit committed-save cues preserve visible feedback", () => {
  for (const file of ["local-photo.tsx", "photo.tsx", "nearby.tsx"]) {
    const source = read(`mobile/app/src/app/${file}`);
    assert.match(source, /play\("ready"\)/u);
    assert.match(source, /announceAccessibility/u);
    assert.doesNotMatch(source, /play\("confirm"\)/u);
  }
  const save = read("mobile/app/src/components/recycle-action.tsx");
  assert.ok(save.indexOf("await recordRecycling") < save.indexOf('play("confirm")'));
  assert.match(save, /if \(active\.current\)/u);
});
