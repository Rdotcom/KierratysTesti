// Offline learned-head experiment. No image inference, networking or app mutation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadLinearDataset, splitLinearDataset } from "./linear-data.mjs";
import {
  linearHeadClasses,
  linearHeadFeatureCount,
  linearHeadMargin,
  linearHeadMaxStandardizedMagnitude,
  predictLinearHead,
  trainLinearHead,
  validateLinearHead,
} from "./linear-head.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const known = linearHeadClasses.slice(0, 5);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const objectHash = (value) => sha(JSON.stringify(value));
const hashPattern = /^[a-f0-9]{64}$/u;
const specPath = "scripts/qa/local-vision/linear-learning-spec.json";
const protocolPath = "scripts/qa/protocols/local-vision-linear-protocol.md";

function read(file, maximum = 2_000_000) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const info = fs.fstatSync(fd);
    assert.ok(
      info.isFile() && info.nlink === 1 && info.size > 0 && info.size <= maximum,
      "file_bound",
    );
    const bytes = Buffer.alloc(maximum + 1);
    let count = 0;
    while (count < bytes.length) {
      const size = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (size === 0) break;
      count += size;
      assert.ok(count <= maximum, "growing_file");
    }
    assert.equal(count, info.size, "file_changed");
    return bytes.subarray(0, count);
  } finally {
    fs.closeSync(fd);
  }
}
function workFile(input, cwd) {
  assert.ok(typeof input === "string" && input.length <= 4096 && !/[\p{Cc}\p{Cf}]/u.test(input));
  const root = fs.realpathSync(path.join(cwd, "work")),
    file = path.resolve(cwd, input);
  assert.ok(file.startsWith(`${root}${path.sep}`), "outside_work");
  assert.equal(fs.realpathSync(file), file, "linked_input");
  return file;
}
export function checkedOutput(input, cwd = project) {
  assert.ok(
    typeof input === "string" &&
      input.length > 0 &&
      input.length <= 4096 &&
      !/[\p{Cc}\p{Cf}]/u.test(input),
  );
  const root = fs.realpathSync(path.join(cwd, "work")),
    output = path.resolve(cwd, input);
  const parent = fs.realpathSync(path.dirname(output));
  assert.ok(parent === root || parent.startsWith(`${root}${path.sep}`), "outside_work");
  assert.equal(parent, path.dirname(output), "linked_parent");
  assert.equal(fs.lstatSync(output, { throwIfNoEntry: false }), undefined, "output_exists");
  return output;
}
const write = (file, value) =>
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });

