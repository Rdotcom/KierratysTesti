// Explicit QA-only reliability comparison. Public image bytes alone reach models.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cascade, decodeBaseline } from "./packaging-evaluate.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = (file) => sha(fs.readFileSync(file));
const gates = Object.freeze({ minimumCosine: 0.2, minimumLead: 0.02 });
const minimumCorrectAccepted = 5;
const kinds = ["bottle", "jar", "box", "bag", "cup"];
const pin = Object.freeze({
  primary: "622a898cf789889d7380d27b80e9fa8837b0b01c456cb2d04a3e524b7fab9e37",
  center: "4d9694bbade83b4117a109c9430235983dd0293ffc646b42e14904e05fd93c60",
  fit: "1611f4330c94ab7a932518123537518a54b342f979c3ede77164b8d68f3bdba0",
  prototypes: "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81",
  prompts: "aa726197e10fc1911b88bb6d6da099220339133c6e39e500f112b9077316e610",
  graph: "858f2fc75c7d7b2fd182c1a13ae099a3f66c16ba1d0ea72375a0cdf6fe97b984",
  weights: "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6",
});
const unknown = (reason) => ({ status: "unknown", reason });
const estimated = (kind, method) => ({ status: "estimated", kind, method });
const blocked = (primary) =>
  primary.status !== "estimated" && primary.reason !== "no_operating_point_match";

