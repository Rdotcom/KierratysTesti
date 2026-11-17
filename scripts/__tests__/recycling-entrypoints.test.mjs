import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (file) => fs.readFileSync(`mobile/app/src/${file}`, "utf8");

test("all guidance families expose explicit recording without background saves", () => {
  for (const file of ["app/result.tsx", "app/component.tsx", "app/material-code.tsx"])
    assert.match(read(file), /<RecycleAction/);
  for (const file of [
    "app/guide.tsx",
    "components/source-guide-result.tsx",
    "components/object-sorting-flow.tsx",
    "components/offline-product-result.tsx",
    "components/nearby-point-card.tsx",
  ])
    assert.match(read(file), /<RecyclingRecordAction/);
  for (const file of [
    "app/guide.tsx",
    "app/result.tsx",
    "app/local-photo.tsx",
    "app/material-code.tsx",
    "components/source-guide-result.tsx",
    "components/object-sorting-flow.tsx",
    "components/offline-product-result.tsx",
    "components/nearby-point-card.tsx",
  ])
    assert.doesNotMatch(read(file), /recordRecycling\(/);
  assert.match(read("app/local-photo.tsx"), /<ObjectCandidateResultView/u);
  assert.match(read("components/network-photo-screen.web.tsx"), /<ObjectCandidateResultView/u);
  assert.match(read("components/object-candidate-result.tsx"), /<ObjectSortingFlowView/u);
});
test("unknown material selection cannot silently default or bypass confirmation", () => {
  const action = read("components/recycle-action.tsx");
  assert.match(action, /useState<OverviewMaterial>\(\)/);
  assert.match(action, /!confirming \|\| state !== "ready" \|\| !chosenMaterial/);
  assert.match(action, /disabled=\{saving \|\| !chosenMaterial\}/);
  assert.match(action, /pending\.current \?\?=/);
  assert.match(action, /material: chosenMaterial/);
  assert.doesNotMatch(action, /material:.*\?\?.*"other"/);
});
test("a point's recycling record does not retain the point name, address or coordinates", () => {
  const card = read("components/nearby-point-card.tsx");
  const action = card.match(/<RecyclingRecordAction[\s\S]*?\/>/)?.[0];
  assert.ok(action);
  assert.match(action, /label=\{t\("nearbyGeneric"\)\}/);
  assert.doesNotMatch(action, /label=\{point\.|coordinates|address/);
});
test("failed photo identities do not display a success-like recording action", () => {
  assert.match(
    read("components/offline-product-result.tsx"),
    /result.status === "catalogue_match" \|\| result.status === "confirmation_required"\) && \([\s\S]*<RecyclingRecordAction/,
  );
});
