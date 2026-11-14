import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const review = JSON.parse(
  readFileSync(new URL("../../docs/final/OFF_EXPANSION_VISUAL_REVIEW.json", import.meta.url)),
);
test("visual observations retain all30planned IDs, missing images and uncertainty", () => {
  assert.equal(review.observations.length, 30);
  assert.equal(new Set(review.observations.map((r) => r.id)).size, 30);
  assert.deepEqual(
    review.observations.map((r) => r.id),
    Array.from({ length: 30 }, (_, i) => `exp-${String(i + 1).padStart(3, "0")}`),
  );
  assert.equal(review.observations.filter((r) => r.view === "transport_failure").length, 5);
  assert.equal(review.identityStatus, "source_asserted_unverified");
  assert.equal(review.integrationAllowed, false);
  assert.equal(review.modelCalls, 0);
});
test("crops/mixed scenes do not silently become whole-product observations", () => {
  assert.equal(review.observations.filter((r) => r.view === "label_crop").length, 9);
  assert.equal(review.observations.filter((r) => r.view === "mixed_scene").length, 1);
  assert.equal(review.observations.filter((r) => r.view === "illustration_candidate").length, 3);
  assert.equal(review.automaticRoleSubstitution, false);
});