export function baselineDecision(primary, center, decide) {
  return cascade(
    primary,
    center.operationalSuccess ? decide(center.scores, "loose") : unknown("model_failure"),
  );
}
export function contradictionVeto(primary, center, decide) {
  if (blocked(primary)) return unknown("primary_uncertainty");
  if (!center.operationalSuccess) return unknown("model_failure");
  if (primary.status !== "estimated") return decide(center.scores, "loose");
  const ordered = [...center.scores].sort((a, b) => b.cosine - a.cosine);
  const [first, second] = ordered;
  if (!first || !second) return unknown("invalid_scores");
  if (
    first.cosine >= gates.minimumCosine &&
    first.cosine - second.cosine >= gates.minimumLead &&
    first.group !== primary.kind
  )
    return unknown("cross_model_contradiction");
  return estimated(primary.kind, "primary_without_confident_contradiction");
}
export function twoViewAgreement(primary, center, fit, decide) {
  if (blocked(primary)) return unknown("primary_uncertainty");
  if (!center.operationalSuccess || !fit?.operationalSuccess) return unknown("model_failure");
  const first = decide(center.scores, "loose"),
    second = decide(fit.scores, "loose");
  if (first.status !== "estimated" || second.status !== "estimated" || first.kind !== second.kind)
    return unknown("views_disagree_or_abstain");
  if (primary.status === "estimated" && primary.kind !== first.kind)
    return unknown("cross_model_contradiction");
  return estimated(first.kind, "two_view_agreement");
}
export function operationalState(primary, center, fit, algorithm) {
  if (!primary.valid) return { valid: false, success: false };
  if (!primary.operationalSuccess) return { valid: true, success: false };
  if (blocked(primary.primary)) return { valid: true, success: true };
  const required =
    algorithm === "baseline" && primary.primary.status === "estimated"
      ? []
      : algorithm === "B"
        ? [center, fit]
        : [center];
  return {
    valid: required.every((entry) => entry?.valid === true),
    success: required.every((entry) => entry?.valid === true && entry.operationalSuccess),
  };
}
export function measure(rows, algorithm) {
  const result = {
    total: rows.length,
    positives: 0,
    controls: 0,
    correctAccepted: 0,
    wrongKindAccepted: 0,
    outsideFalseAccepted: 0,
    wrongAccepted: 0,
    positiveUnknown: 0,
    safeAbstention: 0,
    newlyWrong: 0,
    lostBaselineCorrect: 0,
    removedBaselineWrong: 0,
    operationalFailures: 0,
    invalidRequiredOutputs: 0,
    introducedOperationalFailures: 0,
  };
  for (const row of rows) {
    const isPositive = row.expectedKind !== "unknown";
    const base = row.decisions.baseline,
      current = row.decisions[algorithm];
    const accepted = current.status === "estimated";
    const correct = isPositive && accepted && current.kind === row.expectedKind;
    const wrong = accepted && current.kind !== row.expectedKind;
    const baseCorrect = isPositive && base.status === "estimated" && base.kind === row.expectedKind;
    const baseWrong = base.status === "estimated" && base.kind !== row.expectedKind;
    const state = row.operational[algorithm];
    result.positives += Number(isPositive);
    result.controls += Number(!isPositive);
    result.correctAccepted += Number(correct);
    result.wrongKindAccepted += Number(isPositive && wrong);
    result.outsideFalseAccepted += Number(!isPositive && accepted);
    result.wrongAccepted += Number(wrong);
    result.positiveUnknown += Number(isPositive && !accepted);
    result.safeAbstention += Number(!isPositive && !accepted && state.success);
    result.newlyWrong += Number(wrong && (!baseWrong || current.kind !== base.kind));
    result.lostBaselineCorrect += Number(baseCorrect && !correct);
    result.removedBaselineWrong += Number(baseWrong && !wrong && state.success);
    result.operationalFailures += Number(!state.success);
    result.invalidRequiredOutputs += Number(!state.valid);
    result.introducedOperationalFailures += Number(
      row.operational.baseline.success && !state.success,
    );
  }
  return result;
}
export function selectValidation(rows) {
  const baseline = measure(rows, "baseline");
  const results = ["A", "B"].map((algorithm) => {
    const metrics = measure(rows, algorithm);
    return {
      algorithm,
      ...metrics,
      eligible:
        metrics.correctAccepted >= minimumCorrectAccepted &&
        metrics.wrongAccepted === 0 &&
        metrics.newlyWrong === 0 &&
        metrics.removedBaselineWrong >= 1 &&
        metrics.lostBaselineCorrect <= 1 &&
        metrics.invalidRequiredOutputs === 0 &&
        metrics.introducedOperationalFailures === 0,
    };
  });
  const eligible = results
    .filter((row) => row.eligible)
    .sort(
      (a, b) => b.correctAccepted - a.correctAccepted || a.algorithm.localeCompare(b.algorithm),
    );
  return { baseline, results, selectedAlgorithm: eligible[0]?.algorithm ?? null };
}
export function modelStageCounts(rows) {
  return Object.fromEntries(
    ["primary", "center", "fit"].map((stage) => {
      const values = rows.map((row) => row[stage]).filter(Boolean);
      return [
        stage,
        {
          executions: values.length,
          observed: values.filter((entry) => entry.valid && entry.operationalSuccess).length,
          definedFailures: values.filter((entry) => entry.valid && !entry.operationalSuccess)
            .length,
          invalidOutputs: values.filter((entry) => !entry.valid).length,
        },
      ];
    }),
  );
}
export function heldoutDecision(rows, selectedAlgorithm) {
  const baseline = measure(rows, "baseline");
  if (selectedAlgorithm === null)
    return { baseline, selectedAlgorithm: null, candidate: null, integrationEligible: false };
  assert.ok(["A", "B"].includes(selectedAlgorithm));
  const candidate = measure(rows, selectedAlgorithm);
  return {
    baseline,
    selectedAlgorithm,
    candidate,
    integrationEligible:
      candidate.correctAccepted >= minimumCorrectAccepted &&
      candidate.wrongAccepted === 0 &&
      candidate.newlyWrong === 0 &&
      candidate.lostBaselineCorrect <= 1 &&
      candidate.invalidRequiredOutputs === 0 &&
      candidate.introducedOperationalFailures === 0,
  };
}

