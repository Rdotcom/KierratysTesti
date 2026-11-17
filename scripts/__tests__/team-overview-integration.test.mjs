import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const screen = (name) => source(`mobile/app/src/app/${name}.tsx`);

// Source-preservation checks supplement real browser suites; no camera or quality claim.
test("team Overview is reachable without replacing Home recognition or primary tabs", () => {
  const home = screen("index");
  assert.match(home, /testID="home-overview-action"/u);
  assert.match(home, /router\.push\("\/overview"\)/u);
  assert.match(home, /testID="home-identify-action"/u);
  assert.match(home, /router\.push\("\/identify"\)/u);
  assert.match(screen("settings"), /testID="settings-overview-action"/u);
  assert.match(
    source("mobile/app/src/features/navigation/routes.ts"),
    /case "\/settings":[\s\S]*?case "\/overview":[\s\S]*?return "settings"/u,
  );
});

test("material-code recording preserves editable hydration and independent physical confirmation", () => {
  const text = screen("material-code");
  assert.match(text, /useLocalSearchParams/u);
  assert.match(text, /const prefill = materialCodePrefill\(params\.code\)/u);
  assert.match(text, /const \[value, setValue\] = useState\(""\)/u);
  const effect = text.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[prefill\]\)/u)?.[1];
  assert.ok(effect);
  for (const update of ["setValue(prefill)", "setAttempt(undefined)", "setSorting(undefined)"])
    assert.ok(effect.includes(update));
  assert.doesNotMatch(effect, /sortRecognized|confirm\(|recordRecycling/u);
  assert.doesNotMatch(text, /materialCodeConfirmAction|onConfirm=/u);
  assert.match(text, /nextAttempt.status === "recognized"[\s\S]*sortRecognizedMaterialCode/u);
  assert.match(text, /sorting && \([\s\S]*?<SortingResultCard[\s\S]*?<RecycleAction/u);
  assert.match(text, /recordId=\{recyclingIntent\(recordingScope, "material-code"\)\}/u);
  assert.doesNotMatch(text, /recordRecycling\(/u);
});

test("local image estimates still route to explicit material checking rather than record recycling", () => {
  const local = screen("local-photo");
  assert.match(local, /pathname: "\/material-code", params: \{ code: marking\.text \}/u);
  assert.match(local, /recognizeLocalPhoto\(jpeg, controller\.signal\)/u);
  assert.match(local, /inspectLocalVisionReadiness\(controller\.signal\)/u);
  assert.doesNotMatch(local, /recordRecycling\(/u);
  assert.equal(
    (local.match(/recordId=\{recyclingIntent\(productResult, "photo"\)\}/gu) ?? []).length,
    2,
  );
});

test("local-model privacy and attribution coexist with team deletion confirmation", () => {
  const legal = screen("legal");
  for (const key of [
    "privacyInformation",
    "localVisionTitle",
    "localVisionPrivacy",
    "localVisionModelAttribution",
    "networkConsent",
    "localDataDeleteError",
  ])
    assert.ok(legal.includes(`t("${key}")`), `${key} retained`);
  for (const id of [
    "privacy-delete-action",
    "privacy-delete-confirm-panel",
    "privacy-delete-confirm-action",
    "privacy-delete-cancel",
  ])
    assert.ok(legal.includes(`testID="${id}"`), `${id} retained`);
  assert.match(legal, /await clearAllLocalData\(\)/u);
  assert.match(legal, /if \(locked\.current\) return/u);
  assert.match(legal, /catch \{\s*setFailed\(true\)/u);
});

test("both languages combine new Overview and existing local-vision dictionaries", () => {
  const messages = source("mobile/localization/src/index.ts");
  assert.match(messages, /import \{ localVisionEn, localVisionFi \} from "\.\/local-vision"/u);
  assert.match(messages, /import \{ overviewEn, overviewFi \} from "\.\/overview"/u);
  for (const language of ["Fi", "En"])
    for (const dictionary of ["localVision", "overview"])
      assert.ok(messages.includes(`...${dictionary}${language},`));
  assert.match(messages, /localDataDeleteError:/u);
  assert.match(messages, /kierrätysmerkinnät ja materiaalimäärät/u);
  assert.match(messages, /recycling records and material totals/u);
});

test("browser coverage joins material confirmation to explicit recording and adds Overview styling", () => {
  const local = source("scripts/qa/local-vision-browser.cjs");
  for (const id of [
    "recycle-mark-action",
    "recycle-confirm-panel",
    "recycle-confirm-cancel",
    "recycle-confirm-action",
    "privacy-delete-confirm-panel",
  ])
    assert.ok(local.includes(`"${id}"`));
  assert.match(local, /No automatic recycling record/u);
  assert.match(
    source("scripts/qa/app-refinement-browser.cjs"),
    /"history",\s*"overview",\s*"legal"/u,
  );
});
