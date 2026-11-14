import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EXPANDED_ALLOCATION,
  freezeExpandedAllocation,
  validateExpandedAllocation,
} from "../qa/reference-image/allocate-expanded-corpus.mjs";

function fixture() {
  let ordinal = 0;
  const rows = [];
  const add = (id, allocationRole, props = {}) => {
    const row = {
      id,
      allocationRole,
      imageSha256: (++ordinal).toString(16).padStart(64, "0"),
      familyId: `f-${id}`,
      status: "observed_source_asserted",
      view: "front_or_near_full",
      source: { reviewStatus: "source_asserted_pending_review" },
      ...props,
    };
    rows.push(row);
    return row;
  };
  for (const p of EXPANDED_ALLOCATION) {
    for (const id of p.references) add(id, "reference", { productId: p.productId });
    add(p.pilotQuery, "product_query", {
      productId: p.productId,
      evaluationNovelty:
        p.pilotQuery === "case-008"
          ? "seen_sentinel_new_catalogue_membership"
          : "new_image_selected_before_recognition",
    });
  }
  for (let i = 0; i < 12; i++)
    add(`old-query-${i}`, "product_query", { productId: EXPANDED_ALLOCATION[0].productId });
  for (let i = 0; i < 32; i++)
    add(`negative-${i}`, "calibration_negative", { originalRole: "calibration_only" });
  for (let i = 0; i < 41; i++)
    add(`audit-${i}`, "safety_audit", {
      originalRole: i < 8 ? "calibration_only" : "evaluation_negative",
      controlKind: i < 8 ? "mixed_scene" : "other_source_asserted",
    });
  add("case-007", "excluded_shared_reference_batch");
  for (let i = 0; i < 22; i++) add(`unallocated-${i}`, "unallocated_candidate");
  const originalQueries = rows
    .filter((r) => ["product_query", "safety_audit"].includes(r.allocationRole))
    .slice(0, 45)
    .map((r) => ({ id: r.id, imageSha256: r.imageSha256 }));
  return { rows, originalQueries };
}
const check = (f) => validateExpandedAllocation(f.rows, EXPANDED_ALLOCATION, f.originalQueries);
test("complete allocation keeps123inventory,58queries and explicit seen/new pilot scope", () => {
  const r = check(fixture());
  assert.equal(r.products, 5);
  assert.equal(r.references, 10);
  assert.equal(r.calibrationNegatives, 32);
  assert.equal(r.productQueries, 17);
  assert.equal(r.safetyAudits, 41);
  assert.equal(r.newPilotImages, 4);
  assert.equal(r.seenPilotImages, 1);
  assert.equal(r.integrationAllowed, false);
});
test("same-family references and fit/query families cannot leak across roles", () => {
  for (const edit of [
    (r) =>
      (r.find((x) => x.id === "exp-006").familyId = r.find((x) => x.id === "case-004").familyId),
    (r) =>
      (r.find((x) => x.id === "exp-003").familyId = r.find((x) => x.id === "case-004").familyId),
  ]) {
    const f = fixture();
    edit(f.rows);
    assert.throws(() => check(f));
  }
});
test("original query IDs and image aliases may never enter training", () => {
  const f = fixture(),
    ref = f.rows.find((r) => r.allocationRole === "reference");
  f.originalQueries.push({ id: ref.id, imageSha256: ref.imageSha256 });
  assert.throws(() => check(f), /original_query_training_leakage/);
  const g = fixture();
  g.rows.find((r) => r.allocationRole === "reference").imageSha256 =
    g.originalQueries[0].imageSha256;
  assert.throws(() => check(g), /original_query_training_leakage/);
});
test("cannot substitute another reference, hide a missing query or drop inventory", () => {
  const f = fixture();
  f.rows.find((r) => r.id === "exp-006").id = "replacement";
  assert.throws(() => check(f), /unregistered_reference_substitution/);
  const g = fixture();
  g.rows.pop();
  assert.throws(() => check(g), /complete_inventory/);
  const h = fixture();
  h.rows.find((r) => r.id === "exp-003").allocationRole = "unallocated_candidate";
  assert.throws(() => check(h));
});
test("crops, mixed scenes, failed images and fake source verification are refused for fit", () => {
  for (const patch of [
    { view: "label_crop" },
    { view: "mixed_scene" },
    { status: "failed" },
    { source: { reviewStatus: "verified" } },
  ]) {
    const f = fixture();
    Object.assign(
      f.rows.find((r) => r.allocationRole === "reference"),
      patch,
    );
    assert.throws(() => check(f));
  }
});
test("shared legacy batch exclusion and old sentinel scope may not be hidden", () => {
  const f = fixture();
  f.rows.find((r) => r.id === "case-007").allocationRole = "unallocated_candidate";
  assert.throws(() => check(f));
  const g = fixture();
  g.rows.find((r) => r.id === "case-008").evaluationNovelty = "new_held_out_accuracy";
  assert.throws(() => check(g));
});
test("mixed training rows stay safety audits rather than target-absence labels", () => {
  const f = fixture();
  f.rows.find((r) => r.allocationRole === "calibration_negative").controlKind = "mixed_scene";
  assert.throws(() => check(f), /mixed_fit_negative/);
});
test("canonical allocation refuses repeats before any input decode or output", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "expanded-allocation-"));
  fs.mkdirSync(path.join(root, "work"));
  fs.writeFileSync(path.join(root, "work/expanded-corpus-allocation-v1-attempt.json"), "{}");
  await assert.rejects(freezeExpandedAllocation("work/new", root), /already_attempted/);
  assert.equal(fs.existsSync(path.join(root, "work/new")), false);
});
