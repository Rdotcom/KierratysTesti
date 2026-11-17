import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("illustrated Home keeps every current real action, without the old Helsinki default or reassurance", () => {
  const home = readFileSync("mobile/app/src/app/index.tsx", "utf8");
  for (const action of ["scan", "manual", "identify", "nearby", "guide", "history", "legal"])
    assert.ok(home.includes(`testID="home-${action}-action"`));
  assert.match(home, /requestSearch\(\)/);
  assert.match(home, /<ScanIllustration/);
  assert.match(home, /expandedText/);
  assert.doesNotMatch(
    home,
    /useCollectionPoints|Helsinki|privacySummary|activityPoints|setInterval/,
  );
});

test("reference Home searches existing local guide params, not a fabricated product-name service", () => {
  const home = readFileSync("mobile/app/src/app/index.tsx", "utf8");
  assert.match(home, /testID="home-search-input"/);
  assert.match(home, /accessibilityLabel=\{t\("homeSearchLabel"\)\}/);
  assert.match(home, /accessibilityHint=\{t\("homeSearchHint"\)\}/);
  assert.match(home, /maxLength=\{GUIDE_SEARCH_MAX_LENGTH\}/);
  assert.match(home, /pathname: "\/guide",\s*params: \{ query:/);
  assert.match(home, /pathname: "\/guide",\s*params: \{ material \}/);
  assert.match(home, /\["plastic", "homeMaterialPlastic"\]/);
  assert.match(home, /\["carton", "homeMaterialCarton"\]/);
  assert.match(home, /\["glass", "homeMaterialGlass"\]/);
  assert.match(home, /\["metal", "homeMaterialMetal"\]/);
  assert.doesNotMatch(home, /fetch\(|\/v1\/|useCollectionPoints|\["battery"|\["electronics"/);
  const guide = readFileSync("mobile/app/src/app/guide.tsx", "utf8");
  assert.match(guide, /parseGuideSearchParams\(route\)/);
  assert.match(guide, /invalid \? \[\] : filterGuideMaterials\(query, material\)/);
  assert.match(guide, /testID="guide-search-empty"/);
  assert.match(guide, /testID="guide-search-reset"/);
});

test("Home previews only real opt-in history, and never fabricates nearest points or openings", () => {
  const home = readFileSync("mobile/app/src/app/index.tsx", "utf8");
  assert.match(home, /Promise\.all\(\[isHistoryEnabled\(\), readHistory\(\)\]\)/);
  assert.match(home, /homeHistoryPreview\(entries, enabled\)/);
  assert.match(home, /if \(cancelled\) return/);
  assert.ok(
    home.indexOf("setRecent([])") < home.indexOf("Promise.all("),
    "Clear stale history before asynchronous refresh",
  );
  assert.match(home, /lookupBarcode\(gtin, "history"\)/);
  assert.match(home, /if \(attempt.accepted\) router.push\("\/result"\)/);
  assert.match(home, /t\(historyStatusMessageKey\(entry.resultStatus\)\)/);
  assert.match(home, /entry.productName \?\? entry.gtin/);
  for (const key of [
    "homeHistoryError",
    "homeHistoryEmpty",
    "homeHistoryDisabled",
    "homeNearbyEmpty",
  ])
    assert.ok(home.includes(`t("${key}")`));
  assert.doesNotMatch(
    home,
    /Mannerheimintie|Mäkelänkatu|Rinki-ekopiste|K-Supermarket|Avoinna|Open now|350 m|600 m|opening_hours|latitude:|longitude:/,
  );
  const focus = home.slice(home.indexOf("useFocusEffect("), home.indexOf("const search ="));
  assert.doesNotMatch(
    focus,
    /requestSearch\(|lookupBarcode\(|readDeviceLocation|requestForegroundPermissionsAsync/,
  );
  assert.match(home, /const nearby = \(\) => \{\s*requestSearch\(\);\s*router.push\("\/nearby"\)/);
  assert.doesNotMatch(
    home,
    /readDeviceLocation|requestForegroundPermissionsAsync|watchPosition|setInterval/,
  );
  const preview = readFileSync("mobile/app/src/features/history/home-preview.ts", "utf8");
  assert.match(preview, /if \(!enabled \|\| !Array.isArray\(value\)\) return \[\]/);
  assert.match(preview, /parseGtin\(row.gtin\)/);
  assert.match(preview, /value.slice\(0, 20\)/);
  assert.match(preview, /entries.length === 2/);
});

test("bottom navigation is mounted inside the current providers and does not acquire location on render", () => {
  const layout = readFileSync("mobile/app/src/app/_layout.tsx", "utf8");
  assert.match(layout, /<AppThemeProvider>/);
  assert.match(layout, /<NearbySearchProvider>/);
  assert.match(layout, /<BottomNavigation\s*\/>/);
  const nav = readFileSync("mobile/app/src/components/bottom-navigation.tsx", "utf8");
  assert.match(nav, /accessibilityRole="tab"/);
  assert.match(nav, /aria-selected=\{selected === tab.id\}/);
  assert.match(nav, /router.dismissTo\(action.path\)/);
  assert.doesNotMatch(nav, /router.navigate\(|router.push\(/);
  assert.match(nav, /onPress=\{\(\) => \{[\s\S]*?if \(action.requestLocation\) requestSearch\(\)/);
  assert.doesNotMatch(nav, /readDeviceLocation|requestForegroundPermissionsAsync|setInterval/);
  assert.match(
    readFileSync("mobile/app/src/components/ui.tsx", "utf8"),
    /edges=\{activeTab\(path\)/,
  );
});

test("new root pages lead to current camera/privacy/history routes, not old account or points fixtures", () => {
  for (const page of ["identify", "settings"]) {
    const source = readFileSync(`mobile/app/src/app/${page}.tsx`, "utf8");
    assert.match(source, /<PageHeader/);
    assert.match(source, /router.canGoBack\(\)/);
    assert.doesNotMatch(source, /fetch\(|activitySummary|activityPoints|\/profile|\/map/);
  }
  const identify = readFileSync("mobile/app/src/app/identify.tsx", "utf8");
  for (const path of ["scan", "manual", "local-photo"])
    assert.ok(identify.includes(`router.push("/${path}")`));
  assert.doesNotMatch(
    readFileSync("mobile/app/src/app/local-photo.tsx", "utf8"),
    /router\.push\("\/photo"\)/u,
  );
  assert.match(
    readFileSync("mobile/app/src/app/photo.tsx", "utf8"),
    /<Redirect href="\/local-photo" \/>/u,
  );
  const settings = readFileSync("mobile/app/src/app/settings.tsx", "utf8");
  assert.match(settings, /isHistoryEnabled/);
  assert.match(settings, /aria-checked=\{language === item\}/);
  assert.match(settings, /settingsReadError/);
});

test("selected local artwork is decorative and has an explicit source without altering the rule engine", () => {
  for (const name of ["home-background", "welcome-background", "scan-illustration"])
    assert.ok(existsSync(`mobile/app/assets/backgrounds/${name}.png`));
  const attribution = readFileSync("mobile/app/assets/backgrounds/README.md", "utf8");
  assert.match(attribution, /0142bb0371d0794ffe8d30df5037b40329efb512/);
  const artwork = readFileSync("mobile/app/src/components/reference-artwork.tsx", "utf8");
  assert.equal((artwork.match(/importantForAccessibility="no-hide-descendants"/g) ?? []).length, 3);
  assert.doesNotMatch(artwork, /fetch\(|setInterval|withRepeat|https?:/);
});
