import assert from "node:assert/strict";
import test from "node:test";
import { recountOrientation } from "../qa/review-orientation-corpus.mjs";
const fixture = () =>
  [0, 90, 180, 270].map((rotation) => ({
    rotation,
    result: { status: "unknown", productIds: [] },
  }));
test("separate consensus recount retains recovery, conflict and failure veto", () => {
  const f = fixture();
  assert.equal(recountOrientation(f).status, "unknown");
  f[1].result = { status: "candidate", productIds: ["a"] };
  assert.deepEqual(recountOrientation(f).supportingRotations, [90]);
  f[2].result = { status: "candidate", productIds: ["b"] };
  assert.equal(recountOrientation(f).status, "ambiguous");
  f[3].result = { status: "unavailable", productIds: [] };
  assert.equal(recountOrientation(f).status, "unavailable");
});
test("incomplete or reordered four-view evidence cannot be recounted as complete", () => {
  assert.throws(() => recountOrientation(fixture().slice(1)));
  const f = fixture();
  f[1].rotation = 0;
  assert.throws(() => recountOrientation(f));
});