export function validateLearningSpec(spec) {
  assert.deepEqual(
    Object.keys(spec).sort(),
    [
      "schemaVersion",
      "experimentId",
      "referenceStatus",
      "features",
      "split",
      "head",
      "decision",
      "validationGate",
      "execution",
    ].sort(),
  );
  assert.equal(spec.schemaVersion, "linear-learning-spec-v1");
  assert.equal(spec.experimentId, "kig-linear-v1");
  assert.equal(spec.referenceStatus, "seen_ai_reviewed_human_review_required");
  assert.deepEqual(spec.features, {
    kind: "captured_center_cosines",
    count: linearHeadFeatureCount,
    modelId: "apple-mobileclip-s0-coreml-2024",
    revision: "55c8098c12ba8f928e37e26b2e1dd097777c3f98",
    imageWeightsSha256: "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6",
    prototypesSha256: "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81",
    promptsSha256: "aa726197e10fc1911b88bb6d6da099220339133c6e39e500f112b9077316e610",
    preprocessing: "center-square-256-srgb-v1",
    computeUnits: "cpuOnly",
  });
  assert.deepEqual(spec.head, {
    classes: linearHeadClasses,
    normalization: "unweighted_train_population_mean_sd",
    nearZeroSd: 1e-12,
    nearZeroReplacementScale: 1,
    objective: "sum_of_six_class_mean_squared_errors_plus_l2",
    classRowWeight: "1/class_count",
    l2: 1,
    regularizeIntercept: false,
    solver: "deterministic_cholesky_joint_intercept",
    maximumStandardizedMagnitude: linearHeadMaxStandardizedMagnitude,
    minimumRawMargin: linearHeadMargin,
    scoreMeaning: "regularized_linear_score_not_probability",
    maximumObjective: 5,
    maximumSlopeSquaredNorm: 5,
    maximumNormalEquationResidual: 1e-8,
    numericalTolerance: 1e-8,
  });
  assert.deepEqual(spec.head.classes, linearHeadClasses);
  assert.equal(spec.head.l2, 1);
  assert.equal(spec.head.minimumRawMargin, linearHeadMargin);
  assert.equal(spec.head.maximumStandardizedMagnitude, linearHeadMaxStandardizedMagnitude);
  assert.equal(spec.head.normalization, "unweighted_train_population_mean_sd");
  assert.equal(spec.head.nearZeroSd, 1e-12);
  assert.equal(spec.head.nearZeroReplacementScale, 1);
  assert.equal(spec.head.classRowWeight, "1/class_count");
  assert.equal(spec.head.objective, "sum_of_six_class_mean_squared_errors_plus_l2");
  assert.equal(spec.head.regularizeIntercept, false);
  assert.equal(spec.decision.mode, "veto_only_same_as_accepted_baseline");
  assert.equal(spec.decision.preserveUnknownConflictError, true);
  assert.equal(spec.decision.materialIdentitySafetySortingInference, false);
  assert.deepEqual(spec.validationGate, {
    zeroWrongAcceptances: true,
    zeroBaselineCorrectLosses: true,
    zeroIntroducedRequiredFailures: true,
    zeroIntroducedInvalidOutputs: true,
    minimumBaselineErrorsRemoved: 1,
    minimumCorrectPositives: 8,
    minimumCorrectPerKnownKind: 1,
  });
  assert.deepEqual(spec.execution, {
    maximumFits: 1,
    maximumHeadPredictions: 72,
    trainingSanityRowEvaluations: 45,
    newImageModelCalls: 0,
    paidApiCalls: 0,
    hyperparameterOrSplitSearch: false,
    appIntegrationAllowed: false,
  });
  assert.deepEqual(spec.split, {
    policy: "connected-family-stratified-hash-subset-v1",
    rankDomain: "kig-linear-split-v1",
    trainPerKnownKind: 5,
    validationPerKnownKind: 3,
    trainMixedSupported: 8,
    validationMixedSupported: 4,
    trainOtherUnknown: 12,
    validationOtherUnknown: 8,
    totalTrain: 45,
    totalValidation: 27,
  });
  return spec;
}

