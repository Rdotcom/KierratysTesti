// Explicit seen-development/fresh-confirmation only; JPEG bytes alone reach models.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { baselineDecision, decodeClip, operationalState } from "./robustness-evaluate.mjs";
import {
  foregroundDecision,
  requiredForeground,
  foregroundState,
  decodeForeground,
  selectForeground,
  confirmForeground,
} from "./foreground-policy.mjs";

const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const pins = {
  foreground: "2ca83c26336721780ccc0d5ef847cb34c9d59561b2fb60e07db2c9a504e74006",
  primary: "1f5cf9e709e885c2512a0c70d4798f4a3f3dabc2d85340a37c7bc54d4b1a55b3",
  center: "4d9694bbade83b4117a109c9430235983dd0293ffc646b42e14904e05fd93c60",
  prototypes: "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81",
  graph: "858f2fc75c7d7b2fd182c1a13ae099a3f66c16ba1d0ea72375a0cdf6fe97b984",
  weights: "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6",
};
const devRoot = "work/local-reliability-2026-11-07.kbWGyb";
const development = [
  {
    tag: "validation",
    receipt: `${devRoot}/validation/summary.json`,
    sha256: "fd86f9bad85d03775cfddab5edc2c79d88206f1e10ec5617defb9bb17c977ea2",
    corpus: "work/robustness-corpus-2026-11-07.93wuSo/final-reviewed",
    phase: "validation",
    count: 16,
  },
  {
    tag: "old-heldout-now-seen",
    receipt: `${devRoot}/heldout/summary.json`,
    sha256: "9080c48969e3dce0713f17bcab6504ff5fa071a93d08024307779af3911cba89",
    corpus: "work/robustness-corpus-2026-11-07.93wuSo/final-reviewed",
    phase: "heldout",
    count: 16,
  },
  {
    tag: "failed-confirmation-now-seen",
    receipt: `${devRoot}/spatial-confirmatory/summary.json`,
    sha256: "24aab017de4e11eded7484ac886c4f1ae410c5f73350f5a259bafe159b037e60",
    corpus: "work/spatial-data-2026-11-07.P8gFzP/final-reviewed",
    phase: "confirmatory",
    count: 20,
  },
];
export function parseArguments(args) {
  const allowed = [
    "phase",
    "foreground",
    "compiled",
    "prototypes",
    "output",
    "corpus",
    "manifest-sha",
    "selection",
    "selection-sha",
    "primary",
    "primary-resources",
    "center",
  ];
  const values = {};
  let run = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run") {
      assert.equal(run, false);
      run = true;
      continue;
    }
    const name = args[i].slice(2),
      value = args[++i];
    assert.ok(args[i - 1].startsWith("--") && allowed.includes(name) && !(name in values));
    assert.ok(value && !value.startsWith("--") && !/^[a-z]+:/iu.test(value));
    values[name] = value;
  }
  assert.ok(run);
  assert.ok(["development", "confirmatory"].includes(values.phase));
  for (const key of ["phase", "foreground", "compiled", "prototypes", "output"])
    assert.ok(values[key]);
  for (const key of allowed.filter(
    (key) => !["phase", "foreground", "compiled", "prototypes", "output"].includes(key),
  ))
    assert.equal(Boolean(values[key]), values.phase === "confirmatory", key);
  for (const key of ["manifest-sha", "selection-sha"])
    if (values[key]) assert.match(values[key], /^[a-f0-9]{64}$/u);
  return values;
}
function checked(work, input, directory = false) {
  const file = path.resolve(input),
    stat = fs.lstatSync(file);
  assert.equal(fs.realpathSync(file), file);
  assert.ok(file.startsWith(`${work}${path.sep}`) && !stat.isSymbolicLink());
  assert.ok(directory ? stat.isDirectory() : stat.isFile());
  return file;
}
function json(file, maximum = 2_000_000) {
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maximum);
  return JSON.parse(fs.readFileSync(file));
}
function treeHash(directory) {
  const files = [];
  let bytes = 0;
  const visit = (root) => {
    for (const name of fs.readdirSync(root).sort()) {
      const file = path.join(root, name),
        stat = fs.lstatSync(file);
      assert.ok(!stat.isSymbolicLink());
      if (stat.isDirectory()) visit(file);
      else {
        assert.ok(stat.isFile());
        bytes += stat.size;
        assert.ok(bytes <= 40_000_000 && files.length < 200);
        files.push([path.relative(directory, file), digest(file)]);
      }
    }
  };
  visit(directory);
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
export function decodeBoundedPrimary(call, normalize) {
  const validProcess = !call.failed && !call.signal && !call.errorCode;
  if (validProcess && call.exitCode === 0) {
    const value = normalize(call.raw);
    const extra = value.status === "observed" ? value.source.supplement : undefined;
    const systemBranch =
      value.status === "observed" &&
      ((extra.status === "skipped" &&
        ((extra.reason === "primary_match" && value.object.status === "estimated") ||
          (extra.reason === "primary_conflict" &&
            value.object.status === "unknown" &&
            value.object.reason === "conflicting_kinds"))) ||
        (extra.status === "unavailable" &&
          value.object.status === "unknown" &&
          value.object.reason === "no_operating_point_match"));
    if (
      value.status === "observed" &&
      value.source.nativeSchemaVersion === "local-vision-v4" &&
      systemBranch &&
      !(value.object.status === "estimated" && "method" in value.object)
    )
      return { valid: true, operationalSuccess: true, primary: value.object };
  }
  const r = call.raw;
  if (
    validProcess &&
    call.exitCode === 1 &&
    r &&
    typeof r === "object" &&
    Object.keys(r).sort().join(",") === "reason,status" &&
    r.status === "unavailable" &&
    ["timeout", "failed", "busy", "unavailable", "invalid_image"].includes(r.reason)
  )
    return {
      valid: true,
      operationalSuccess: false,
      failureReason: r.reason,
      primary: { status: "unknown", reason: "processing_failed" },
    };
  return {
    valid: false,
    operationalSuccess: false,
    primary: { status: "unknown", reason: "invalid_response" },
  };
}
function execute(binary, args, bytes) {
  const started = performance.now();
  const r = spawnSync(binary, args, {
    input: bytes.toString("base64"),
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 250_000,
  });
  let raw = null;
  try {
    raw = JSON.parse(r.stdout);
  } catch {
    /* Invalid stays invalid. */
  }
  return {
    raw,
    exitCode: r.status,
    signal: r.signal,
    failed: Boolean(r.error || r.signal),
    errorCode: r.error?.code ?? null,
    wallMs: Math.round(performance.now() - started),
    stdout: r.stdout,
    stderr: r.stderr,
  };
}
export async function evaluate(options, cwd = process.cwd()) {
  const work = fs.realpathSync(path.join(cwd, "work")),
    isDevelopment = options.phase === "development";
  const binaries = {};
  for (const name of isDevelopment ? ["foreground"] : ["foreground", "primary", "center"]) {
    const file = checked(work, options[name]);
    fs.accessSync(file, fs.constants.X_OK);
    assert.ok(fs.statSync(file).size < 50_000_000);
    assert.equal(digest(file), pins[name]);
    binaries[name] = file;
  }
  const compiled = checked(work, options.compiled, true),
    prototypes = checked(work, options.prototypes);
  assert.equal(digest(prototypes), pins.prototypes);
  assert.equal(digest(path.join(compiled, "model.mil")), pins.graph);
  assert.equal(digest(path.join(compiled, "weights/weight.bin")), pins.weights);
  const mobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  const gateFile = mobile.resolve("@kierratysappi/contracts/packaging-classifier"),
    normalizerFile = mobile.resolve("@kierratysappi/contracts/local-vision");
  const { PackagingScoresSchema, decidePackagingScores, packagingGatePolicies } = await import(
    pathToFileURL(gateFile).href
  );
  const { normalizeLocalVisionResult } = await import(pathToFileURL(normalizerFile).href);
  assert.deepEqual(packagingGatePolicies.loose, { minimumCosine: 0.2, minimumLead: 0.02 });
  const commonPaths = {
    foreground: binaries.foreground,
    prototypes,
    gate: gateFile,
    normalizer: normalizerFile,
    policy: path.join(cwd, "scripts/qa/local-vision/foreground-policy.mjs"),
    evaluator: path.join(cwd, "scripts/qa/local-vision/foreground-evaluate.mjs"),
    source: path.join(cwd, "scripts/qa/local-vision/foreground-main.swift"),
    helpers: path.join(cwd, "scripts/qa/local-vision/robustness-evaluate.mjs"),
    baselineCascade: path.join(cwd, "scripts/qa/local-vision/packaging-evaluate.mjs"),
    workspaceLock: path.join(cwd, "pnpm-lock.yaml"),
    contractsPackage: path.join(cwd, "shared/contracts/package.json"),
    domainPackage: path.join(cwd, "shared/domain/package.json"),
    protocol: path.join(cwd, "scripts/qa/protocols/local-vision-foreground-protocol.md"),
    prompts: path.join(cwd, "scripts/qa/local-vision/mobileclip-prompts.json"),
  };
  const phasePaths = {},
    inputs = [];
  let selection = null,
    resources;
  const hashesFor = (files) =>
    Object.fromEntries(Object.entries(files).map(([key, file]) => [key, digest(file)]));
  const commonNow = () => ({
    ...hashesFor(commonPaths),
    compiled: treeHash(compiled),
    domainSources: treeHash(path.join(cwd, "shared/domain/src")),
    nodeRuntime: process.version,
    nativePlatform: `${os.platform()}-${os.arch()}-${os.release()}`,
  });
  if (isDevelopment) {
    for (const spec of development) {
      const receiptFile = checked(work, path.join(cwd, spec.receipt));
      assert.equal(digest(receiptFile), spec.sha256);
      const previous = json(receiptFile);
      assert.equal(previous.sourceHashesUnchanged, true);
      assert.equal(previous.cases.length, spec.count);
      assert.equal(previous.phase, spec.phase);
      assert.equal(previous.hashes.gate, digest(gateFile));
      assert.equal(previous.hashes.normalizer, digest(normalizerFile));
      const corpus = checked(work, path.join(cwd, spec.corpus), true),
        manifestFile = checked(work, path.join(corpus, "fixtures.json"));
      const manifest = json(manifestFile);
      assert.equal(manifest.labelReviewStatus, "ai_reviewed_human_review_required");
      phasePaths[`receipt-${spec.tag}`] = receiptFile;
      phasePaths[`manifest-${spec.tag}`] = manifestFile;
      for (const captured of previous.cases) {
        const reference = manifest.fixtures.find((r) => r.id === captured.id);
        assert.ok(reference);
        assert.equal(reference.expectedKind, captured.expectedKind);
        const file = checked(work, path.join(corpus, `${captured.id}.jpg`));
        assert.equal(digest(file), captured.imageSha256);
        assert.equal(reference.sha256, captured.imageSha256);
        inputs.push({
          id: `${spec.tag}-${captured.id}`,
          sourceId: captured.id,
          expectedKind: captured.expectedKind,
          file,
          sha256: captured.imageSha256,
          captured,
        });
      }
    }
    assert.equal(inputs.length, 52);
    assert.equal(new Set(inputs.map((r) => r.sha256)).size, 52);
    assert.equal(
      inputs.filter((r) => r.captured.primary.valid && r.captured.primary.operationalSuccess)
        .length,
      50,
    );
  } else {
    resources = checked(work, options["primary-resources"], true);
    assert.deepEqual(fs.readdirSync(resources), []);
    const selectionFile = checked(work, options.selection);
    assert.equal(digest(selectionFile), options["selection-sha"]);
    selection = json(selectionFile);
    assert.equal(selection.phase, "development");
    assert.equal(selection.sourceHashesUnchanged, true);
    assert.ok(["F1", "F2"].includes(selection.selectedVariant));
    assert.equal(selection.cases.length, 52);
    const recomputed = selectForeground(selection.cases);
    for (const key of ["baseline", "results", "selectedVariant"])
      assert.deepEqual(selection[key], recomputed[key]);
    assert.deepEqual(selection.hashes, commonNow());
    const start = json(checked(work, path.join(path.dirname(selectionFile), "started.json")));
    assert.equal(start.phase, "development");
    assert.deepEqual(start.hashes, selection.hashes);
    assert.ok(
      Number.isFinite(Date.parse(start.startedAt)) &&
        Number.isFinite(Date.parse(selection.completedAt)) &&
        Date.parse(start.startedAt) <= Date.parse(selection.completedAt) &&
        Date.parse(selection.completedAt) <= Date.now(),
    );
    const corpus = checked(work, options.corpus, true),
      manifestFile = checked(work, path.join(corpus, "fixtures.json"));
    assert.equal(digest(manifestFile), options["manifest-sha"]);
    const validator = path.join(cwd, "scripts/qa/local-vision/foreground-data-corpus.mjs");
    const { validateManifest, validateLocal } = await import(pathToFileURL(validator).href);
    const manifest = validateManifest(json(manifestFile));
    validateLocal(manifest, corpus);
    assert.equal(manifest.fixtures.length, 20);
    Object.assign(phasePaths, {
      selection: selectionFile,
      manifest: manifestFile,
      validator,
      primary: binaries.primary,
      center: binaries.center,
      engine: path.join(cwd, "mobile/app/modules/local-vision/ios/local-vision-engine.swift"),
      primarySource: path.join(cwd, "scripts/qa/local-vision/main.swift"),
    });
    for (const name of ["cases", "prior", "review", "manifest"])
      phasePaths[name] = path.join(cwd, `scripts/qa/local-vision/foreground-data-${name}.json`);
    for (const r of manifest.fixtures) {
      const file = checked(work, path.join(corpus, `${r.id}.jpg`));
      assert.equal(digest(file), r.sha256);
      inputs.push({ id: r.id, expectedKind: r.expectedKind, file, sha256: r.sha256 });
    }
  }
  for (const row of inputs) {
    assert.match(row.id, /^[a-z][a-z0-9-]+$/u);
    assert.ok(fs.statSync(row.file).size <= 1_500_000);
  }
  const hashes = commonNow(),
    phaseNow = () => hashesFor(phasePaths),
    phaseHashes = phaseNow();
  const output = path.resolve(options.output);
  checked(work, path.dirname(output), true);
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output);
  const write = (name, data) =>
    fs.writeFileSync(path.join(output, name), `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
  write("started.json", {
    startedAt: new Date().toISOString(),
    phase: options.phase,
    hashes,
    phaseHashes,
    selectedVariant: selection?.selectedVariant ?? null,
    knownSeenData: isDevelopment,
    cases: inputs.map(({ file: _file, captured: _captured, ...row }) => row),
    maximumMaskRequests: isDevelopment ? 50 : 20,
    paidCalls: 0,
  });
  const records = [];
  let executions = 0;
  for (const row of inputs) {
    assert.deepEqual(commonNow(), hashes);
    assert.deepEqual(phaseNow(), phaseHashes);
    assert.equal(digest(row.file), row.sha256);
    if (resources) assert.deepEqual(fs.readdirSync(resources), []);
    const bytes = fs.readFileSync(row.file);
    const run = (name, args) => {
      write(`attempt-${row.id}-${name}.json`, {
        startedAt: new Date().toISOString(),
        imageSha256: row.sha256,
        binarySha256: digest(binaries[name]),
      });
      executions++;
      const call = execute(binaries[name], args, bytes);
      write(`raw-${row.id}-${name}.json`, call);
      return call;
    };
    const primary = isDevelopment
      ? row.captured.primary
      : decodeBoundedPrimary(
          run("primary", ["--resources", resources, "--base64-stdin"]),
          normalizeLocalVisionResult,
        );
    const center = isDevelopment
      ? row.captured.center
      : decodeClip(
          run("center", ["--score", compiled, prototypes]),
          "center-square-256-srgb-v1",
          (s) => PackagingScoresSchema.safeParse(s).success,
        );
    const baseline = baselineDecision(primary.primary, center, decidePackagingScores),
      baselineState = operationalState(primary, center, null, "baseline");
    if (isDevelopment) {
      assert.deepEqual(baseline, row.captured.decisions.baseline);
      assert.deepEqual(baselineState, row.captured.operational.baseline);
    }
    const variants = isDevelopment ? ["F1", "F2"] : [selection.selectedVariant];
    const shouldRun = isDevelopment
      ? primary.valid && primary.operationalSuccess
      : variants.some((v) => requiredForeground(v, primary, center, baseline, baselineState));
    const observation = shouldRun
      ? decodeForeground(
          run("foreground", ["--score-foreground", compiled, prototypes]),
          (s) => PackagingScoresSchema.safeParse(s).success,
        )
      : { valid: true, operationalSuccess: true, status: "skipped", instances: [], counters: null };
    const decisions = { baseline },
      operational = { baseline: baselineState };
    for (const variant of variants) {
      decisions[variant] = foregroundDecision(
        variant,
        primary,
        center,
        baseline,
        observation,
        decidePackagingScores,
      );
      operational[variant] = foregroundState(
        requiredForeground(variant, primary, center, baseline, baselineState),
        baselineState,
        observation,
      );
    }
    const record = {
      id: row.id,
      expectedKind: row.expectedKind,
      imageSha256: row.sha256,
      primary,
      center,
      foreground: observation,
      decisions,
      operational,
    };
    write(`case-${row.id}.json`, record);
    records.push(record);
    assert.equal(digest(row.file), row.sha256);
    assert.deepEqual(commonNow(), hashes);
    assert.deepEqual(phaseNow(), phaseHashes);
  }
  const summary = {
    phase: options.phase,
    completedAt: new Date().toISOString(),
    hashes,
    phaseHashes,
    sourceHashesUnchanged: true,
    cases: records,
    processExecutions: executions,
    foregroundExecutions: records.filter((r) => r.foreground.status !== "skipped").length,
    clipPredictionsCompletedKnown: records.reduce(
      (n, r) => n + (r.foreground.counters?.clipPredictionsCompleted ?? 0),
      0,
    ),
    counterUnavailableExecutions: records.filter(
      (r) => r.foreground.status !== "skipped" && !r.foreground.counters,
    ).length,
    retries: 0,
    paidCalls: 0,
    labelReviewStatus: "ai_reviewed_human_review_required",
    knownSeenDevelopment: isDevelopment,
    ...(isDevelopment
      ? selectForeground(records)
      : confirmForeground(records, selection.selectedVariant)),
  };
  write("summary.json", summary);
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await evaluate(parseArguments(process.argv.slice(2)));
    console.log(
      JSON.stringify({
        phase: result.phase,
        selectedVariant: result.selectedVariant,
        integrationEligible: result.integrationEligible ?? false,
        processExecutions: result.processExecutions,
      }),
    );
  } catch {
    console.error("foreground_evaluation_failed_preserve_receipts_no_retry");
    process.exitCode = 1;
  }
}
