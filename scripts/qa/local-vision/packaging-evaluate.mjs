// Explicit local comparison. References never enter either image model.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { validateManifest } from "./packaging-corpus.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = (file) => sha(fs.readFileSync(file));
export function parseArguments(args) {
  const allowed = new Set([
    "baseline",
    "clip",
    "compiled",
    "prototypes",
    "corpus",
    "manifest-sha",
    "phase",
    "output",
    "selection",
    "account-original",
  ]);
  const options = {};
  let run = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run") {
      assert.equal(run, false);
      run = true;
      continue;
    }
    const name = args[i].slice(2),
      value = args[++i];
    assert.ok(args[i - 1].startsWith("--") && allowed.has(name) && !(name in options));
    assert.ok(value && !value.startsWith("--") && !/^[a-z]+:/iu.test(value));
    options[name] = value;
  }
  assert.ok(run, "explicit_run_required");
  for (const name of [
    "baseline",
    "clip",
    "compiled",
    "prototypes",
    "corpus",
    "manifest-sha",
    "phase",
    "output",
  ])
    assert.ok(options[name], `missing_${name}`);
  assert.ok(["validation", "heldout"].includes(options.phase));
  assert.match(options["manifest-sha"], /^[a-f0-9]{64}$/u);
  assert.equal(Boolean(options.selection), options.phase === "heldout");
  if (options["account-original"]) assert.equal(options.phase, "validation");
  return options;
}

/** CLI exit1 can be a defined native failure, never a successful observation. */
export function decodeBaseline(call, normalize) {
  const normalized = normalize(call.raw);
  if (!call.failed && call.exitCode === 0 && normalized.status === "observed")
    return { valid: true, operationalSuccess: true, primary: normalized.object };
  const raw = call.raw;
  if (
    !call.failed &&
    call.exitCode === 1 &&
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Object.keys(raw).sort().join(",") === "reason,status" &&
    raw.status === "unavailable" &&
    ["failed", "busy", "invalid_image", "unavailable"].includes(raw.reason)
  ) {
    const reason =
      raw.reason === "invalid_image"
        ? "invalid_image"
        : raw.reason === "unavailable"
          ? "native_unavailable"
          : "processing_failed";
    return {
      valid: true,
      operationalSuccess: false,
      failureReason: raw.reason,
      primary: { status: "unknown", reason },
    };
  }
  return {
    valid: false,
    operationalSuccess: false,
    primary: { status: "unknown", reason: "invalid_response" },
  };
}

export function cascade(primary, supplemental) {
  if (primary.status === "estimated")
    return { status: "estimated", kind: primary.kind, method: "system" };
  if (primary.reason !== "no_operating_point_match")
    return { status: "unknown", reason: "primary_uncertainty" };
  return supplemental;
}
export function metrics(rows) {
  let baselineCorrect = 0,
    candidateCorrect = 0,
    additionalCorrect = 0,
    newErrors = 0,
    lostCorrect = 0;
  for (const row of rows) {
    const baseline = row.primary.status === "estimated" ? row.primary.kind : "unknown";
    const candidate = row.decision.status === "estimated" ? row.decision.kind : "unknown";
    const before = row.expectedKind !== "unknown" && baseline === row.expectedKind;
    const after = row.expectedKind !== "unknown" && candidate === row.expectedKind;
    baselineCorrect += Number(before);
    candidateCorrect += Number(after);
    additionalCorrect += Number(after && !before);
    lostCorrect += Number(before && !after);
    newErrors += Number(
      candidate !== "unknown" && candidate !== row.expectedKind && candidate !== baseline,
    );
  }
  return { baselineCorrect, candidateCorrect, additionalCorrect, newErrors, lostCorrect };
}
export function selectValidationPolicy(cases, decide) {
  const results = ["strict", "medium", "loose"].map((policy) => {
    const rows = cases.map((row) => ({
      ...row,
      decision: cascade(row.primary, decide(row.scores, policy)),
    }));
    const measured = metrics(rows);
    return {
      policy,
      rows,
      ...measured,
      eligible:
        cases.every((row) => row.valid) &&
        measured.newErrors === 0 &&
        measured.lostCorrect === 0 &&
        measured.additionalCorrect >= 2,
    };
  });
  return { results, selectedPolicy: results.find((result) => result.eligible)?.policy ?? null };
}

function workPath(work, input, directory = false) {
  const file = path.resolve(input),
    canonical = fs.realpathSync(file),
    stat = fs.lstatSync(file);
  assert.ok(
    canonical.startsWith(`${work}${path.sep}`) && canonical === file && !stat.isSymbolicLink(),
  );
  assert.ok(directory ? stat.isDirectory() : stat.isFile());
  return file;
}
function json(file, maximum = 1_000_000) {
  assert.ok(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink());
  assert.ok(fs.statSync(file).size <= maximum);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function directoryHash(root) {
  const entries = [];
  let total = 0;
  const visit = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name),
        stat = fs.lstatSync(file);
      assert.equal(stat.isSymbolicLink(), false);
      if (stat.isDirectory()) visit(file);
      else {
        assert.ok(stat.isFile());
        total += stat.size;
        assert.ok(total <= 150_000_000 && entries.length < 200);
        entries.push([path.relative(root, file), hashFile(file)]);
      }
    }
  };
  visit(root);
  return sha(JSON.stringify(entries));
}
const rawCall = (binary, args, bytes) => {
  const started = performance.now();
  const call = spawnSync(binary, args, {
    input: bytes.toString("base64"),
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 200_000,
  });
  let raw;
  try {
    raw = JSON.parse(call.stdout);
  } catch {
    raw = { status: "unavailable", reason: "invalid_cli_output" };
  }
  return {
    raw,
    exitCode: call.status,
    failed: Boolean(call.error),
    wallMs: Math.round(performance.now() - started),
  };
};

