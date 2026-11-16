import assert from "node:assert/strict";
import test from "node:test";
import { objectSmoke, summarizeObjectSmoke } from "../qa/object-smoke-protocol.mjs";
const fixtures = () =>
  ["mobileclip", "siglip2"].flatMap((model) =>
    objectSmoke.rows.map((r) => ({
      model,
      id: r.id,
      failure: null,
      scores: objectSmoke.classes.map((group) => ({
        group,
        cosine: group === r.expected ? 0.8 : 0.1,
      })),
    })),
  );
test("frozen scope is four scenes two positives two multi-object controls", () => {
  assert.equal(objectSmoke.rows.length, 4);
  assert.equal(objectSmoke.prompts.length, 15);
  assert.equal(objectSmoke.automaticAcceptance, false);
  assert.equal(objectSmoke.retries, 0);
  assert.equal(objectSmoke.excluded[0].id, "commons-5-clean");
  assert.equal(objectSmoke.rows.filter((r) => r.role === "text-free-positive").length, 2);
});
test("correct ranks do not grant automatic acceptance or release", () => {
  const r = summarizeObjectSmoke(fixtures());
  for (const model of Object.values(r)) {
    assert.equal(model.positiveTop1, 2);
    assert.equal(model.controlTop1, 2);
    assert.equal(model.automaticAccepts, 0);
    assert.equal(model.releaseReady, false);
  }
});
test("failed prediction remains in denominator, cannot match absent expected value", () => {
  const rows = fixtures();
  rows[1] = { model: "mobileclip", id: objectSmoke.rows[1].id, failure: "timeout" };
  const r = summarizeObjectSmoke(rows).mobileclip;
  assert.equal(r.positives, 2);
  assert.equal(r.positiveTop1, 1);
  assert.equal(r.failures, 1);
});
test("reject missing or duplicate model/image rows", () => {
  assert.throws(() => summarizeObjectSmoke(fixtures().slice(1)), /all_rows_required/);
  const rows = fixtures();
  rows[1] = rows[0];
  assert.throws(() => summarizeObjectSmoke(rows), /duplicate_or_missing_model_row/);
});
test("reject incomplete, repeated, out-of-range or nonfinite scores", () => {
  for (const change of [
    (r) => r.scores.pop(),
    (r) => {
      r.scores[0] = r.scores[1];
    },
    (r) => {
      r.scores[0].cosine = NaN;
    },
    (r) => {
      r.scores[0].cosine = 2;
    },
  ]) {
    const rows = fixtures();
    change(rows[0]);
    assert.throws(() => summarizeObjectSmoke(rows));
  }
});
