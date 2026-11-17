import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const screen = (name) => source(`mobile/app/src/app/${name}.tsx`);

// Source contracts complement browser interaction evidence, not native render/permission tests.
function control(sourceText, tag, testID) {
  const id = `testID="${testID}"`;
  assert.equal(sourceText.split(id).length, 2, `${testID} occurs exactly once`);
  const position = sourceText.indexOf(id);
  const start = sourceText.lastIndexOf(`<${tag}`, position);
  assert.ok(start >= 0, `${testID} uses ${tag}`);
  const opening = sourceText.slice(start);
  // A callback's => is not the JSX tag terminator; these controls put it on its own line.
  const end = opening.match(/^\s*\/?>/m);
  assert.ok(end, `${testID} has a complete opening tag`);
  return opening.slice(0, end.index + end[0].length);
}

test("Home's combined recognition action opens Identify, not a camera or upload flow", () => {
  const home = screen("index");
  const action = control(home, "Pressable", "home-identify-action");
  assert.match(action, /onPress=\{\(\) => router\.push\("\/identify"\)\}/);
  assert.match(action, /accessibilityRole="button"/);
  assert.match(action, /accessibilityLabel=\{t\("homeIdentifyTitle"\)\}/);
  assert.match(action, /accessibilityHint=\{t\("homeIdentifyDetail"\)\}/);
  for (const key of ["homeIdentifyTitle", "homeIdentifyDetail"])
    assert.ok(home.includes(`"${key}"`));
  assert.doesNotMatch(home, /home-photo-action|router\.push\("\/photo"\)/);
  assert.doesNotMatch(
    action,
    /fetch\(|requestSearch\(|lookupBarcode\(|request.*Permissions|capture|launchCamera|readDeviceLocation/,
  );
});

test("Home retains the direct barcode shortcut and accessible manual fallback", () => {
  const home = screen("index");
  const scan = control(home, "Pressable", "home-scan-action");
  assert.match(scan, /onPress=\{\(\) => router\.push\("\/scan"\)\}/);
  assert.match(scan, /accessibilityRole="button"/);
  assert.match(scan, /accessibilityLabel=\{t\(/);
  const manual = control(home, "InlineLink", "home-manual-action");
  assert.match(manual, /onPress=\{\(\) => router\.push\("\/manual"\)\}/);
  assert.match(manual, /label=\{t\("manualEntry"\)\}/);
  assert.match(manual, /role="button"/);
});

test("Identify prioritizes barcode, then manual entry, then local AI photo recognition", () => {
  const identify = screen("identify");
  const ids = ["identify-scan-action", "identify-manual-action", "identify-photo-action"];
  const positions = ids.map((id) => identify.indexOf(`testID="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  for (const [index, [method, path]] of [
    ["scan", "scan"],
    ["manual", "manual"],
    ["photo", "local-photo"],
  ].entries()) {
    const action = control(identify, index === 0 ? "Pressable" : "ActionRow", ids[index]);
    assert.match(action, new RegExp(`onPress=\\{\\(\\) => router\\.push\\("/${path}"\\)\\}`));
    const key = `identify${method[0].toUpperCase()}${method.slice(1)}Action`;
    assert.match(action, new RegExp(`(?:label|accessibilityLabel)=\\{t\\("${key}"\\)\\}`));
  }
  const primary = control(identify, "Pressable", ids[0]);
  assert.match(primary, /accessibilityRole="button"/);
  assert.match(primary, /accessibilityHint=\{t\("identifyScanDetail"\)\}/);
  assert.match(primary, /onFocus=/);
  assert.match(primary, /onBlur=/);
  assert.match(identify, /detail=\{t\("identifyPhotoDetail"\)\}/);
  assert.doesNotMatch(identify, /isExpoGoHost|manualOnly|networkDetail/);
});

test("the Identify hub is passive, scalable navigation with the current shared tab and back path", () => {
  const identify = screen("identify");
  assert.match(identify, /<Screen testID="identify-screen"/);
  assert.match(identify, /<PageHeader\b/);
  assert.match(identify, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\("\/"\)/);
  assert.match(identify, /useWindowDimensions\(\)/);
  assert.match(identify, /fontScale > 1\.2/);
  assert.match(identify, /minHeight: (?:1\d{2}|[2-9]\d{2})/);
  assert.doesNotMatch(
    identify,
    /useEffect|useFocusEffect|fetch\(|lookupBarcode\(|requestSearch\(|request.*Permissions|launchCamera|readDeviceLocation|watchPosition|numberOfLines=|maxFontSizeMultiplier=|adjustsFontSizeToFit|allowFontScaling=\{false\}/,
  );
  const routes = source("mobile/app/src/features/navigation/routes.ts");
  assert.match(
    routes,
    /\{ id: "identify", path: "\/identify", label: "tabIdentify", icon: "scan" \}/,
  );
  assert.match(routes, /case "\/identify":\s*return "identify"/);
  const ui = source("mobile/app/src/components/ui.tsx");
  const rows = ui.slice(
    ui.indexOf("export function ActionRow"),
    ui.indexOf("/** A real navigation action"),
  );
  assert.match(rows, /accessibilityRole="button"/);
  assert.match(rows, /accessibilityLabel=\{label\}/);
  assert.match(rows, /accessibilityHint=\{detail\}/);
  assert.match(rows, /styles\.actionRow/);
  assert.match(ui, /actionRow: \{[\s\S]*?minHeight: 60/);
});

test("FI and EN name all three actual methods and preserve an AI uncertainty disclosure", () => {
  const navigation = source("mobile/localization/src/navigation.ts");
  assert.ok(navigation.length <= 64 * 1024, "Bound the inspected source, without executing it");
  const fiStart = navigation.indexOf("export const navigationFi = {");
  const enStart = navigation.indexOf("export const navigationEn:");
  assert.ok(fiStart >= 0 && enStart > fiStart);
  for (const [language, block] of [
    ["fi", navigation.slice(fiStart, enStart)],
    ["en", navigation.slice(enStart)],
  ]) {
    const messages = Object.fromEntries(
      [
        "homeIdentifyTitle",
        "homeIdentifyDetail",
        "identifyTitle",
        "identifyBody",
        "identifyScanAction",
        "identifyManualAction",
        "identifyPhotoAction",
        "identifyScanDetail",
        "identifyPhotoDetail",
      ].map((key) => {
        // Known keys must stay plain bounded literals; no TypeScript import/eval is needed.
        const matches = [
          ...block.matchAll(new RegExp(`^\\s*${key}:\\s*"([^"\\\\\\r\\n]{1,240})"\\s*,`, "gm")),
        ];
        assert.equal(matches.length, 1, `${language}.${key} is one nonempty plain literal`);
        return [key, matches[0][1]];
      }),
    );
    assert.match(
      messages.homeIdentifyDetail,
      language === "fi" ? /viivakoodi.*tekoäly/i : /barcode.*AI/i,
    );
    assert.match(messages.identifyScanAction, language === "fi" ? /viivakoodi/i : /barcode/i);
    assert.match(messages.identifyManualAction, language === "fi" ? /käsin/i : /manually/i);
    assert.match(messages.identifyPhotoAction, language === "fi" ? /tekoäly/i : /AI/i);
    assert.match(
      messages.identifyPhotoDetail,
      language === "fi" ? /arvio|epävarm/i : /estimate|uncertain/i,
    );
  }
});