function sourceSnapshot(cwd) {
  const files = {};
  function visit(relative) {
    const file = path.join(cwd, relative),
      info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink(), "linked_source");
    if (info.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    } else if (/\.(?:mjs|swift|json|md|ts)$/u.test(file)) {
      files[relative] = sha(read(file));
    }
  }
  for (const tree of ["scripts/qa/local-vision", "shared/domain/src", "shared/contracts/src"])
    visit(tree);
  for (const file of [
    protocolPath,
    "pnpm-lock.yaml",
    "shared/domain/package.json",
    "shared/contracts/package.json",
    "mobile/app/package.json",
    "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json",
  ])
    files[file] = sha(read(path.join(cwd, file)));
  return {
    files,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    sourceHash: objectHash(files),
  };
}
function allocationIds(split) {
  return { train: split.train.map((r) => r.id), validation: split.validation.map((r) => r.id) };
}
export function validateFrozenState(lock, snapshot, dataHash, allocation) {
  assert.equal(lock.schemaVersion, "linear-learning-lock-v1");
  assert.equal(lock.experimentId, "kig-linear-v1");
  assert.equal(lock.referenceStatus, "seen_ai_reviewed_human_review_required");
  assert.equal(lock.fitsBeforeLock, 0);
  assert.equal(lock.headPredictionsBeforeLock, 0);
  assert.deepEqual(lock.snapshot, snapshot, "source_or_runtime_drift");
  assert.equal(lock.dataHash, dataHash, "data_drift");
  assert.deepEqual(lock.allocation, allocation, "allocation_drift");
  assert.equal(allocation.train.length, 45);
  assert.equal(allocation.validation.length, 27);
  assert.equal(new Set([...allocation.train, ...allocation.validation]).size, 72);
}
export function assertExperimentUnclaimed(cwd = project) {
  const work = fs.realpathSync(path.join(cwd, "work"));
  assert.equal(work, path.join(cwd, "work"), "linked_work");
  const ledger = path.join(work, "linear-learning-attempts");
  const present = fs.lstatSync(ledger, { throwIfNoEntry: false });
  if (present)
    assert.ok(
      present.isDirectory() && !present.isSymbolicLink() && fs.realpathSync(ledger) === ledger,
      "linked_ledger",
    );
  assert.equal(
    fs.lstatSync(path.join(ledger, "kig-linear-v1.json"), { throwIfNoEntry: false }),
    undefined,
    "experiment_already_claimed",
  );
  return ledger;
}
export function claimFrozenFit(lockFile, lockSha256, output, cwd = project) {
  assert.match(lockSha256, hashPattern);
  const ledger = assertExperimentUnclaimed(cwd);
  if (!fs.existsSync(ledger)) fs.mkdirSync(ledger, { mode: 0o700 });
  const marker = {
    lockSha256,
    output,
    maximumFits: 1,
    claimedAt: new Date().toISOString(),
  };
  // Fixed experiment identity, independent of lock copies, timestamps or output.
  write(path.join(ledger, "kig-linear-v1.json"), marker);
  write(path.join(path.dirname(lockFile), "fit-attempt.json"), marker);
}
export function checkLinearFit(model, rows) {
  const checked = validateLinearHead(model),
    counts = checked.trainingClassCounts;
  const canonical = rows
    .map((r) => ({ id: r.id, label: r.label, scores: r.features }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  assert.equal(checked.trainingRows, canonical.length);
  assert.equal(checked.trainingHash, objectHash(canonical), "training_membership_drift");
  assert.deepEqual(
    counts,
    linearHeadClasses.map((k) => canonical.filter((r) => r.label === k).length),
  );
  for (let i = 0; i < 18; i++) {
    const mean = canonical.reduce((sum, r) => sum + r.scores[i], 0) / canonical.length;
    const sd = Math.sqrt(
      canonical.reduce((sum, r) => sum + (r.scores[i] - mean) ** 2, 0) / canonical.length,
    );
    assert.ok(Math.abs(checked.means[i] - mean) <= 1e-12, "training_mean_drift");
    assert.ok(
      Math.abs(checked.scales[i] - (sd <= 1e-12 ? 1 : sd)) <= 1e-12,
      "training_scale_drift",
    );
  }
  const gradients = linearHeadClasses.map(() => Array(19).fill(0));
  let residualLoss = 0,
    slopeSquaredNorm = 0;
  for (const row of rows) {
    const x = [
      1,
      ...row.features.map((value, i) => (value - checked.means[i]) / checked.scales[i]),
    ];
    const label = linearHeadClasses.indexOf(row.label);
    assert.ok(label >= 0);
    const weight = 1 / counts[label];
    for (let k = 0; k < 6; k++) {
      const y = checked.coefficients[k].reduce((sum, value, j) => sum + value * x[j], 0);
      const residual = y - (label === k ? 1 : 0);
      residualLoss += weight * residual * residual;
      for (let j = 0; j < 19; j++) gradients[k][j] += weight * residual * x[j];
    }
  }
  for (let k = 0; k < 6; k++)
    for (let j = 1; j < 19; j++) {
      slopeSquaredNorm += checked.coefficients[k][j] ** 2;
      gradients[k][j] += checked.coefficients[k][j];
    }
  const objective = residualLoss + slopeSquaredNorm;
  const maximumNormalEquationResidual = Math.max(...gradients.flat().map(Math.abs));
  assert.ok([objective, slopeSquaredNorm, maximumNormalEquationResidual].every(Number.isFinite));
  assert.ok(objective <= 5 + 1e-8 && slopeSquaredNorm <= 5 + 1e-8, "fit_objective_bound");
  assert.ok(maximumNormalEquationResidual <= 1e-8, "fit_residual_bound");
  return {
    rowsEvaluated: rows.length,
    objective,
    residualLoss,
    slopeSquaredNorm,
    maximumNormalEquationResidual,
    numericalTolerance: 1e-8,
  };
}
export async function freezeLinearExperiment(outputInput, cwd = project) {
  assertExperimentUnclaimed(cwd);
  const output = checkedOutput(outputInput, cwd);
  const spec = validateLearningSpec(JSON.parse(read(path.join(cwd, specPath))));
  const snapshot = sourceSnapshot(cwd),
    data = await loadLinearDataset(cwd);
  const split = splitLinearDataset(data.rows);
  const lock = {
    schemaVersion: "linear-learning-lock-v1",
    experimentId: spec.experimentId,
    referenceStatus: spec.referenceStatus,
    fitsBeforeLock: 0,
    headPredictionsBeforeLock: 0,
    snapshot,
    dataHash: objectHash(data),
    allocation: allocationIds(split),
    allocationEvidence: split.allocation,
    dataProof: data.proof,
    specHash: sha(read(path.join(cwd, specPath))),
    protocolHash: sha(read(path.join(cwd, protocolPath))),
    completedAt: new Date().toISOString(),
  };
  assert.deepEqual(sourceSnapshot(cwd), snapshot, "source_drift_during_freeze");
  validateFrozenState(lock, snapshot, objectHash(data), allocationIds(split));
  fs.mkdirSync(output, { mode: 0o700 });
  write(path.join(output, "lock.json"), lock);
  return {
    directory: path.relative(cwd, output),
    lockSha256: sha(read(path.join(output, "lock.json"))),
    train: 45,
    validation: 27,
    realFits: 0,
    headPredictions: 0,
    newImageModelCalls: 0,
    paidApiCalls: 0,
  };
}

function validHead(result) {
  assert.equal(result.scoreMeaning, "regularized_linear_score_not_probability");
  if (result.reason === "out_of_training_range") {
    assert.equal(result.status, "unknown");
    assert.equal(result.rawScores, null);
    assert.equal(result.margin, null);
    return;
  }
  assert.ok(Array.isArray(result.rawScores) && result.rawScores.length === 6);
  for (let i = 0; i < 6; i++) {
    assert.equal(result.rawScores[i].label, linearHeadClasses[i]);
    assert.ok(Number.isFinite(result.rawScores[i].score));
  }
  const ranked = [...result.rawScores].sort((a, b) => b.score - a.score);
  assert.equal(result.margin, ranked[0].score - ranked[1].score);
  if (result.status === "estimated") {
    assert.ok(
      known.includes(result.kind) &&
        result.kind === ranked[0].label &&
        result.margin >= linearHeadMargin,
    );
  } else {
    assert.equal(result.status, "unknown");
    assert.ok(
      (result.reason === "tied_scores" && result.margin === 0) ||
        (result.reason === "outside_kind" && ranked[0].label === "unknown") ||
        (result.reason === "weak_margin" && result.margin > 0 && result.margin < linearHeadMargin),
    );
  }
}
export function applyLinearVeto(baseline, operational, head) {
  let headValid = true;
  try {
    validHead(head);
  } catch {
    headValid = false;
  }
  if (baseline.status !== "estimated")
    return { decision: baseline, operational, headRequired: false, headValid };
  if (!headValid)
    return {
      decision: { status: "unknown", reason: "head_unavailable" },
      operational: { valid: false, success: false },
      headRequired: true,
      headValid,
    };
  const decision =
    head.status === "estimated" && head.kind === baseline.kind
      ? { ...baseline, method: "baseline_and_linear_head" }
      : { status: "unknown", reason: "linear_head_veto" };
  return { decision, operational, headRequired: true, headValid };
}
export function measureLinearResults(rows, mode) {
  assert.ok(["baseline", "candidate"].includes(mode));
  const out = {
    total: rows.length,
    positives: 0,
    controls: 0,
    correctAccepted: 0,
    wrongAccepted: 0,
    positiveUnknown: 0,
    safeAbstention: 0,
    lostBaselineCorrect: 0,
    removedBaselineWrong: 0,
    newlyWrong: 0,
    operationalFailures: 0,
    invalidRequiredOutputs: 0,
    introducedOperationalFailures: 0,
    introducedInvalidOutputs: 0,
    perKind: Object.fromEntries(known.map((k) => [k, { positives: 0, correctAccepted: 0 }])),
  };
  for (const row of rows) {
    const decision = row[mode],
      op = row[`${mode}Operational`],
      positive = row.label !== "unknown";
    const accepted = decision.status === "estimated",
      correct = accepted && decision.kind === row.label;
    const baseCorrect = row.baseline.status === "estimated" && row.baseline.kind === row.label;
    const baseWrong = row.baseline.status === "estimated" && row.baseline.kind !== row.label;
    if (positive) {
      out.positives++;
      out.perKind[row.label].positives++;
    } else out.controls++;
    if (correct) {
      out.correctAccepted++;
      out.perKind[row.label].correctAccepted++;
    }
    if (accepted && !correct) out.wrongAccepted++;
    if (positive && !accepted) out.positiveUnknown++;
    if (!positive && !accepted && op.valid && op.success) out.safeAbstention++;
    if (!op.success) out.operationalFailures++;
    if (!op.valid) out.invalidRequiredOutputs++;
    if (baseCorrect && !correct) out.lostBaselineCorrect++;
    if (baseWrong && !accepted && row.baselineOperational.success && op.valid && op.success)
      out.removedBaselineWrong++;
    if (!baseWrong && accepted && !correct) out.newlyWrong++;
    if (row.baselineOperational.success && !op.success) out.introducedOperationalFailures++;
    if (row.baselineOperational.valid && !op.valid) out.introducedInvalidOutputs++;
  }
  return out;
}
export function linearValidationGate(baseline, candidate) {
  return (
    baseline.total === 27 &&
    candidate.total === 27 &&
    candidate.positives === 15 &&
    candidate.controls === 12 &&
    candidate.wrongAccepted === 0 &&
    candidate.lostBaselineCorrect === 0 &&
    candidate.newlyWrong === 0 &&
    candidate.introducedOperationalFailures === 0 &&
    candidate.introducedInvalidOutputs === 0 &&
    candidate.removedBaselineWrong >= 1 &&
    candidate.correctAccepted >= 8 &&
    known.every(
      (k) => candidate.perKind[k].positives === 3 && candidate.perKind[k].correctAccepted >= 1,
    )
  );
}
export async function runLinearExperiment(options, cwd = project) {
  assert.match(options.lockSha256, hashPattern);
  const lockFile = workFile(options.lock, cwd),
    lockBytes = read(lockFile);
  assert.equal(sha(lockBytes), options.lockSha256, "lock_drift");
  const lock = JSON.parse(lockBytes),
    snapshot = sourceSnapshot(cwd);
  validateLearningSpec(JSON.parse(read(path.join(cwd, specPath))));
  const data = await loadLinearDataset(cwd),
    split = splitLinearDataset(data.rows);
  validateFrozenState(lock, snapshot, objectHash(data), allocationIds(split));
  const output = checkedOutput(options.output, cwd);
  claimFrozenFit(lockFile, options.lockSha256, path.relative(cwd, output), cwd);
  fs.mkdirSync(output, { mode: 0o700 });
  const counters = {
    fitsAttempted: 0,
    fitsCompleted: 0,
    fitSanityRowsEvaluated: 0,
    headPredictionsAttempted: 0,
    headPredictionsCompleted: 0,
    newImageModelCalls: 0,
    paidApiCalls: 0,
    retries: 0,
  };
  write(path.join(output, "attempt.json"), {
    experimentId: lock.experimentId,
    lockSha256: options.lockSha256,
    sourceHash: snapshot.sourceHash,
    dataHash: lock.dataHash,
    maximumFits: 1,
    maximumHeadPredictions: 72,
  });
  try {
    counters.fitsAttempted++;
    const model = trainLinearHead(
      split.train.map((r) => ({ id: r.id, label: r.label, scores: r.features })),
    );
    counters.fitsCompleted++;
    write(path.join(output, "model.json"), model);
    const persisted = validateLinearHead(JSON.parse(read(path.join(output, "model.json"))));
    counters.fitSanityRowsEvaluated = null;
    const fitSanity = checkLinearFit(persisted, split.train);
    counters.fitSanityRowsEvaluated = fitSanity.rowsEvaluated;
    write(path.join(output, "fit-sanity.json"), fitSanity);
    const trainIds = new Set(split.train.map((r) => r.id)),
      cases = [];
    for (const row of data.rows) {
      counters.headPredictionsAttempted++;
      let head;
      try {
        head = predictLinearHead(persisted, row.features);
        counters.headPredictionsCompleted++;
      } catch {
        head = { status: "unavailable", reason: "head_failed" };
      }
      const candidate = applyLinearVeto(row.baseline, row.operational, head);
      cases.push({
        id: row.id,
        label: row.label,
        split: trainIds.has(row.id) ? "train" : "validation",
        sourceProof: row.sourceProof,
        baseline: row.baseline,
        baselineOperational: row.operational,
        head,
        headRequired: candidate.headRequired,
        headValid: candidate.headValid,
        candidate: candidate.decision,
        candidateOperational: candidate.operational,
      });
    }
    assert.equal(cases.length, 72);
    assert.deepEqual(sourceSnapshot(cwd), snapshot, "source_drift_after_fit");
    const finalData = await loadLinearDataset(cwd);
    assert.equal(objectHash(finalData), lock.dataHash, "data_drift_after_fit");
    const measures = {};
    for (const phase of ["train", "validation", "combined"]) {
      const rows = phase === "combined" ? cases : cases.filter((r) => r.split === phase);
      measures[phase] = {
        baseline: measureLinearResults(rows, "baseline"),
        candidate: measureLinearResults(rows, "candidate"),
      };
    }
    const summary = {
      schemaVersion: "linear-learning-result-v1",
      experimentId: lock.experimentId,
      referenceStatus: lock.referenceStatus,
      independentAccuracyEvidence: false,
      developmentQualifies: linearValidationGate(
        measures.validation.baseline,
        measures.validation.candidate,
      ),
      appIntegrationAllowed: false,
      knownWrongRemain: measures.combined.candidate.wrongAccepted > 0,
      lockSha256: options.lockSha256,
      modelSha256: sha(read(path.join(output, "model.json"))),
      sourceHash: snapshot.sourceHash,
      sourceHashesUnchanged: true,
      dataHash: lock.dataHash,
      allocation: lock.allocation,
      counters,
      fitSanity,
      measures,
      cases,
      completedAt: new Date().toISOString(),
    };
    write(path.join(output, "summary.json"), summary);
    return {
      directory: path.relative(cwd, output),
      developmentQualifies: summary.developmentQualifies,
      appIntegrationAllowed: false,
      counters,
      measures,
    };
  } catch {
    write(path.join(output, "failure.json"), {
      status: "failed",
      reason: "experiment_failed_preserve_partial_output",
      counters,
      appIntegrationAllowed: false,
    });
    throw new Error("experiment_failed_preserve_partial_output");
  }
}
export function parseLinearArguments(args) {
  const mode = args[0],
    values = {};
  assert.ok(["--freeze", "--run"].includes(mode), "explicit_mode_required");
  for (let i = 1; i < args.length; i++) {
    const key = args[i],
      value = args[++i];
    assert.ok(["--output", "--lock", "--lock-sha"].includes(key) && !(key in values));
    assert.ok(value && !value.startsWith("--") && !/^[a-z]+:/iu.test(value));
    values[key] = value;
  }
  assert.ok(values["--output"]);
  if (mode === "--freeze") assert.equal(Object.keys(values).length, 1);
  else {
    assert.equal(Object.keys(values).length, 3);
    assert.match(values["--lock-sha"] ?? "", hashPattern);
  }
  return {
    mode,
    output: values["--output"],
    lock: values["--lock"],
    lockSha256: values["--lock-sha"],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseLinearArguments(process.argv.slice(2));
    console.log(
      JSON.stringify(
        options.mode === "--freeze"
          ? await freezeLinearExperiment(options.output)
          : await runLinearExperiment(options),
      ),
    );
  } catch {
    console.error("linear_experiment_failed; preserve all existing artifacts, do not retry a fit");
    process.exitCode = 1;
  }
}
