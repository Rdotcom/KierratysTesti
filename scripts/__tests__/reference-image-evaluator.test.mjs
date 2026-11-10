import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  EXPERIMENT,
  parseArguments,
  summarize as summarizeRows,
  transformImage,
} from "../qa/reference-image/evaluate.mjs";

const plannedIds = [...EXPERIMENT.gallery, ...Array.from({ length: 27 }, (_, i) => `outside-${i}`)];
const summarize = (rows) => summarizeRows(rows, plannedIds);

test("reference experiment has closed modes, once-only budgets and no integration gate", () => {
  assert.equal(EXPERIMENT.maximumDecodes, 32);
  assert.equal(EXPERIMENT.maximumExtractions, 52);
  assert.equal(EXPERIMENT.integrationAllowed, false);
  assert.equal(EXPERIMENT.gallery.length, 5);
  assert.deepEqual(parseArguments(["--freeze", "work/freeze"]), {
    mode: "freeze",
    output: "work/freeze",
  });
  assert.equal(
    parseArguments(["--run", "work/lock.json", "1".repeat(64), "work/result"]).mode,
    "run",
  );
  for (const args of [
    [],
    ["--run"],
    ["--freeze", "work/a", "--force"],
    ["--run", "work/a", "fake", "work/b"],
  ])
    assert.throws(() => parseArguments(args));
});

function rows() {
  const known = EXPERIMENT.gallery.flatMap((id) =>
    ["original", ...EXPERIMENT.variants].map((variant) => ({
      id,
      variant,
      known: true,
      result: { status: "candidate", productId: id },
    })),
  );
  const outside = Array.from({ length: 27 }, (_, i) => ({
    id: `outside-${i}`,
    variant: "original",
    known: false,
    result: { status: "unknown" },
  }));
  return [...known, ...outside];
}

test("narrow engineering pass never establishes product accuracy or deployment", () => {
  const result = summarize(rows());
  assert.equal(result.engineeringGate, "pass");
  assert.equal(result.productAccuracyEstablished, false);
  assert.equal(result.integrationAllowed, false);
  assert.equal(result.originalSources, 32);
  assert.deepEqual(result.synthetic, { planned: 20, observed: 20, correct: 20 });
  assert.deepEqual(result.outside, { planned: 27, observed: 27, wrong: 0 });
});

test("wrong, ambiguous, invalid and operational failures cannot be hidden", () => {
  for (const result of [
    { status: "candidate", productId: "wrong" },
    { status: "ambiguous" },
    { status: "invalid" },
    { status: "failed" },
  ]) {
    const cases = rows();
    cases[0].result = result;
    assert.equal(summarize(cases).engineeringGate, "fail");
  }
  const cases = rows();
  cases.at(-1).result = { status: "candidate", productId: EXPERIMENT.gallery[0] };
  assert.equal(summarize(cases).wrongMatches, 1);
  assert.equal(summarize(cases).engineeringGate, "fail");
});

test("missing, duplicated, contradictory and low-detail gallery rows retain failed denominators", () => {
  assert.equal(summarize(rows().slice(1)).engineeringGate, "fail");
  const duplicate = rows();
  duplicate[0] = duplicate[1];
  assert.equal(summarize(duplicate).engineeringGate, "fail");
  const badKnown = rows();
  badKnown[0].known = false;
  assert.equal(summarize(badKnown).engineeringGate, "fail");
  const low = rows();
  low[0].result = { status: "low_detail" };
  assert.equal(summarize(low).exact.planned, 5);
  assert.equal(summarize(low).engineeringGate, "fail");
});

test("invented original IDs, invalid status and identity on abstention cannot qualify", () => {
  const invented = rows();
  invented.at(-1).id = "not-in-the-frozen-plan";
  assert.equal(summarize(invented).engineeringGate, "fail");
  for (const result of [
    { status: "made-up" },
    { status: "unknown", productId: EXPERIMENT.gallery[0] },
  ]) {
    const cases = rows();
    cases.at(-1).result = result;
    assert.equal(summarize(cases).engineeringGate, "fail");
  }
  assert.throws(() => summarizeRows(rows(), []));
});

test("all fixed raw transforms are bounded, deterministic and never mutate their input", () => {
  const data = Uint8Array.from({ length: 40 * 32 * 3 }, (_, i) => i % 251);
  const input = { width: 40, height: 32, data };
  const old = data.slice();
  for (const variant of EXPERIMENT.variants) {
    const result = transformImage(input, variant);
    assert.deepEqual(result, transformImage(input, variant));
    assert.equal(result.data.length, data.length);
    assert.notEqual(result.data, data);
    assert.deepEqual(data, old);
  }
  const rotated = transformImage(input, "rotate90");
  assert.equal(rotated.width, 32);
  assert.equal(rotated.height, 40);
  assert.equal(rotated.data[0], data[31 * 40 * 3]);
  assert.equal(transformImage(input, "light").data[0], 15);
  assert.equal(transformImage(input, "translate").data[0], 127);
  assert.throws(() => transformImage(input, "retune"));
  assert.throws(() => transformImage({ ...input, width: 999999 }, "light"));
});

test("prototype stays pure and decoder does not acquire data or call a model", () => {
  for (const file of ["reference-image-features.ts", "reference-image-matcher.ts"]) {
    const source = fs.readFileSync(
      new URL(`../../shared/domain/src/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|require|console|eval)\s*\(/u);
    assert.doesNotMatch(source, /node:|openai|coreml|mobileclip|AsyncStorage|expo-/iu);
  }
  const runner = fs.readFileSync(
    new URL("../qa/reference-image/evaluate.mjs", import.meta.url),
    "utf8",
  );
  assert.match(runner, /reference-pixel-v1-attempt\.json/u);
  assert.match(runner, /source_drift_during_run/u);
  assert.match(runner, /limitInputPixels: 16_000_000/u);
  assert.doesNotMatch(runner, /\b(?:fetch|spawnSync|execSync)\s*\(/u);
});
