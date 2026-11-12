import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createPlan,
  EXPERIMENT_V2,
  parseArguments,
  summarizeComparison,
  transformImage,
} from "../qa/reference-image/evaluate-v2.mjs";
import { transformImage as transformV1 } from "../qa/reference-image/evaluate.mjs";

const ids = [
  ...EXPERIMENT_V2.gallery,
  ...Array.from({ length: 42 }, (_, index) => `outside-${index}`),
];
const unknown = () => ({ status: "unknown", reason: "no_geometric_match" });
const accepted = (id) => ({ status: "candidate", productId: id });
function rows(v1Count = 20, v2Count = 26) {
  const syntheticIndex = new Map(
    EXPERIMENT_V2.gallery
      .flatMap((id) => EXPERIMENT_V2.variants.map((variant) => `${id}/${variant}`))
      .map((key, index) => [key, index]),
  );
  return createPlan(ids).map((entry) => ({
    ...entry,
    featureStatus: "ok",
    attempts: { extractions: 1, matches: 1 },
    result:
      entry.known &&
      (entry.variant === "original" ||
        syntheticIndex.get(`${entry.id}/${entry.variant}`) <
          (entry.engine === "v1" ? v1Count : v2Count))
        ? accepted(entry.id)
        : unknown(),
  }));
}
const summary = (observations) => summarizeComparison(observations, ids);

test("closed comparative modes and fixed budgets prevent accidental alternate experiments", () => {
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
    ["--retry", "work/a"],
  ])
    assert.throws(() => parseArguments(args));
  assert.equal(EXPERIMENT_V2.originals, 52);
  assert.equal(EXPERIMENT_V2.maximumDecodes, 52);
  assert.equal(EXPERIMENT_V2.maximumExtractions, 224);
  assert.equal(EXPERIMENT_V2.maximumMatches, 224);
  assert.equal(EXPERIMENT_V2.integrationAllowed, false);
  assert.ok(Object.isFrozen(EXPERIMENT_V2.gallery) && Object.isFrozen(EXPERIMENT_V2.variants));
});

test("exact plan has112queries per engine and224unique engine/id/variant keys", () => {
  const plan = createPlan(ids);
  assert.equal(plan.length, 224);
  assert.equal(new Set(plan.map((row) => `${row.engine}/${row.id}/${row.variant}`)).size, 224);
  for (const engine of EXPERIMENT_V2.engines) {
    const own = plan.filter((row) => row.engine === engine);
    assert.equal(own.filter((row) => row.variant === "original" && row.known).length, 10);
    assert.equal(own.filter((row) => row.variant !== "original").length, 60);
    assert.equal(own.filter((row) => !row.known).length, 42);
  }
  assert.throws(() => createPlan(ids.slice(1)), /invalid_original_plan/u);
  assert.throws(() => createPlan([...ids.slice(0, -1), ids[0]]), /duplicate_original_plan/u);
  assert.throws(
    () => createPlan([...ids.slice(1), "substituted-gallery"]),
    /missing_gallery_original/u,
  );
  assert.throws(() => createPlan([...ids.slice(0, -1), "../private"]), /invalid_original_plan/u);
});

test("fixed six-point synthetic gain passes only the engineering gate, never identity or integration", () => {
  const measured = summary(rows());
  assert.equal(measured.engineeringGate, "pass");
  assert.equal(measured.additionalSyntheticCorrect, 6);
  assert.equal(measured.v1.synthetic.correct, 20);
  assert.equal(measured.v2.synthetic.correct, 26);
  assert.equal(measured.v1.exact.correct, 10);
  assert.equal(measured.v2.exact.correct, 10);
  assert.equal(measured.v2.outside.observed, 42);
  assert.deepEqual(measured.v1CorrectLosses, []);
  assert.equal(measured.originalSources, 52);
  assert.equal(measured.plannedRows, 224);
  assert.equal(measured.productAccuracyEstablished, false);
  assert.equal(measured.integrationAllowed, false);
  assert.equal(measured.v1.extractions + measured.v2.extractions, 224);
  assert.equal(measured.v1.matches + measured.v2.matches, 224);
  assert.equal(summary(rows(20, 25)).engineeringGate, "fail");
});

