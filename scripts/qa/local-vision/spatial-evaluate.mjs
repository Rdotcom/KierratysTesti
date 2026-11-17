// Explicit development/prospective QA. Labels never enter a model.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decodeBaseline } from "./packaging-evaluate.mjs";
import { baselineDecision, decodeClip, measure, operationalState } from "./robustness-evaluate.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = (file) => sha(fs.readFileSync(file));
const pins = Object.freeze({
  primary: "622a898cf789889d7380d27b80e9fa8837b0b01c456cb2d04a3e524b7fab9e37",
  center: "4d9694bbade83b4117a109c9430235983dd0293ffc646b42e14904e05fd93c60",
  spatial: "759883a1d78db970ce977d4890d2a4e8890d103c9b9df469acd9c2db5f4ed888",
  baseline: "fd86f9bad85d03775cfddab5edc2c79d88206f1e10ec5617defb9bb17c977ea2",
  developmentManifest: "b822665aa26031a9f64c16e99fc11b2e12e0c62614c7db7dbd21bb052850ec5f",
  prototypes: "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81",
  prompts: "aa726197e10fc1911b88bb6d6da099220339133c6e39e500f112b9077316e610",
  graph: "858f2fc75c7d7b2fd182c1a13ae099a3f66c16ba1d0ea72375a0cdf6fe97b984",
  weights: "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6",
});
const preprocessing = "four-sides-60pct-aspect-fit-256-srgb-gray127-v1";
const cropPolicy = "horizontal-vertical-overlap-20pct-v1";
const sides = ["left", "right", "bottom", "top"];
const rectangles = [
  { x: 0, y: 0, width: 0.6, height: 1 },
  { x: 0.4, y: 0, width: 0.6, height: 1 },
  { x: 0, y: 0, width: 1, height: 0.6 },
  { x: 0, y: 0.4, width: 1, height: 0.6 },
];
const keys = (value) => Object.keys(value).sort().join(",");
const exactKeys = (value, names) => keys(value) === [...names].sort().join(",");
const plain = (value) => value && typeof value === "object" && !Array.isArray(value);
const counter = (value) => Number.isInteger(value) && value >= 0 && value <= 4;
const unknown = (reason) => ({ status: "unknown", reason });