const observationKeys = [
  "schemaVersion",
  "modelId",
  "modelRevision",
  "imageWeightSha256",
  "prototypesSha256",
  "promptPolicy",
  "promptsSha256",
  "preprocessing",
  "computeUnits",
  "osVersion",
  "durationMs",
  "embeddingNorm",
  "scores",
].sort();
const failureReasons = [
  "invalid_arguments",
  "invalid_path",
  "invalid_assets",
  "invalid_prompt",
  "invalid_prototype",
  "invalid_image",
  "invalid_model",
  "processing_failed",
];
export function decodeClip(call, preprocessing, validateScores) {
  const raw = call.raw;
  const plain = raw && typeof raw === "object" && !Array.isArray(raw);
  if (
    plain &&
    !call.failed &&
    !call.signal &&
    !call.errorCode &&
    call.exitCode === 1 &&
    Object.keys(raw).sort().join(",") === "reason,status" &&
    raw.status === "unavailable" &&
    failureReasons.includes(raw.reason)
  )
    return { valid: true, operationalSuccess: false, scores: [], failureReason: raw.reason };
  const valid = Boolean(
    plain &&
      !call.failed &&
      !call.signal &&
      !call.errorCode &&
      call.exitCode === 0 &&
      JSON.stringify(Object.keys(raw).sort()) === JSON.stringify(observationKeys) &&
      raw.schemaVersion === "mobileclip-s0-scores-v1" &&
      raw.modelId === "apple-mobileclip-s0-coreml-2024" &&
      raw.modelRevision === "55c8098c12ba8f928e37e26b2e1dd097777c3f98" &&
      raw.imageWeightSha256 === pin.weights &&
      raw.prototypesSha256 === pin.prototypes &&
      raw.promptsSha256 === pin.prompts &&
      raw.promptPolicy === "packaging-visible-form-v1" &&
      raw.preprocessing === preprocessing &&
      raw.computeUnits === "cpuOnly" &&
      typeof raw.osVersion === "string" &&
      /^\d{1,3}(?:\.\d{1,3}){0,2}$/u.test(raw.osVersion) &&
      Number.isFinite(raw.embeddingNorm) &&
      Math.abs(raw.embeddingNorm - 1) < 0.00001 &&
      Number.isInteger(raw.durationMs) &&
      raw.durationMs >= 0 &&
      raw.durationMs <= 60_000 &&
      validateScores(raw.scores),
  );
  return {
    valid,
    operationalSuccess: valid,
    scores: valid ? raw.scores : [],
    failureReason: valid ? null : "invalid_response",
  };
}
export function parseArguments(args) {
  const names = new Set([
    "primary",
    "center",
    "fit",
    "compiled",
    "prototypes",
    "corpus",
    "manifest-sha",
    "phase",
    "output",
    "selection",
    "selection-sha",
  ]);
  const result = {};
  let run = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--run") {
      assert.equal(run, false);
      run = true;
      continue;
    }
    const name = args[index].slice(2),
      value = args[++index];
    assert.ok(args[index - 1].startsWith("--") && names.has(name) && !(name in result));
    assert.ok(value && !value.startsWith("--") && !/^[a-z]+:/iu.test(value));
    result[name] = value;
  }
  assert.ok(run, "explicit_run_required");
  for (const name of names)
    if (!["selection", "selection-sha"].includes(name)) assert.ok(result[name], `missing_${name}`);
  assert.ok(["validation", "heldout"].includes(result.phase));
  assert.match(result["manifest-sha"], /^[a-f0-9]{64}$/u);
  assert.equal(Boolean(result.selection), result.phase === "heldout");
  assert.equal(Boolean(result["selection-sha"]), result.phase === "heldout");
  if (result["selection-sha"]) assert.match(result["selection-sha"], /^[a-f0-9]{64}$/u);
  return result;
}
function workPath(work, input, directory = false) {
  const file = path.resolve(input),
    stat = fs.lstatSync(file);
  assert.ok(
    fs.realpathSync(file) === file &&
      file.startsWith(`${work}${path.sep}`) &&
      !stat.isSymbolicLink(),
  );
  assert.ok(directory ? stat.isDirectory() : stat.isFile());
  return file;
}
function json(file, maximum = 1_000_000) {
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maximum);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function directoryHash(directory) {
  const entries = [];
  let total = 0;
  function visit(root) {
    for (const name of fs.readdirSync(root).sort()) {
      const file = path.join(root, name),
        stat = fs.lstatSync(file);
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) visit(file);
      else {
        assert.ok(stat.isFile());
        total += stat.size;
        assert.ok(total <= 40_000_000 && entries.length < 200);
        entries.push([path.relative(directory, file), hashFile(file)]);
      }
    }
  }
  visit(directory);
  return sha(JSON.stringify(entries));
}
function rawCall(binary, args, input) {
  const start = performance.now();
  const response = spawnSync(binary, args, {
    input: input.toString("base64"),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 200_000,
  });
  let raw = null;
  try {
    raw = JSON.parse(response.stdout);
  } catch {
    /* malformed remains invalid */
  }
  return {
    raw,
    exitCode: response.status,
    signal: response.signal,
    failed: Boolean(response.error || response.signal),
    errorCode: response.error?.code ?? null,
    wallMs: Math.round(performance.now() - start),
    stdout: response.stdout ?? "",
    stderr: response.stderr ?? "",
  };
}

