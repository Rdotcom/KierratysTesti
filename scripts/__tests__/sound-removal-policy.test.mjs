import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (p) => fs.readFileSync(p, "utf8");
test("custom sound and haptic feature, assets, dependencies and settings are removed", () => {
  const pkg = JSON.parse(read("mobile/app/package.json"));
  for (const name of ["expo-audio", "expo-haptics"])
    assert.equal(pkg.dependencies[name], undefined);
  const config = JSON.parse(read("mobile/app/app.json")).expo;
  assert(!config.plugins.some((p) => (Array.isArray(p) ? p[0] : p) === "expo-audio"));
  assert(config.android.blockedPermissions.includes("android.permission.RECORD_AUDIO"));
  for (const file of [
    "mobile/app/src/features/sound-feedback/context.tsx",
    "mobile/localization/src/sound-feedback.ts",
    "scripts/generate-interface-sounds.mjs",
  ])
    assert(!fs.existsSync(file));
  assert(
    !fs.existsSync("mobile/app/assets/sounds") ||
      !fs.readdirSync("mobile/app/assets/sounds").some((n) => /\.(wav|mp3|m4a)$/.test(n)),
  );
  for (const file of [
    "_layout.tsx",
    "settings.tsx",
    "nearby.tsx",
    "overview.tsx",
    "photo.tsx",
    "local-photo.tsx",
    "legal.tsx",
  ]) {
    assert.doesNotMatch(
      read(`mobile/app/src/app/${file}`),
      /useSoundFeedback|SoundFeedbackProvider|soundFeedback|play\("/,
    );
  }
});
test("visual and screen-reader feedback remain after removing sound", () => {
  for (const file of ["local-photo.tsx", "photo.tsx", "nearby.tsx", "overview.tsx"])
    assert.match(read(`mobile/app/src/app/${file}`), /announceAccessibility/);
  assert.match(read("mobile/app/src/components/recycle-action.tsx"), /await recordRecycling/);
  assert.match(read("mobile/app/src/app/legal.tsx"), /await clearAllLocalData/);
});