export function spatialGuard(baseline, spatial, decide, variant) {
  assert.ok(["S1", "S2"].includes(variant));
  if (baseline.status !== "estimated") return baseline;
  if (!spatial.valid || !spatial.operationalSuccess) return unknown("spatial_unavailable");
  const kinds = new Set(
    spatial.views
      .map((view) => decide(view.scores, "loose"))
      .filter((decision) => decision.status === "estimated")
      .map((decision) => decision.kind),
  );
  const veto = kinds.size > 1 && (variant === "S1" || kinds.has(baseline.kind));
  return veto ? unknown("spatial_disagreement") : baseline;
}
export function spatialOperational(baseline, baselineState, spatial) {
  if (!baselineState.valid || !baselineState.success || baseline.status !== "estimated")
    return baselineState;
  return { valid: spatial.valid, success: spatial.valid && spatial.operationalSuccess };
}
export function selectSpatialDevelopment(rows) {
  const baseline = measure(rows, "baseline");
  const results = ["S1", "S2"].map((variant) => {
    const metrics = measure(rows, variant);
    return {
      variant,
      ...metrics,
      eligible:
        metrics.correctAccepted >= 5 &&
        metrics.newlyWrong === 0 &&
        metrics.removedBaselineWrong >= 1 &&
        metrics.lostBaselineCorrect === 0 &&
        metrics.invalidRequiredOutputs === 0 &&
        metrics.introducedOperationalFailures === 0,
    };
  });
  const eligible = results
    .filter((row) => row.eligible)
    .sort(
      (a, b) =>
        b.removedBaselineWrong - a.removedBaselineWrong ||
        b.correctAccepted - a.correctAccepted ||
        b.variant.localeCompare(a.variant),
    );
  return { baseline, results, selectedVariant: eligible[0]?.variant ?? null };
}
export function confirmSpatial(rows, selectedVariant) {
  assert.ok(["S1", "S2"].includes(selectedVariant));
  const baseline = measure(rows, "baseline"),
    candidate = measure(rows, selectedVariant);
  return {
    baseline,
    candidate,
    selectedVariant,
    integrationEligible:
      candidate.correctAccepted >= 5 &&
      candidate.wrongAccepted === 0 &&
      candidate.newlyWrong === 0 &&
      candidate.lostBaselineCorrect === 0 &&
      candidate.invalidRequiredOutputs === 0 &&
      candidate.introducedOperationalFailures === 0 &&
      (baseline.wrongAccepted === 0 || candidate.removedBaselineWrong >= 1),
  };
}
export function decodeSpatial(call, validateScores) {
  const raw = call.raw;
  const processOkay = !call.failed && !call.signal && !call.errorCode;
  const countsOkay =
    plain(raw) &&
    counter(raw.predictionsAttempted) &&
    counter(raw.predictionsCompleted) &&
    raw.predictionsCompleted <= raw.predictionsAttempted;
  if (
    plain(raw) &&
    processOkay &&
    call.exitCode === 1 &&
    countsOkay &&
    exactKeys(raw, [
      "schemaVersion",
      "status",
      "reason",
      "predictionsAttempted",
      "predictionsCompleted",
    ]) &&
    raw.schemaVersion === "mobileclip-spatial-scores-v1" &&
    raw.status === "unavailable" &&
    [
      "invalid_arguments",
      "invalid_path",
      "invalid_assets",
      "invalid_model",
      "invalid_prototype",
      "invalid_image",
      "processing_failed",
    ].includes(raw.reason)
  )
    return {
      valid: true,
      operationalSuccess: false,
      failureReason: raw.reason,
      views: [],
      predictionsAttempted: raw.predictionsAttempted,
      predictionsCompleted: raw.predictionsCompleted,
    };
  const expected = [
    "schemaVersion",
    "status",
    "modelId",
    "modelRevision",
    "imageWeightSha256",
    "prototypesSha256",
    "promptPolicy",
    "promptsSha256",
    "preprocessing",
    "cropPolicy",
    "computeUnits",
    "osVersion",
    "durationMs",
    "orientedWidth",
    "orientedHeight",
    "predictionsAttempted",
    "predictionsCompleted",
    "views",
  ];
  const basic =
    plain(raw) &&
    processOkay &&
    call.exitCode === 0 &&
    exactKeys(raw, expected) &&
    raw.schemaVersion === "mobileclip-spatial-scores-v1" &&
    raw.status === "observed" &&
    raw.modelId === "apple-mobileclip-s0-coreml-2024" &&
    raw.modelRevision === "55c8098c12ba8f928e37e26b2e1dd097777c3f98" &&
    raw.imageWeightSha256 === pins.weights &&
    raw.prototypesSha256 === pins.prototypes &&
    raw.promptsSha256 === pins.prompts &&
    raw.promptPolicy === "packaging-visible-form-v1" &&
    raw.preprocessing === preprocessing &&
    raw.cropPolicy === cropPolicy &&
    raw.computeUnits === "cpuOnly" &&
    typeof raw.osVersion === "string" &&
    /^\d{1,3}(?:\.\d{1,3}){0,2}$/u.test(raw.osVersion) &&
    Number.isInteger(raw.durationMs) &&
    raw.durationMs >= 0 &&
    raw.durationMs <= 60_000 &&
    Number.isInteger(raw.orientedWidth) &&
    raw.orientedWidth > 0 &&
    raw.orientedWidth <= 4096 &&
    Number.isInteger(raw.orientedHeight) &&
    raw.orientedHeight > 0 &&
    raw.orientedHeight <= 4096 &&
    raw.orientedWidth * raw.orientedHeight <= 16_000_000 &&
    raw.predictionsAttempted === 4 &&
    raw.predictionsCompleted === 4 &&
    Array.isArray(raw.views) &&
    raw.views.length === 4;
  const rectangleOkay = (actual, wanted) =>
    plain(actual) &&
    exactKeys(actual, ["x", "y", "width", "height"]) &&
    Object.entries(wanted).every(
      ([name, value]) =>
        Number.isFinite(actual[name]) && Math.abs(actual[name] - value) < 0.000_001,
    );
  const valid = Boolean(
    basic &&
      raw.views.every((view, index) => {
        const norm = rectangles[index];
        const pixel = {
          x: norm.x * raw.orientedWidth,
          y: norm.y * raw.orientedHeight,
          width: norm.width * raw.orientedWidth,
          height: norm.height * raw.orientedHeight,
        };
        return (
          plain(view) &&
          exactKeys(view, ["side", "normalizedRect", "pixelRect", "embeddingNorm", "scores"]) &&
          view.side === sides[index] &&
          rectangleOkay(view.normalizedRect, norm) &&
          rectangleOkay(view.pixelRect, pixel) &&
          Number.isFinite(view.embeddingNorm) &&
          Math.abs(view.embeddingNorm - 1) < 0.000_01 &&
          validateScores(view.scores)
        );
      }),
  );
  return {
    valid,
    operationalSuccess: valid,
    failureReason: valid ? null : "invalid_response",
    views: valid ? raw.views : [],
    predictionsAttempted: countsOkay ? raw.predictionsAttempted : null,
    predictionsCompleted: countsOkay ? raw.predictionsCompleted : null,
  };
}
export function parseArguments(args) {
  const allowed = new Set([
    "phase",
    "spatial",
    "primary",
    "center",
    "compiled",
    "prototypes",
    "corpus",
    "manifest-sha",
    "baseline",
    "baseline-sha",
    "selection",
    "selection-sha",
    "output",
  ]);
  const values = {};
  let run = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--run") {
      assert.equal(run, false);
      run = true;
      continue;
    }
    const name = args[index].slice(2),
      value = args[++index];
    assert.ok(args[index - 1].startsWith("--") && allowed.has(name) && !(name in values));
    assert.ok(value && !value.startsWith("--") && !/^[a-z]+:/iu.test(value));
    values[name] = value;
  }
  assert.ok(run, "explicit_run_required");
  for (const name of [
    "phase",
    "spatial",
    "compiled",
    "prototypes",
    "corpus",
    "manifest-sha",
    "output",
  ])
    assert.ok(values[name], `missing_${name}`);
  assert.ok(["development", "confirmatory"].includes(values.phase));
  assert.match(values["manifest-sha"], /^[a-f0-9]{64}$/u);
  const development = values.phase === "development";
  for (const name of ["baseline", "baseline-sha"]) assert.equal(Boolean(values[name]), development);
  for (const name of ["primary", "center", "selection", "selection-sha"])
    assert.equal(Boolean(values[name]), !development);
  for (const name of ["baseline-sha", "selection-sha"])
    if (values[name]) assert.match(values[name], /^[a-f0-9]{64}$/u);
  return values;
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
function json(file, maximum = 2_000_000) {
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
function rawCall(binary, args, bytes) {
  const start = performance.now();
  const response = spawnSync(binary, args, {
    input: bytes.toString("base64"),
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 250_000,
  });
  let raw = null;
  try {
    raw = JSON.parse(response.stdout);
  } catch {
    /* invalid remains invalid */
  }
  return {
    raw,
    exitCode: response.status,
    failed: Boolean(response.error || response.signal),
    signal: response.signal,
    errorCode: response.error?.code ?? null,
    wallMs: Math.round(performance.now() - start),
    stdout: response.stdout ?? "",
    stderr: response.stderr ?? "",
  };
}
export async function evaluate(options, cwd = process.cwd()) {
  const work = fs.realpathSync(path.join(cwd, "work")),
    development = options.phase === "development";
  const binaryNames = development ? ["spatial"] : ["primary", "center", "spatial"];
  const binaries = Object.fromEntries(
    binaryNames.map((name) => {
      const file = workPath(work, options[name]);
      fs.accessSync(file, fs.constants.X_OK);
      assert.ok(fs.statSync(file).size < 50_000_000);
      assert.equal(hashFile(file), pins[name], `unreviewed_${name}_binary`);
      return [name, file];
    }),
  );
  const compiled = workPath(work, options.compiled, true),
    prototypes = workPath(work, options.prototypes);
  assert.equal(hashFile(prototypes), pins.prototypes);
  assert.equal(hashFile(path.join(compiled, "model.mil")), pins.graph);
  assert.equal(hashFile(path.join(compiled, "weights/weight.bin")), pins.weights);
  const corpus = workPath(work, options.corpus, true),
    manifestPath = workPath(work, path.join(corpus, "fixtures.json"));
  assert.equal(hashFile(manifestPath), options["manifest-sha"]);
  if (development) assert.equal(options["manifest-sha"], pins.developmentManifest);
  const validatorName = development ? "robustness-corpus.mjs" : "spatial-data-corpus.mjs";
  const validatorPath = path.join(cwd, "scripts/qa/local-vision", validatorName);
  const { validateManifest } = await import(pathToFileURL(validatorPath).href);
  const manifest = validateManifest(json(manifestPath));
  const requireMobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  const gatePath = requireMobile.resolve("@kierratysappi/contracts/packaging-classifier"),
    normalizerPath = requireMobile.resolve("@kierratysappi/contracts/local-vision");
  const { PackagingScoresSchema, decidePackagingScores, packagingGatePolicies } = await import(
    pathToFileURL(gatePath).href
  );
  const { normalizeLocalVisionResult } = await import(pathToFileURL(normalizerPath).href);
  assert.deepEqual(packagingGatePolicies.loose, { minimumCosine: 0.2, minimumLead: 0.02 });
  const commonPaths = {
    spatial: binaries.spatial,
    prototypes,
    gate: gatePath,
    normalizer: normalizerPath,
    spatialSource: path.join(cwd, "scripts/qa/local-vision/spatial-main.swift"),
    evaluator: path.join(cwd, "scripts/qa/local-vision/spatial-evaluate.mjs"),
    baselineDecoder: path.join(cwd, "scripts/qa/local-vision/packaging-evaluate.mjs"),
    baselineAlgorithms: path.join(cwd, "scripts/qa/local-vision/robustness-evaluate.mjs"),
    prompts: path.join(cwd, "scripts/qa/local-vision/mobileclip-prompts.json"),
    protocol: path.join(cwd, "scripts/qa/protocols/local-vision-spatial-protocol.md"),
    modelAssets: path.join(cwd, "scripts/qa/local-vision/mobileclip-assets.json"),
  };
  const dataPrefix = development ? "robustness" : "spatial-data";
  const phasePaths = {
    manifest: manifestPath,
    validator: validatorPath,
    ...Object.fromEntries(
      ["cases", "review", "prior", "manifest"].map((name) => [
        `reference${name}`,
        path.join(cwd, `scripts/qa/local-vision/${dataPrefix}-${name}.json`),
      ]),
    ),
    imageHelpers: path.join(cwd, "scripts/qa/local-vision/independent-corpus.mjs"),
  };
  if (development)
    phasePaths.supplementSpecification = path.join(
      cwd,
      "scripts/qa/local-vision/robustness-supplement-cases.json",
    );
  else {
    phasePaths.primary = binaries.primary;
    phasePaths.center = binaries.center;
  }
  const hashesFor = (paths) =>
    Object.fromEntries(Object.entries(paths).map(([name, file]) => [name, hashFile(file)]));
  const commonNow = () => ({ ...hashesFor(commonPaths), compiled: directoryHash(compiled) });
  const phaseNow = () => hashesFor(phasePaths);
  let previous, selection;
  if (development) {
    const baselinePath = workPath(work, options.baseline);
    assert.equal(options["baseline-sha"], pins.baseline);
    assert.equal(hashFile(baselinePath), pins.baseline);
    previous = json(baselinePath);
    assert.equal(previous.phase, "validation");
    assert.equal(previous.calls, 48);
    assert.equal(previous.cases.length, 16);
    assert.equal(previous.sourceHashesUnchanged, true);
    assert.equal(previous.hashes.manifest, pins.developmentManifest);
    assert.equal(previous.hashes.gate, hashFile(gatePath));
    assert.equal(previous.hashes.normalizer, hashFile(normalizerPath));
    phasePaths.baseline = baselinePath;
  } else {
    const selectionFile = workPath(work, options.selection);
    assert.equal(hashFile(selectionFile), options["selection-sha"]);
    selection = json(selectionFile);
    assert.equal(selection.phase, "development");
    assert.equal(selection.sourceHashesUnchanged, true);
    assert.ok(["S1", "S2"].includes(selection.selectedVariant));
    assert.equal(selection.baselineReceiptSha256, pins.baseline);
    assert.equal(selection.processExecutions, 16);
    assert.equal(selection.cases.length, 16);
    const check = selectSpatialDevelopment(selection.cases);
    for (const name of ["baseline", "results", "selectedVariant"])
      assert.deepEqual(selection[name], check[name], "selection_decision_changed");
    assert.deepEqual(selection.hashes, commonNow(), "development_algorithm_source_drift");
    const started = json(workPath(work, path.join(path.dirname(selectionFile), "started.json")));
    assert.equal(started.phase, "development");
    assert.deepEqual(started.hashes, selection.hashes);
    assert.ok(
      Number.isFinite(Date.parse(started.startedAt)) &&
        Number.isFinite(Date.parse(selection.completedAt)),
    );
    assert.ok(
      Date.parse(started.startedAt) <= Date.parse(selection.completedAt) &&
        Date.parse(selection.completedAt) <= Date.now(),
    );
    phasePaths.selection = selectionFile;
  }
  const hashes = commonNow(),
    phaseHashes = phaseNow();
  assert.equal(hashes.prompts, pins.prompts);
  const fixtures = manifest.fixtures.filter(
    (row) => row.split === (development ? "validation" : "confirmatory"),
  );
  assert.equal(fixtures.length, development ? 16 : 20);
  assert.equal(fixtures.filter((row) => row.expectedKind !== "unknown").length, 10);
  const inputs = fixtures.map((row) => {
    assert.match(row.id, /^[a-z][a-z0-9-]+$/u);
    const file = workPath(work, path.join(corpus, `${row.id}.jpg`)),
      bytes = fs.readFileSync(file);
    assert.ok(bytes.length <= 1_500_000 && bytes.length === row.bytes && sha(bytes) === row.sha256);
    const captured = development ? previous.cases.find((item) => item.id === row.id) : undefined;
    if (development) {
      assert.ok(captured);
      assert.equal(captured.expectedKind, row.expectedKind);
      assert.equal(captured.imageSha256, row.sha256);
    }
    return { ...row, file, bytes, captured };
  });
  const output = path.resolve(options.output);
  workPath(work, path.dirname(output), true);
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output);
  const write = (name, data) =>
    fs.writeFileSync(path.join(output, name), `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
  write("started.json", {
    startedAt: new Date().toISOString(),
    phase: options.phase,
    hashes,
    phaseHashes,
    baselineReceiptSha256: development ? pins.baseline : null,
    selectionSha256: selection ? options["selection-sha"] : null,
    selectedVariant: selection?.selectedVariant ?? null,
    cases: inputs.map(({ bytes: _bytes, file: _file, captured: _captured, ...row }) => row),
    processExecutionsPlanned: development
      ? 16
      : "40 plus one spatial process per accepted baseline",
    spatialPredictionsPerProcess: 4,
    paidCalls: 0,
  });
  const records = [];
  let processExecutions = 0,
    spatialExecutions = 0,
    knownAttempted = 0,
    knownCompleted = 0,
    countersUnavailable = 0;
  for (const row of inputs) {
    assert.deepEqual(commonNow(), hashes, "algorithm_source_drift_before_case");
    assert.deepEqual(phaseNow(), phaseHashes, "reference_source_drift_before_case");
    assert.equal(hashFile(row.file), row.sha256);
    const run = (name, args) => {
      write(`attempt-${row.id}-${name}.json`, {
        startedAt: new Date().toISOString(),
        imageSha256: row.sha256,
        binarySha256: hashFile(binaries[name]),
      });
      processExecutions++;
      const call = rawCall(binaries[name], args, row.bytes);
      write(`raw-${row.id}-${name}.json`, call);
      return call;
    };
    const primary = development
      ? row.captured.primary
      : decodeBaseline(run("primary", ["--base64-stdin"]), normalizeLocalVisionResult);
    const center = development
      ? row.captured.center
      : decodeClip(
          run("center", ["--score", compiled, prototypes]),
          "center-square-256-srgb-v1",
          (scores) => PackagingScoresSchema.safeParse(scores).success,
        );
    const baseline = baselineDecision(primary.primary, center, decidePackagingScores),
      baselineState = operationalState(primary, center, null, "baseline");
    if (development) {
      assert.deepEqual(baseline, row.captured.decisions.baseline);
      assert.deepEqual(baselineState, row.captured.operational.baseline);
    }
    const shouldRun = development || baseline.status === "estimated";
    const spatial = shouldRun
      ? decodeSpatial(
          run("spatial", ["--score-spatial", compiled, prototypes]),
          (scores) => PackagingScoresSchema.safeParse(scores).success,
        )
      : {
          valid: true,
          operationalSuccess: true,
          status: "skipped",
          reason: "baseline_unknown",
          views: [],
          predictionsAttempted: 0,
          predictionsCompleted: 0,
        };
    if (shouldRun) spatialExecutions++;
    if (spatial.predictionsAttempted === null || spatial.predictionsCompleted === null)
      countersUnavailable++;
    else {
      knownAttempted += spatial.predictionsAttempted;
      knownCompleted += spatial.predictionsCompleted;
    }
    const decisions = { baseline },
      operational = { baseline: baselineState };
    for (const variant of development ? ["S1", "S2"] : [selection.selectedVariant]) {
      decisions[variant] = spatialGuard(baseline, spatial, decidePackagingScores, variant);
      operational[variant] = spatialOperational(baseline, baselineState, spatial);
    }
    const record = {
      id: row.id,
      expectedKind: row.expectedKind,
      challenge: row.challenge ?? null,
      split: row.split,
      imageSha256: row.sha256,
      primary,
      center,
      spatial,
      decisions,
      operational,
      sourceHashesUnchanged:
        JSON.stringify(commonNow()) === JSON.stringify(hashes) &&
        JSON.stringify(phaseNow()) === JSON.stringify(phaseHashes),
    };
    write(`case-${row.id}.json`, record);
    records.push(record);
    assert.equal(hashFile(row.file), row.sha256, "image_drift_after_case");
    assert.equal(record.sourceHashesUnchanged, true);
  }
  const summary = {
    phase: options.phase,
    completedAt: new Date().toISOString(),
    hashes,
    phaseHashes,
    sourceHashesUnchanged:
      JSON.stringify(commonNow()) === JSON.stringify(hashes) &&
      JSON.stringify(phaseNow()) === JSON.stringify(phaseHashes),
    baselineReceiptSha256: development ? pins.baseline : null,
    labelReviewStatus: manifest.labelReviewStatus,
    processExecutions,
    spatialExecutions,
    spatialPredictionsAttemptedKnown: knownAttempted,
    spatialPredictionsCompletedKnown: knownCompleted,
    spatialPredictionCountersUnavailable: countersUnavailable,
    retries: 0,
    paidCalls: 0,
    operationalFailureMeaning:
      "required_object_decision_stages_not_entire_primary_or_ocr_observation",
    cases: records,
    ...(development
      ? selectSpatialDevelopment(records)
      : confirmSpatial(records, selection.selectedVariant)),
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
        processExecutions: result.processExecutions,
        spatialExecutions: result.spatialExecutions,
        selectedVariant: result.selectedVariant,
        integrationEligible: result.integrationEligible ?? false,
        hashesUnchanged: result.sourceHashesUnchanged,
      }),
    );
  } catch {
    console.error("spatial_evaluation_failed; retain every attempt/result, no image retry");
    process.exitCode = 1;
  }
}