export async function evaluate(options, cwd = process.cwd()) {
  const work = fs.realpathSync(path.join(cwd, "work"));
  const binaries = Object.fromEntries(
    ["primary", "center", "fit"].map((name) => {
      const file = workPath(work, options[name]);
      fs.accessSync(file, fs.constants.X_OK);
      assert.ok(fs.statSync(file).size < 50_000_000);
      assert.equal(hashFile(file), pin[name], `unreviewed_${name}_binary`);
      return [name, file];
    }),
  );
  const compiled = workPath(work, options.compiled, true),
    prototypes = workPath(work, options.prototypes);
  assert.equal(hashFile(prototypes), pin.prototypes);
  assert.equal(hashFile(path.join(compiled, "model.mil")), pin.graph);
  assert.equal(hashFile(path.join(compiled, "weights/weight.bin")), pin.weights);
  const corpus = workPath(work, options.corpus, true),
    manifestPath = workPath(work, path.join(corpus, "fixtures.json"));
  assert.equal(hashFile(manifestPath), options["manifest-sha"]);
  // Imported lazily so pure decision tests never acquire data or invoke a model.
  const validatorPath = path.join(cwd, "scripts/qa/local-vision/robustness-corpus.mjs");
  const { validateManifest, validateLocal } = await import(pathToFileURL(validatorPath).href);
  const manifest = validateManifest(json(manifestPath));
  validateLocal(manifest, corpus);
  const requireMobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  const normalizerPath = requireMobile.resolve("@kierratysappi/contracts/local-vision");
  const gatePath = requireMobile.resolve("@kierratysappi/contracts/packaging-classifier");
  const { normalizeLocalVisionResult } = await import(pathToFileURL(normalizerPath).href);
  const { PackagingScoresSchema, decidePackagingScores, packagingGatePolicies } = await import(
    pathToFileURL(gatePath).href
  );
  assert.deepEqual(packagingGatePolicies.loose, gates);
  const sourcePaths = {
    ...binaries,
    prototypes,
    manifest: manifestPath,
    prompts: path.join(cwd, "scripts/qa/local-vision/mobileclip-prompts.json"),
    normalizer: normalizerPath,
    gate: gatePath,
    centerSource: path.join(cwd, "scripts/qa/local-vision/mobileclip-main.swift"),
    tokenizerSource: path.join(cwd, "scripts/qa/local-vision/mobileclip-tokenizer.swift"),
    fitSource: path.join(cwd, "scripts/qa/local-vision/mobileclip-robustness-main.swift"),
    evaluator: path.join(cwd, "scripts/qa/local-vision/robustness-evaluate.mjs"),
    baselineDecoder: path.join(cwd, "scripts/qa/local-vision/packaging-evaluate.mjs"),
    corpusValidator: validatorPath,
    priorData: path.join(cwd, "scripts/qa/local-vision/robustness-prior.json"),
    corpusSpecification: path.join(cwd, "scripts/qa/local-vision/robustness-cases.json"),
    corpusSupplementSpecification: path.join(
      cwd,
      "scripts/qa/local-vision/robustness-supplement-cases.json",
    ),
    corpusReview: path.join(cwd, "scripts/qa/local-vision/robustness-review.json"),
    committedManifest: path.join(cwd, "scripts/qa/local-vision/robustness-manifest.json"),
    corpusHelpers: path.join(cwd, "scripts/qa/local-vision/independent-corpus.mjs"),
    legacyCorpusValidator: path.join(cwd, "scripts/qa/local-vision/packaging-corpus.mjs"),
    protocol: path.join(cwd, "scripts/qa/protocols/local-vision-robustness-protocol.md"),
    accountingAmendment: path.join(cwd, "scripts/qa/protocols/packaging-accounting-amendment.md"),
    modelAssets: path.join(cwd, "scripts/qa/local-vision/mobileclip-assets.json"),
  };
  const hashesNow = () => ({
    ...Object.fromEntries(
      Object.entries(sourcePaths).map(([name, file]) => [name, hashFile(file)]),
    ),
    compiled: directoryHash(compiled),
  });
  const hashes = hashesNow();
  assert.equal(hashes.prompts, pin.prompts);
  let selection = null;
  if (options.phase === "heldout") {
    const selectionFile = workPath(work, options.selection);
    assert.equal(hashFile(selectionFile), options["selection-sha"], "selection_receipt_drift");
    selection = json(selectionFile);
    const started = json(workPath(work, path.join(path.dirname(selectionFile), "started.json")));
    assert.equal(selection.phase, "validation");
    assert.equal(selection.sourceHashesUnchanged, true);
    assert.ok(["A", "B", null].includes(selection.selectedAlgorithm));
    assert.equal(started.phase, "validation");
    assert.ok(
      Number.isFinite(Date.parse(started.startedAt)) &&
        Number.isFinite(Date.parse(selection.completedAt)),
    );
    assert.ok(
      Date.parse(started.startedAt) <= Date.parse(selection.completedAt) &&
        Date.parse(selection.completedAt) <= Date.now(),
    );
    assert.equal(selection.calls, 48);
    assert.equal(selection.cases.length, 16);
    assert.ok(selection.cases.every((row) => row.split === "validation"));
    const checkedSelection = selectValidation(selection.cases);
    for (const key of ["baseline", "results", "selectedAlgorithm"])
      assert.deepEqual(selection[key], checkedSelection[key], "altered_selection_decision");
    assert.deepEqual(selection.hashes, hashes, "selection_source_drift");
    assert.deepEqual(started.hashes, hashes, "selection_started_source_drift");
  }
  const fixtures = manifest.fixtures.filter((row) => row.split === options.phase);
  assert.equal(fixtures.length, 16);
  assert.equal(fixtures.filter((row) => kinds.includes(row.expectedKind)).length, 10);
  assert.equal(fixtures.filter((row) => row.expectedKind === "unknown").length, 6);
  const inputs = fixtures.map((row) => {
    assert.equal(row.seenDiagnostic, false);
    assert.match(row.id, /^[a-z][a-z0-9-]+$/u);
    const file = workPath(work, path.join(corpus, `${row.id}.jpg`)),
      bytes = fs.readFileSync(file);
    assert.ok(bytes.length <= 1_500_000 && bytes.length === row.bytes && sha(bytes) === row.sha256);
    return { ...row, file, bytes };
  });
  const output = path.resolve(options.output);
  workPath(work, path.dirname(output), true);
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output);
  const write = (name, value) =>
    fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
  const runFit = options.phase === "validation" || selection?.selectedAlgorithm === "B";
  write("started.json", {
    startedAt: new Date().toISOString(),
    phase: options.phase,
    hashes,
    selectionSha256: options.selection ? hashFile(options.selection) : null,
    selectedAlgorithm: selection?.selectedAlgorithm ?? null,
    callsPlanned: inputs.length * (runFit ? 3 : 2),
    paidCalls: 0,
    cases: inputs.map(({ file: _file, bytes: _bytes, ...row }) => row),
  });
  let calls = 0;
  const records = [];
  for (const row of inputs) {
    assert.deepEqual(hashesNow(), hashes, "source_drift_before_case");
    assert.equal(hashFile(row.file), row.sha256);
    const run = (name, args) => {
      write(`attempt-${row.id}-${name}.json`, {
        startedAt: new Date().toISOString(),
        imageSha256: row.sha256,
        binarySha256: hashes[name],
      });
      calls++;
      const response = rawCall(binaries[name], args, row.bytes);
      write(`raw-${row.id}-${name}.json`, response);
      return response;
    };
    const primary = decodeBaseline(run("primary", ["--base64-stdin"]), normalizeLocalVisionResult);
    const center = decodeClip(
      run("center", ["--score", compiled, prototypes]),
      "center-square-256-srgb-v1",
      (scores) => PackagingScoresSchema.safeParse(scores).success,
    );
    const fit = runFit
      ? decodeClip(
          run("fit", ["--score-fit", compiled, prototypes]),
          "aspect-fit-256-srgb-gray127-v1",
          (scores) => PackagingScoresSchema.safeParse(scores).success,
        )
      : null;
    const baseline = baselineDecision(primary.primary, center, decidePackagingScores);
    const decisions = { baseline };
    const operational = { baseline: operationalState(primary, center, fit, "baseline") };
    const algorithms =
      options.phase === "validation"
        ? ["A", "B"]
        : selection?.selectedAlgorithm
          ? [selection.selectedAlgorithm]
          : [];
    for (const algorithm of algorithms) {
      decisions[algorithm] =
        algorithm === "A"
          ? contradictionVeto(primary.primary, center, decidePackagingScores)
          : twoViewAgreement(primary.primary, center, fit, decidePackagingScores);
      operational[algorithm] = operationalState(primary, center, fit, algorithm);
    }
    const postHashes = hashesNow();
    const record = {
      id: row.id,
      expectedKind: row.expectedKind,
      split: row.split,
      contextChallenge: row.contextChallenge ?? null,
      imageSha256: row.sha256,
      primary,
      center,
      fit,
      decisions,
      operational,
      sourceHashesUnchanged: JSON.stringify(postHashes) === JSON.stringify(hashes),
      postRunHashes: postHashes,
    };
    write(`case-${row.id}.json`, record);
    records.push(record);
    assert.equal(hashFile(row.file), row.sha256, "image_drift_after_case");
    assert.equal(record.sourceHashesUnchanged, true, "source_drift_after_case");
  }
  const summary = {
    phase: options.phase,
    completedAt: new Date().toISOString(),
    hashes,
    sourceHashesUnchanged: JSON.stringify(hashesNow()) === JSON.stringify(hashes),
    calls,
    retries: 0,
    paidCalls: 0,
    labelReviewStatus: manifest.labelReviewStatus,
    operationalFailureMeaning: "required_object_decision_stages_not_entire_native_observation",
    modelStages: modelStageCounts(records),
    cases: records,
    ...(options.phase === "validation"
      ? selectValidation(records)
      : heldoutDecision(records, selection.selectedAlgorithm)),
  };
  write("summary.json", summary);
  assert.equal(summary.sourceHashesUnchanged, true);
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await evaluate(parseArguments(process.argv.slice(2)));
    console.log(
      JSON.stringify({
        phase: result.phase,
        calls: result.calls,
        selectedAlgorithm: result.selectedAlgorithm,
        integrationEligible: result.integrationEligible ?? false,
        hashesUnchanged: result.sourceHashesUnchanged,
      }),
    );
  } catch {
    console.error(
      "robustness_evaluation_failed; retain attempts/results, do not retry picture calls",
    );
    process.exitCode = 1;
  }
}
