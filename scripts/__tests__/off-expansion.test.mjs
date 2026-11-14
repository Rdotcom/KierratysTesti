import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  expandOffMetadata,
  groupOffUploadFamilies,
  OFF_EXPANSION_POLICY,
  planOffExpansion,
} from "../qa/reference-image/expand-off-corpus.mjs";

const code = "7622210449283",
  hash = "a".repeat(64),
  date = "2026-11-14";
const previous = () => ({
  gtin: code,
  sourceReportedName: "Prince",
  sourceReportedBrands: "LU",
  sourceReportedQuantity: "300 g",
  images: [],
});
const original = (author = "contributor", uploaded = 1700000000) => ({
  uploader: author,
  uploaded_t: uploaded,
  sizes: { 400: { w: 250, h: 400 } },
});
const response = () => ({
  status: 1,
  product: {
    code,
    product_name: "Prince",
    brands: "LU",
    quantity: "300 g",
    images: {
      1: original("first", 1600000000),
      2: original("second", 1650000000),
      3: original("third", 1700000000),
    },
  },
});
test("all numeric original uploads can supply candidates without faking selected-front status", () => {
  const p = planOffExpansion(code, response(), hash, date, previous());
  assert.equal(p.status, "pending_image_review");
  assert.equal(p.candidateImages.length, 3);
  assert.deepEqual(
    p.candidateImages.map((r) => r.proposedRole),
    ["reference_candidate", "reference_candidate", "evaluation_candidate"],
  );
  assert.ok(
    p.candidateImages.every(
      (r) =>
        r.viewStatus === "unclassified_original_requires_visual_check" &&
        r.privacyStatus === "not_yet_observed",
    ),
  );
  assert.equal(p.integrationAllowed, false);
  assert.equal(p.independentlyVerifiedImages, 0);
});
test("language crops share a numeric parent and cannot create extra families", () => {
  const r = response();
  r.product.images.front_fr = { imgid: "1" };
  r.product.images.front_en = { imgid: "1" };
  const p = planOffExpansion(code, r, hash, date, previous());
  assert.equal(p.numericOriginals, 3);
  assert.equal(p.candidateImages.length, 3);
  const selected = p.candidateImages.find((x) => x.originalId === "1");
  assert.equal(selected.viewStatus, "source_selected_front_unverified");
  assert.equal(selected.selectedRoles.length, 2);
});
test("same-uploader burst grouping is transitive and cannot split adjacent days", () => {
  const rows = [0, 80000, 160000].map((delta, i) => ({
    originalId: `${i + 1}`,
    uploader: "same",
    uploadedAt: 1700000000 + delta,
  }));
  const groups = groupOffUploadFamilies(code, rows, new Set(["2"]));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].originalIds.length, 3);
  assert.equal(groups[0].previouslySeenFamily, true);
});
test("previous upload-day anchors exclude a burst even if the old parent vanished", () => {
  const groups = groupOffUploadFamilies(
    code,
    [{ originalId: "55", uploader: "same", uploadedAt: Date.parse("2023-11-15T01:00:00Z") / 1000 }],
    new Set(["54"]),
    [{ originalId: "54", uploadedOn: "2023-11-14", authorCredit: "same / Open Food Facts" }],
  );
  assert.equal(groups[0].previouslySeenFamily, true);
});
test("seen families cannot be relabelled new and insufficiency remains explicit", () => {
  const prior = previous();
  prior.images = [
    { originalId: "1", uploadedOn: "2020-09-13", authorCredit: "first / Open Food Facts" },
  ];
  const p = planOffExpansion(code, response(), hash, date, prior);
  assert.equal(p.status, "insufficient_unseen_families");
  assert.equal(p.candidateImages.length, 2);
});
test("rejects wrong GTIN, orphan selected parent, invalid date and excessive metadata", () => {
  const r = response();
  r.product.code = "3017620422003";
  assert.throws(() => planOffExpansion(code, r, hash, date, previous()));
  const orphan = response();
  orphan.product.images.front_fr = { imgid: "99" };
  assert.throws(() => planOffExpansion(code, orphan, hash, date, previous()));
  assert.throws(() => planOffExpansion(code, response(), hash, "2026-02-30", previous()));
  const huge = response();
  huge.product.images = Object.fromEntries(
    Array.from({ length: 1025 }, (_, i) => [`${i + 1}`, original()]),
  );
  assert.throws(() => planOffExpansion(code, huge, hash, date, previous()));
});
test("missing attribution, contact-like handle, future time and absent resolution are not invented", () => {
  for (const bad of [
    { ...original(), uploader: "" },
    { ...original(), uploader: "email@example.test" },
    { ...original(), uploaded_t: Date.parse("2027-01-01") / 1000 },
    { ...original(), sizes: {} },
  ]) {
    const r = response();
    r.product.images["1"] = bad;
    const p = planOffExpansion(code, r, hash, date, previous());
    assert.equal(p.rejectedOriginals.length, 1);
    assert.equal(p.status, "insufficient_unseen_families");
  }
});
test("quantity/name drift is retained rather than silently replacing source identity", () => {
  const r = response();
  r.product.quantity = "250 g";
  assert.deepEqual(planOffExpansion(code, r, hash, date, previous()).metadataChanged, [
    "sourceReportedQuantity",
  ]);
  assert.equal(planOffExpansion(code, { status: 0 }, hash, date, previous()).status, "unavailable");
});
test("reserves are bounded and never auto-substituted after viewing/model scores", () => {
  const r = response();
  r.product.images = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`${i + 1}`, original(`uploader-${i}`)]),
  );
  const p = planOffExpansion(code, r, hash, date, previous());
  assert.equal(p.candidateImages.length, 6);
  assert.equal(
    p.candidateImages.filter((x) => x.proposedRole === "reserve_not_auto_substitute").length,
    3,
  );
  assert.equal(OFF_EXPANSION_POLICY.modelCalls, 0);
  assert.equal(OFF_EXPANSION_POLICY.imagesDownloaded, 0);
});
test("canonical metadata stage refuses repeats before network or output work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "off-expansion-"));
  fs.mkdirSync(path.join(root, "work"));
  fs.writeFileSync(path.join(root, "work/off-expansion-metadata-v1-attempt.json"), "{}");
  let calls = 0;
  await assert.rejects(
    expandOffMetadata("work/new", date, root, async () => {
      calls++;
    }),
    /already_attempted/,
  );
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(path.join(root, "work/new")), false);
});