export async function evaluate(options, cwd = process.cwd()) {
  const work = fs.realpathSync(path.join(cwd, "work"));
  const baseline = workPath(work, options.baseline),
    clip = workPath(work, options.clip);
  for (const binary of [baseline, clip]) {
    fs.accessSync(binary, fs.constants.X_OK);
    assert.ok(fs.statSync(binary).size < 50_000_000);
  }
  const compiled = workPath(work, options.compiled, true),
    prototypes = workPath(work, options.prototypes);
  const corpus = workPath(work, options.corpus, true),
    manifestPath = workPath(work, path.join(corpus, "fixtures.json"));
  assert.equal(hashFile(manifestPath), options["manifest-sha"]);
  const manifest = validateManifest(json(manifestPath));
  const prototype = json(prototypes),
    promptPath = path.join(cwd, "scripts/qa/local-vision/mobileclip-prompts.json");
  assert.equal(prototype.promptsSha256, hashFile(promptPath));
  const requireMobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  const normalizerPath = requireMobile.resolve("@kierratysappi/contracts/local-vision");
  const gatePath = requireMobile.resolve("@kierratysappi/contracts/packaging-classifier");
  const { normalizeLocalVisionResult } = await import(pathToFileURL(normalizerPath).href);
  const { PackagingScoresSchema, decidePackagingScores } = await import(
    pathToFileURL(gatePath).href
  );
  const sourcePaths = {
    baseline,
    clip,
    prototypes,
    manifest: manifestPath,
    prompts: promptPath,
    normalizer: normalizerPath,
    gate: gatePath,
    clipSource: path.join(cwd, "scripts/qa/local-vision/mobileclip-main.swift"),
    tokenizer: path.join(cwd, "scripts/qa/local-vision/mobileclip-tokenizer.swift"),
    modelAssets: path.join(cwd, "scripts/qa/local-vision/mobileclip-assets.json"),
    baselineEngine: path.join(cwd, "mobile/app/modules/local-vision/ios/local-vision-engine.swift"),
    corpusValidator: path.join(cwd, "scripts/qa/local-vision/packaging-corpus.mjs"),
    protocol: path.join(cwd, "scripts/qa/protocols/packaging-classifier-protocol.md"),
    accountingAmendment: path.join(cwd, "scripts/qa/protocols/packaging-accounting-amendment.md"),
    evaluator: path.join(cwd, "scripts/qa/local-vision/packaging-evaluate.mjs"),
  };
  const hashesNow = () => ({
    ...Object.fromEntries(Object.entries(sourcePaths).map(([key, file]) => [key, hashFile(file)])),
    compiled: directoryHash(compiled),
  });
  const hashes = hashesNow();
  let original;
  let originalDirectory;
  if (options["account-original"]) {
    originalDirectory = workPath(work, options["account-original"], true);
    original = json(path.join(originalDirectory, "summary.json"));
    assert.equal(original.phase, "validation");
    assert.equal(original.selectedPolicy, null);
    assert.equal(original.sourceHashesUnchanged, true);
    assert.equal(
      hashFile(path.join(originalDirectory, "evaluator-at-original-run.mjs")),
      original.hashes.evaluator,
    );
    for (const [key, hash] of Object.entries(original.hashes))
      if (key !== "evaluator") assert.equal(hashes[key], hash, `original_source_drift_${key}`);
  }
  let selection;
  if (options.phase === "heldout") {
    selection = json(workPath(work, options.selection));
    assert.equal(selection.phase, "validation");
    assert.ok(selection.selectedPolicy);
    for (const [key, hash] of Object.entries(hashes))
      assert.equal(selection.hashes[key], hash, `selection_source_drift_${key}`);
  }
  const inputs = manifest.fixtures
    .filter((row) => row.split === options.phase)
    .map((row) => {
      assert.equal(row.seenDiagnostic, false);
      assert.match(row.id, /^[a-z][a-z0-9-]+$/u);
      const file = workPath(work, path.join(corpus, `${row.id}.jpg`)),
        bytes = fs.readFileSync(file);
      assert.ok(bytes.length <= 1_500_000);
      assert.equal(bytes.length, row.bytes);
      assert.equal(sha(bytes), row.sha256);
      return { ...row, bytes };
    });
  assert.ok(inputs.length >= 2 && inputs.length <= 20);
  const output = path.resolve(options.output);
  workPath(work, path.dirname(output), true);
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output);
  const write = (name, value) =>
    fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2), { flag: "wx" });
  write("started.json", {
    startedAt: new Date().toISOString(),
    phase: options.phase,
    hashes,
    selectionSha256: options.selection ? hashFile(options.selection) : null,
    cases: inputs.map(({ bytes: _bytes, ...row }) => row),
    callsPlanned: original ? 0 : inputs.length * 2,
    originalSummarySha256: originalDirectory
      ? hashFile(path.join(originalDirectory, "summary.json"))
      : null,
    paidCalls: 0,
  });
  const cases = [];
  for (const row of inputs) {
    write(`attempt-${row.id}.json`, { phase: options.phase, imageSha256: row.sha256 });
    const a = originalDirectory
      ? json(path.join(originalDirectory, `raw-baseline-${row.id}.json`))
      : rawCall(baseline, ["--base64-stdin"], row.bytes);
    const b = originalDirectory
      ? json(path.join(originalDirectory, `raw-candidate-${row.id}.json`))
      : rawCall(clip, ["--score", compiled, prototypes], row.bytes);
    write(`raw-baseline-${row.id}.json`, a);
    write(`raw-candidate-${row.id}.json`, b);
    const baselineResult = decodeBaseline(a, normalizeLocalVisionResult);
    const validClip =
      b.raw.schemaVersion === "mobileclip-s0-scores-v1" &&
      b.raw.modelId === "apple-mobileclip-s0-coreml-2024" &&
      b.raw.modelRevision === "55c8098c12ba8f928e37e26b2e1dd097777c3f98" &&
      b.raw.imageWeightSha256 ===
        "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6" &&
      b.raw.preprocessing === "center-square-256-srgb-v1" &&
      b.raw.computeUnits === "cpuOnly" &&
      Number.isFinite(b.raw.embeddingNorm) &&
      Math.abs(b.raw.embeddingNorm - 1) < 0.00001 &&
      Number.isFinite(b.raw.durationMs) &&
      b.raw.durationMs >= 0 &&
      b.raw.durationMs <= 60_000 &&
      b.raw.prototypesSha256 === hashes.prototypes &&
      b.raw.promptsSha256 === hashes.prompts &&
      PackagingScoresSchema.safeParse(b.raw.scores).success;
    const valid = baselineResult.valid && validClip && b.exitCode === 0 && !a.failed && !b.failed;
    const record = {
      id: row.id,
      expectedKind: row.expectedKind,
      split: row.split,
      valid,
      primary: baselineResult.primary,
      baselineOperationalSuccess: baselineResult.operationalSuccess,
      baselineFailureReason: baselineResult.failureReason ?? null,
      scores: validClip ? b.raw.scores : [],
      baselineWallMs: a.wallMs,
      candidateWallMs: b.wallMs,
    };
    write(`case-${row.id}.json`, record);
    cases.push(record);
  }
  const unchanged = JSON.stringify(hashesNow()) === JSON.stringify(hashes);
  const result =
    options.phase === "validation"
      ? selectValidationPolicy(cases, decidePackagingScores)
      : (() => {
          const rows = cases.map((row) => ({
            ...row,
            decision: cascade(
              row.primary,
              decidePackagingScores(row.scores, selection.selectedPolicy),
            ),
          }));
          const measured = metrics(rows);
          return {
            selectedPolicy: selection.selectedPolicy,
            rows,
            ...measured,
            eligible:
              cases.every((row) => row.valid) &&
              measured.newErrors === 0 &&
              measured.lostCorrect === 0 &&
              measured.additionalCorrect >= 1,
          };
        })();
  const summary = {
    phase: options.phase,
    completedAt: new Date().toISOString(),
    hashes,
    sourceHashesUnchanged: unchanged,
    calls: original ? 0 : cases.length * 2,
    accountedOriginalCalls: original?.calls ?? null,
    baselineOperationalSuccesses: cases.filter((row) => row.baselineOperationalSuccess).length,
    retries: 0,
    paidCalls: 0,
    labelReviewStatus: manifest.labelReviewStatus,
    cases,
    ...result,
  };
  if (original) {
    for (const before of original.results) {
      const after = result.results.find((entry) => entry.policy === before.policy);
      for (const key of [
        "baselineCorrect",
        "candidateCorrect",
        "additionalCorrect",
        "newErrors",
        "lostCorrect",
      ])
        assert.equal(after[key], before[key], `accounting_changed_metric_${key}`);
      for (const row of before.rows)
        assert.deepEqual(
          after.rows.find((entry) => entry.id === row.id).decision,
          row.decision,
          "accounting_changed_decision",
        );
    }
  }
  write("summary.json", summary);
  assert.ok(unchanged, "source_hash_drift");
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await evaluate(parseArguments(process.argv.slice(2)));
    console.log(
      JSON.stringify({
        phase: result.phase,
        calls: result.calls,
        selectedPolicy: result.selectedPolicy,
        eligible: result.eligible,
        hashesUnchanged: result.sourceHashesUnchanged,
      }),
    );
  } catch {
    console.error(
      "packaging_evaluation_failed; inspect retained preflight/results without retrying image calls",
    );
    process.exitCode = 1;
  }
}