test("all-abstain, lost self-reference and lost V1-correct query fail despite aggregate gains", () => {
  const all = rows().map((row) => ({ ...row, result: unknown() }));
  assert.equal(summary(all).engineeringGate, "fail");
  const selfLost = rows(20, 30);
  selfLost.find((row) => row.engine === "v2" && row.known && row.variant === "original").result =
    unknown();
  assert.equal(summary(selfLost).engineeringGate, "fail");
  const lost = rows(20, 30);
  const old = lost.find(
    (row) =>
      row.engine === "v1" &&
      row.known &&
      row.variant !== "original" &&
      row.result.status === "candidate",
  );
  lost.find(
    (row) => row.engine === "v2" && row.id === old.id && row.variant === old.variant,
  ).result = unknown();
  const measured = summary(lost);
  assert.equal(measured.additionalSyntheticCorrect, 9);
  assert.equal(measured.engineeringGate, "fail");
  assert.deepEqual(measured.v1CorrectLosses, [`${old.id}/${old.variant}`]);
});

test("a wrong candidate on a gallery or outside image cannot be hidden by positive coverage", () => {
  for (const known of [true, false]) {
    const observations = rows(20, 30);
    const target = observations.find((row) => row.engine === "v2" && row.known === known);
    target.result = accepted(EXPERIMENT_V2.gallery.find((id) => id !== target.id));
    assert.equal(summary(observations).v2.wrong, 1);
    assert.equal(summary(observations).engineeringGate, "fail");
  }
});

test("either engine's invalid or operational failure invalidates the comparison", () => {
  for (const engine of EXPERIMENT_V2.engines)
    for (const status of ["invalid", "failed"]) {
      const observations = rows(20, 30);
      observations.find((row) => row.engine === engine && !row.known).result = {
        status,
        reason: "fixed_failure",
      };
      const measured = summary(observations);
      assert.equal(measured[engine][status], 1);
      assert.equal(measured.engineeringGate, "fail");
    }
});

test("low detail outside originals remain in denominators and have no claimed matcher invocation", () => {
  const observations = rows();
  const low = observations.find((row) => row.engine === "v2" && !row.known);
  low.featureStatus = "low_detail";
  low.result = { status: "low_detail", reason: "insufficient_corners" };
  low.attempts.matches = 0;
  const measured = summary(observations);
  assert.equal(measured.engineeringGate, "pass");
  assert.equal(measured.v2.outside.observed, 42);
  assert.equal(measured.v2.lowDetail, 1);
  assert.equal(measured.v2.extractions, 112);
  assert.equal(measured.v2.matches, 111);
});

test("ambiguous results are explicit abstentions, never correct identity or invented participants", () => {
  const observations = rows();
  const target = observations.find((row) => row.engine === "v2" && !row.known);
  target.result = { status: "ambiguous", productIds: EXPERIMENT_V2.gallery.slice(0, 2) };
  assert.equal(summary(observations).v2.ambiguous, 1);
  assert.equal(summary(observations).v2.wrong, 0);
  assert.equal(summary(observations).engineeringGate, "pass");
  target.result.productIds = ["invented", EXPERIMENT_V2.gallery[0]];
  assert.equal(summary(observations).completeAndValid, false);
});

test("missing, duplicate, substituted, contradictory or unknown-state receipts cannot qualify", () => {
  assert.equal(summary(rows().slice(1)).engineeringGate, "fail");
  for (const mutate of [
    (value) => {
      value[0] = value[1];
    },
    (value) => {
      value[0].id = "invented";
    },
    (value) => {
      value[0].known = !value[0].known;
    },
    (value) => {
      value[0].engine = "v3";
    },
    (value) => {
      value[0].variant = "retuned";
    },
    (value) => {
      value[0].result = { status: "made-up" };
    },
    (value) => {
      value[0].result = accepted("invented");
    },
    (value) => {
      value[0].result = { status: "unknown", reason: "none", productId: EXPERIMENT_V2.gallery[0] };
    },
    (value) => {
      value[0].result = { status: "unknown" };
    },
  ]) {
    const observations = rows();
    mutate(observations);
    assert.equal(summary(observations).engineeringGate, "fail");
    assert.equal(summary(observations).completeAndValid, false);
  }
  assert.equal(summary(null).engineeringGate, "fail");
  assert.equal(summary([null]).engineeringGate, "fail");
});

