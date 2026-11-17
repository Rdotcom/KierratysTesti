import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
test("manual address lookup is explicit, OS-only, ephemeral and never presented as GPS accuracy", () => {
  const screen = read("mobile/app/src/app/nearby.tsx");
  const adapter = read("mobile/app/src/features/nearby/device-location.ts");
  const helper = read("mobile/app/src/features/nearby/manual-location.ts");
  assert.match(screen, /nearbyLocationHint/u);
  assert.match(screen, /onPress=\{\(\) => void findByLocation\(\)\}/u);
  assert.match(screen, /setLocationInput\(""\)/u);
  assert.match(screen, /accuracy: null,\s*origin: "address"/u);
  assert.match(screen, /nearbyManualEstimate/u);
  assert.match(adapter, /Location\.geocodeAsync\(address\)/u);
  assert.match(adapter, /Platform\.OS === "web"/u);
  assert.doesNotMatch(
    screen + adapter + helper,
    /nominatim|fetch\(|AsyncStorage|console\.|trackEvent/u,
  );
  assert.match(read("mobile/app/src/app/legal.tsx"), /t\("nearbyLocationHint"\)/u);
});
test("nearest result identifies the source point without inventing missing names or types", () => {
  const screen = read("mobile/app/src/components/nearby-point-card.tsx");
  assert.match(screen, /point\.name \?\? point\.operator \?\? t\("nearbyGeneric"\)/u);
  for (const key of [
    "nearbyPointType",
    "nearbyCentre",
    "nearbyContainer",
    "nearbyTypeUnknown",
    "nearbyPointId",
  ])
    assert.ok(screen.includes(key));
  assert.match(screen, /point\.id/u);
  assert.match(screen, /point\.address/u);
  for (const text of [
    "Pisteen nimeä ei ole aineistossa",
    "Point name is not available in the directory",
  ])
    assert.ok(read("mobile/localization/src/nearby.ts").includes(text));
});
test("location native configuration is foreground-only with localised purpose", () => {
  const config = JSON.parse(read("mobile/app/app.json")).expo;
  const plugin = config.plugins.find((p) => Array.isArray(p) && p[0] === "expo-location")[1];
  for (const field of [
    "isIosBackgroundLocationEnabled",
    "isAndroidBackgroundLocationEnabled",
    "isAndroidForegroundServiceEnabled",
    "locationAlwaysPermission",
    "locationAlwaysAndWhenInUsePermission",
    "motionUsagePermission",
  ]) {
    assert.equal(plugin[field], false);
  }
  for (const language of ["fi", "en"])
    assert.ok(
      JSON.parse(read(`mobile/app/locales/${language}.json`)).ios
        .NSLocationWhenInUseUsageDescription,
    );
  assert.ok(
    config.android.blockedPermissions.includes("android.permission.ACCESS_BACKGROUND_LOCATION"),
  );
});
test("nearby makes map primary, keeps uncertainty visible and progressively discloses metadata", () => {
  const screen = read("mobile/app/src/app/nearby.tsx");
  const card = read("mobile/app/src/components/nearby-point-card.tsx");
  const map = card.slice(
    card.indexOf('label={t("nearbyShowMap")}'),
    card.indexOf("testID={`nearby-map-${index}`}"),
  );
  assert.ok(map.length > 0);
  assert.match(map, /accessibilityHint/u);
  assert.match(card, /expanded=\{detailsOpen\}/u);
  assert.match(card, /detailsOpen &&/u);
  assert.match(screen, /nearbyQuickCaution/u);
  assert.match(screen, /nearbyUnverified/u);
  assert.ok(card.indexOf("testID={`nearby-map-${index}`}") < card.indexOf('t("nearbyPointId")'));
  assert.match(
    read("mobile/app/src/components/ui.tsx"),
    /accessibilityState=\{expanded === undefined \? undefined : \{ expanded \}\}/u,
  );
  assert.match(read("mobile/app/src/components/ui.tsx"), /aria-expanded=\{expanded\}/u);
});
test("optional address lookup retains consent and explicit loading without automatic acquisition", () => {
  const screen = read("mobile/app/src/components/nearby-point-card.tsx");
  assert.match(screen, /nearbyAddressConsent/u);
  assert.match(screen, /nearbyAddressLoading/u);
  assert.match(screen, /onPress=\{\(\) => void completeAddress\(\)\}/u);
  assert.match(screen, /nearbyAddressSource/u);
  assert.match(screen, /active\.current\?\.abort\(\)/u);
  assert.match(read("mobile/app/src/app/nearby.tsx"), /setPrivacyOpen\(false\)/u);
});
test("all surfaces share one reactive theme so live color-scheme changes stay coherent", () => {
  const tokens = read("mobile/app/src/theme/tokens.ts");
  const layout = read("mobile/app/src/app/_layout.tsx");
  assert.match(tokens, /AppThemeProvider/u);
  assert.match(tokens, /useContext\(AppThemeContext\)/u);
  assert.equal((tokens.match(/useSyncExternalStore\(/gu) ?? []).length, 1);
  assert.match(tokens, /Appearance\.addChangeListener\(listener\)/u);
  assert.match(tokens, /colorSchemeStore\.getServerSnapshot/u);
  assert.match(layout, /<AppThemeProvider>/u);
  assert.match(read("mobile/app/src/components/ui.tsx"), /aria-busy=\{busy\}/u);
});
test("nearby screen has explicit acquisition, cleanup and no location network/storage channel", () => {
  const screen = read("mobile/app/src/app/nearby.tsx");
  const device = read("mobile/app/src/features/nearby/device-location.ts");
  const session = read("mobile/app/src/features/nearby/location-session.ts");
  assert.match(screen, /onPress=\{\(\) => void find\(\)\}/u);
  assert.match(screen, /next === "background"/u);
  assert.match(screen, /useFocusEffect/u);
  assert.match(screen, /announceAccessibility/u);
  assert.match(screen, /nearbyCaution/u);
  assert.match(screen, /nearbySource/u);
  assert.equal(
    (
      screen.match(
        /setLinkError\(true\);\s*announceAccessibility\(t\("nearbyLinkError"\), "high"\)/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.doesNotMatch(
    screen + device + session,
    /fetch\(|AsyncStorage|console\.|trackEvent|requestBackgroundPermissions|startLocationUpdates/u,
  );
});
test("nearby uses existing components and bundled real data, without replacing the old Home", () => {
  const home = read("mobile/app/src/app/index.tsx");
  assert.match(home, /home-nearby-action/u);
  assert.match(home, /home-scan-action/u);
  assert.match(home, /home-manual-action/u);
  assert.match(read("mobile/app/src/app/nearby.tsx"), /finland-recycling\.json/u);
  assert.match(read("mobile/app/assets/data/README.md"), /Open Database License 1\.0/u);
});

test("only an explicit recent Home action starts a one-shot nearby search", () => {
  const home = read("mobile/app/src/app/index.tsx");
  const screen = read("mobile/app/src/app/nearby.tsx");
  const intent = read("mobile/app/src/features/nearby/search-intent.ts");
  assert.ok(home.indexOf("requestSearch();") < home.indexOf('router.push("/nearby")'));
  assert.match(screen, /if \(consumeSearchRequest\(\)\) void find\(\)/u);
  assert.match(intent, /requestedAt = null/u);
  assert.doesNotMatch(screen + intent, /useLocalSearchParams|searchParams|AsyncStorage|fetch\(/u);
  assert.match(read("mobile/app/src/app/_layout.tsx"), /<NearbySearchProvider>/u);
});

test("nearby lists real distance-ranked points and explicit material reports, not guessed acceptance", () => {
  const screen = read("mobile/app/src/app/nearby.tsx");
  const card = read("mobile/app/src/components/nearby-point-card.tsx");
  assert.match(screen, /buildNearbyResults\(directory\.data\.points, fix\.coords\)/u);
  assert.match(screen, /state\.results\.reported/u);
  assert.match(screen, /missingOpen/u);
  assert.match(screen, /state\.results\.materials\[filter\]/u);
  for (const required of [
    "reportedMaterials",
    "reportedExclusions",
    "nearbyMaterialsUnknown",
    "collectionMaterialLabels",
  ])
    assert.ok(card.includes(required));
  assert.ok(card.indexOf('t("nearbyMaterials")') < card.indexOf("detailsOpen &&"));
  assert.ok(screen.includes('t("nearbyRetrieved")'));
});
