import assert from "node:assert/strict";
import test from "node:test";
import { independentlyReadAmount } from "../qa/review-ocr-attribute-corpus.mjs";
test("separate integer corroboration agrees on metric amounts without fuzzy digits", () => {
  assert.equal(independentlyReadAmount("0,75 kg"), "mass_mg:750000");
  assert.equal(independentlyReadAmount("750g ℮"), "mass_mg:750000");
  assert.equal(independentlyReadAmount("33 cl"), "volume_ul:330000");
  assert.notEqual(independentlyReadAmount("330 g"), independentlyReadAmount("330ml"));
});
test("independent corroboration rejects nutrition/serving/multipack/hidden/overflow input", () => {
  for (const s of [
    "per 100 g",
    "serving 400g",
    "4x100g",
    "4OO g",
    "400",
    "0g",
    "100001kg",
    "1.2345g",
    "400g\n",
    "400g\u200b",
  ])
    assert.equal(independentlyReadAmount(s), null);
});