test("attempt counts cannot hide extraction failures or claim skipped matching", () => {
  for (const mutate of [
    (row) => {
      row.attempts.extractions = 0;
    },
    (row) => {
      row.attempts.matches = 0;
    },
    (row) => {
      row.attempts.matches = 2;
    },
    (row) => {
      row.featureStatus = "failed";
    },
    (row) => {
      row.featureStatus = "invalid";
      row.attempts.matches = 0;
    },
    (row) => {
      row.result = { status: "low_detail", reason: "blur" };
    },
  ]) {
    const observations = rows();
    mutate(observations[0]);
    assert.equal(summary(observations).completeAndValid, false);
  }
  const observations = rows();
  const failed = observations.find((row) => row.engine === "v2" && !row.known);
  failed.featureStatus = "failed";
  failed.attempts = { extractions: 0, matches: 0 };
  failed.result = { status: "failed", reason: "source_decode_failed" };
  const measured = summary(observations);
  assert.equal(measured.completeAndValid, true);
  assert.equal(measured.v2.failed, 1);
  assert.equal(measured.v2.extractions, 111);
  assert.equal(measured.engineeringGate, "fail");
});

test("six transforms are deterministic bounded copies and first four retain V1 arithmetic", () => {
  const data = Uint8Array.from({ length: 40 * 32 * 3 }, (_, index) => index % 251);
  const image = { width: 40, height: 32, data },
    before = data.slice();
  for (const variant of EXPERIMENT_V2.variants) {
    const transformed = transformImage(image, variant);
    assert.deepEqual(transformed, transformImage(image, variant));
    assert.equal(transformed.data.length, data.length);
    assert.notEqual(transformed.data, data);
    assert.deepEqual(data, before);
  }
  for (const variant of ["light", "translate", "rotate90"])
    assert.deepEqual(transformImage(image, variant), transformV1(image, variant));
  assert.deepEqual(transformImage(image, "inset80"), transformV1(image, "inset"));
  const inset = transformImage(image, "inset60");
  assert.equal(inset.data[0], 127);
  assert.deepEqual(
    transformImage(image, "combo60"),
    transformV1(transformV1(inset, "rotate90"), "light"),
  );
  assert.throws(() => transformImage(image, "retune"));
  assert.throws(() => transformImage({ ...image, width: 1024 }, "inset60"));
  assert.throws(() => transformImage({ ...image, data: new Uint8Array(1) }, "combo60"));
});

test("source retains V1 evidence and bounds decoder/source/call budgets without runtime model APIs", () => {
  const source = fs.readFileSync(
    new URL("../qa/reference-image/evaluate-v2.mjs", import.meta.url),
    "utf8",
  );
  for (const marker of [
    "reference-pixel-v2-attempt.json",
    "prior_v1_evidence_drift",
    "v1_algorithm_drift",
    "source_drift_during_run",
    "decoder_drift_during_run",
    "counter_receipt_mismatch",
    "extraction_budget",
    "match_budget",
    "decode_budget",
    "limitInputPixels: 16_000_000",
  ])
    assert.ok(source.includes(marker), marker);
  assert.doesNotMatch(source, /\b(?:fetch|spawnSync|execSync)\s*\(/u);
  assert.doesNotMatch(source, /(?:rmSync|unlinkSync|renameSync|appendFileSync)\s*\(/u);
  assert.match(source, /paidApiCalls: 0/u);
  assert.match(source, /pretrainedPredictions: 0/u);
});

test("source binds the loaded workspace entry and original V1 transform runner before image work", () => {
  const source = fs.readFileSync(
    new URL("../qa/reference-image/evaluate-v2.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /for \(const name of \[\s*"shared\/domain\/src\/reference-image-features\.ts",\s*"shared\/domain\/src\/reference-image-matcher\.ts",\s*"scripts\/qa\/reference-image\/evaluate\.mjs",/u,
  );
  assert.match(
    source,
    /sha\(readBounded\(path\.join\(cwd, name\)\)\),\s*oldLock\.sources\[name\]/u,
  );
  assert.match(
    source,
    /const domainEntry = fs\.realpathSync\(\s*requireMobile\.resolve\("@kierratysappi\/domain\/reference-vision"\)/u,
  );
  assert.match(
    source,
    /assert\.equal\(\s*domainEntry,\s*path\.join\(cwd, "shared\/domain\/src\/reference-vision\.ts"\),\s*"unfrozen_domain_entry"/u,
  );
  assert.match(source, /const api = await tsImport\(domainEntry, import\.meta\.url\)/u);
  assert.ok(
    source.indexOf('"unfrozen_domain_entry"') <
      source.indexOf("const api = await tsImport(domainEntry"),
  );
});
