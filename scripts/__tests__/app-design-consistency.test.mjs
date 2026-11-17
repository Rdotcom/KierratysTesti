import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
const mobile = (relativePath) => source(`mobile/app/src/${relativePath}`);

// These are source-policy regressions, not a claim about browser/native rendering.
test("Home and utility typography share one scalable platform sans family", () => {
  const fonts = mobile("theme/fonts.ts");
  assert.match(fonts, /export const appFontFamily = Platform\.select\(/);
  assert.match(fonts, /web: ['"].*-apple-system.*BlinkMacSystemFont.*sans-serif/);
  assert.match(fonts, /default: "System"/);
  assert.match(fonts, /export const codeFontFamily = "IBMPlexMono_600SemiBold"/);

  const tokens = mobile("theme/tokens.ts");
  assert.match(tokens, /import \{ appFontFamily, codeFontFamily \} from "\.\/fonts"/);
  for (const variant of ["display", "title", "heading", "body", "small", "label"]) {
    assert.match(tokens, new RegExp(`${variant}: \\{\\s*fontFamily: appFontFamily,`));
  }
  assert.match(tokens, /mono: \{\s*fontFamily: codeFontFamily,/);

  const home = mobile("components/home-elements.tsx");
  assert.match(home, /import \{ appFontFamily \} from "@\/theme\/fonts"/);
  assert.match(home, /export const homeFont = appFontFamily/);
  assert.doesNotMatch(home, /Platform\.select\(/);
});

test("Home presentation derives from the same live light and dark palettes as all screens", () => {
  const home = mobile("theme/home-colors.ts");
  assert.match(home, /import \{ darkPalette, lightPalette \} from "\.\/palettes"/);
  assert.match(home, /isDark \? darkPalette : lightPalette/);
  for (const [homeToken, semanticToken] of [
    ["canvas", "bgCanvas"],
    ["ink", "textPrimary"],
    ["muted", "textSecondary"],
    ["link", "actionLink"],
  ])
    assert.match(home, new RegExp(`${homeToken}: palette\\.${semanticToken}\\b`));
  assert.doesNotMatch(home, /#[a-f0-9]{6}/i, "Home must not maintain a divergent hex palette");

  const ui = mobile("components/ui.tsx");
  assert.match(ui, /muted \? palette\.textSecondary : palette\.textPrimary/);
  assert.match(ui, /backgroundColor: palette\.bgCanvas/);
  assert.match(ui, /backgroundColor: palette\.bgSurface/);
});

test("all fourteen functional subpages use shared text and navigation; the old photo route redirects", () => {
  for (const route of [
    "identify",
    "settings",
    "manual",
    "scan",
    "result",
    "guide",
    "material-code",
    "component",
    "nearby",
    "history",
    "feedback",
    "legal",
    "local-photo",
    "overview",
  ]) {
    const screen = mobile(`app/${route}.tsx`);
    assert.match(screen, /<PageHeader\b/, `${route} retains shared back navigation`);
    assert.match(screen, /<Screen\b/, `${route} uses the shared reading surface`);
    assert.match(screen, /<AppText\b/, `${route} uses the shared type system`);
    assert.doesNotMatch(screen, /Atkinson_|maxFontSizeMultiplier=|adjustsFontSizeToFit/);
  }
  for (const component of ["ui", "packaging-mark"])
    assert.doesNotMatch(mobile(`components/${component}.tsx`), /Atkinson_/);
  assert.match(mobile("app/photo.tsx"), /<Redirect href="\/local-photo" \/>/u);
});

test("compact subpage branding is decorative and leaves labelled back controls scalable", () => {
  const ui = mobile("components/ui.tsx");
  const header = ui.slice(
    ui.indexOf("export function PageHeader"),
    ui.indexOf("export function PageIntro"),
  );
  assert.match(header, /<LeafBrandMark\b/);
  assert.match(header, /accessibilityRole="button"/);
  assert.match(header, /accessibilityLabel=\{backLabel\}/);
  assert.match(header, /onPress=\{onBack\}/);
  assert.doesNotMatch(header, /numberOfLines=|maxFontSizeMultiplier=|adjustsFontSizeToFit/);
  assert.match(ui, /backAction: \{[\s\S]*?minHeight: controls\.minimumTouchTarget/);
  assert.match(mobile("theme/tokens.ts"), /minimumTouchTarget: 44/);

  const artwork = mobile("components/reference-artwork.tsx");
  const leaf = artwork.slice(
    artwork.indexOf("export function LeafBrandMark"),
    artwork.indexOf("export function PhotoCardBackdrop"),
  );
  for (const attribute of [
    "accessible={false}",
    "aria-hidden",
    "accessibilityElementsHidden",
    'importantForAccessibility="no-hide-descendants"',
    'pointerEvents="none"',
  ])
    assert.ok(leaf.includes(attribute), `Leaf brand keeps ${attribute}`);
  assert.doesNotMatch(leaf, /fetch\(|setInterval|withRepeat|requestAnimationFrame/);
});

test("shared recognition icons use the same bounded original symbols as Home without claiming content", () => {
  const icons = mobile("components/action-icon.tsx");
  assert.match(icons, /<ReferenceSymbol\b/);
  for (const symbol of ["camera", "location", "recycling"])
    assert.ok(icons.includes(`"${symbol}"`), `${symbol} has one visual vocabulary`);
  assert.match(icons, /accessible=\{false\}/);
  assert.match(icons, /importantForAccessibility="no-hide-descendants"/);
  assert.match(icons, /pointerEvents="none"/);
  assert.doesNotMatch(icons, /https?:|fetch\(|setInterval|withRepeat|requestAnimationFrame/);
});

test("visual unification retains distinct semantic warnings errors and accessible action states", () => {
  const palettes = mobile("theme/palettes.ts");
  for (const [name, light, dark] of [
    ["statusWarning", "#8D5700", "#F4C765"],
    ["statusError", "#A43628", "#FF9A8B"],
    ["statusInfo", "#2457D6", "#91ACFF"],
  ]) {
    assert.match(palettes, new RegExp(`${name}: "${light}"`));
    assert.match(palettes, new RegExp(`${name}: "${dark}"`));
  }
  const ui = mobile("components/ui.tsx");
  assert.match(ui, /danger: palette\.statusError/);
  assert.match(ui, /amber: \[palette\.amberSoft, palette\.amber\]/);
  assert.match(ui, /brick: \[palette\.brickSoft, palette\.brick\]/);
  assert.match(ui, /accessibilityState=\{\{ disabled: disabled \|\| busy, busy \}\}/);
  assert.match(ui, /aria-busy=\{busy\}/);
  assert.match(ui, /aria-disabled=\{disabled \|\| busy\}/);
});

test("camera and inference screens retain focused capture contrast and explicit safety affordances", () => {
  const scan = mobile("app/scan.tsx");
  assert.match(scan, /backgroundColor: palette\.cameraOverlay/);
  assert.match(scan, /color="#FFFFFF"/);
  const photo = mobile("app/local-photo.tsx");
  for (const affordance of [
    "localVisionPrivacy",
    "localVisionEstimate",
    "localVisionSource",
    "ObjectCandidateResultView",
  ])
    assert.ok(photo.includes(affordance), `${affordance} remains visible in the flow`);
  assert.match(photo, /<ObjectCandidateResultView\b/);
  assert.doesNotMatch(photo, /<ScanIllustration|<PhotoCardBackdrop/);
});

test("shared keyboard focus has a canvas gap and outer ring instead of only recoloring a dark button", () => {
  const tokens = mobile("theme/tokens.ts");
  assert.match(tokens, /export function focusRing\(palette: AppPalette\): string/);
  assert.match(tokens, /2px \$\{palette.bgCanvas\}.*4px \$\{palette.actionLink\}/);
  const ui = mobile("components/ui.tsx");
  assert.equal((ui.match(/boxShadow: focused \? focusRing\(palette\) : "none"/g) ?? []).length, 4);
});

test("the root surface follows the theme behind rounded bottom navigation", () => {
  const layout = mobile("app/_layout.tsx");
  assert.match(layout, /nativeID="app-navigation-surface"/);
  assert.match(layout, /style=\{\{ flex: 1, backgroundColor: palette.bgCanvas \}\}/);
});
