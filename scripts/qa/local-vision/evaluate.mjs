// Explicit local-only development diagnostics. No download, API or training.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function parseArguments(args) {
  const names = new Map([
    ["--binary", "binary"],
    ["--fixture-dir", "fixtureDir"],
    ["--evidence-dir", "evidenceDir"],
    ["--synthetic-manifest", "syntheticManifest"],
  ]);
  const options = {};
  let run = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--run") {
      if (run) throw new Error("invalid_arguments");
      run = true;
      continue;
    }
    const key = names.get(argument);
    const value = args[++index];
    if (!key || key in options || !value || value.startsWith("--") || /^[a-z]+:/iu.test(value))
      throw new Error("invalid_arguments");
    options[key] = value;
  }
  if (!run || !options.binary || !options.fixtureDir || !options.evidenceDir)
    throw new Error("explicit_local_run_required");
  return options;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashFile = (file) => sha256(fs.readFileSync(file));

function workPath(workRoot, input, expectedType) {
  const absolute = path.resolve(input);
  const canonical = fs.realpathSync(absolute);
  assert.ok(canonical.startsWith(`${workRoot}${path.sep}`), "outside_work");
  const info = fs.lstatSync(absolute);
  assert.equal(info.isSymbolicLink(), false, "symlink_not_allowed");
  assert.equal(expectedType === "file" ? info.isFile() : info.isDirectory(), true);
  return canonical;
}

function readJson(file, maxBytes = 65_536) {
  assert.ok(fs.statSync(file).size <= maxBytes, "manifest_too_large");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function checkedFixture(directory, record, prefix = "") {
  assert.match(record.id, /^[a-z][a-z0-9-]{1,40}$/u);
  assert.match(record.sha256, /^[a-f0-9]{64}$/u);
  const expectedBytes = record.bytes ?? record.size;
  assert.ok(Number.isInteger(expectedBytes) && expectedBytes >= 12 && expectedBytes <= 1_500_000);
  const file = path.join(directory, `${prefix}${record.id}.jpg`);
  const stat = fs.lstatSync(file);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(fs.realpathSync(file), file);
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, expectedBytes, "fixture_size_changed");
  assert.equal(sha256(bytes), record.sha256, "fixture_hash_changed");
  return { ...record, bytesValue: bytes, bytes: bytes.length };
}

export async function evaluate(options, cwd = process.cwd()) {
  const workRoot = fs.realpathSync(path.join(cwd, "work"));
  const binary = workPath(workRoot, options.binary, "file");
  assert.ok(fs.statSync(binary).size <= 50_000_000, "binary_too_large");
  fs.accessSync(binary, fs.constants.X_OK);
  const fixtureDirectory = workPath(workRoot, options.fixtureDir, "directory");
  const manifestPath = workPath(workRoot, path.join(fixtureDirectory, "fixtures.json"), "file");
  const manifest = readJson(manifestPath);
  assert.ok(
    Array.isArray(manifest.fixtures) &&
      manifest.fixtures.length > 0 &&
      manifest.fixtures.length <= 16,
  );
  const inputs = manifest.fixtures.map((record) => checkedFixture(fixtureDirectory, record));
  let syntheticManifestPath;
  if (options.syntheticManifest) {
    syntheticManifestPath = workPath(workRoot, options.syntheticManifest, "file");
    const synthetic = readJson(syntheticManifestPath);
    assert.ok(
      Array.isArray(synthetic.fixtures) &&
        synthetic.fixtures.length > 0 &&
        synthetic.fixtures.length <= 8,
    );
    inputs.push(
      ...synthetic.fixtures.map((record) => ({
        ...checkedFixture(path.dirname(syntheticManifestPath), record, "synthetic-"),
        diagnosticOnly: true,
      })),
    );
  }
  assert.equal(new Set(inputs.map((record) => record.id)).size, inputs.length);
  const requireFromMobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  const normalizerPath = requireFromMobile.resolve("@kierratysappi/contracts/local-vision");
  const { normalizeLocalVisionResult, NativeLocalVisionResultSchema, localVisionSchemaVersion } =
    await import(pathToFileURL(normalizerPath).href);
  const sources = {
    evaluator: path.join(cwd, "scripts/qa/local-vision/evaluate.mjs"),
    binary,
    engine: path.join(cwd, "mobile/app/modules/local-vision/ios/local-vision-engine.swift"),
    cli: path.join(cwd, "scripts/qa/local-vision/main.swift"),
    normalizer: normalizerPath,
    spec: path.join(cwd, "scripts/qa/protocols/local-vision-baseline-spec.md"),
    fixtureManifest: manifestPath,
    ...(syntheticManifestPath ? { syntheticManifest: syntheticManifestPath } : {}),
  };
  const hashes = Object.fromEntries(
    Object.entries(sources).map(([name, file]) => [name, hashFile(file)]),
  );
  // A fresh directory and exclusive markers make accidental hidden retakes fail.
  const output = path.resolve(options.evidenceDir);
  const parent = fs.realpathSync(path.dirname(output));
  assert.ok(parent === workRoot || parent.startsWith(`${workRoot}${path.sep}`), "outside_work");
  assert.equal(fs.existsSync(output), false, "evidence_exists");
  fs.mkdirSync(output);
  const write = (name, value) =>
    fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2), { flag: "wx" });
  write("started.json", {
    startedAt: new Date().toISOString(),
    schemaVersion: localVisionSchemaVersion,
    hashes,
    inputs: inputs.map(({ bytesValue: _bytesValue, ...record }) => record),
    plannedCalls: inputs.length,
    paidCalls: 0,
    newDownloads: 0,
  });
  const cases = [];
  for (const input of inputs) {
    write(`attempt-${input.id}.json`, {
      startedAt: new Date().toISOString(),
      inputSha256: input.sha256,
    });
    const start = performance.now();
    // The child receives only validated JPEG bytes, never an ID/name/expected label.
    const call = spawnSync(binary, ["--base64-stdin"], {
      input: input.bytesValue.toString("base64"),
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 100_000,
    });
    let raw;
    try {
      raw = JSON.parse(call.stdout);
    } catch {
      raw = { status: "unavailable", reason: "invalid_cli_output" };
    }
    write(`raw-${input.id}.json`, raw);
    const result = {
      id: input.id,
      inputSha256: input.sha256,
      diagnosticOnly: input.diagnosticOnly ?? false,
      processExitCode: call.status,
      rawSchemaAccepted: NativeLocalVisionResultSchema.safeParse(raw).success,
      wallDurationMs: Math.round(performance.now() - start),
      normalized: normalizeLocalVisionResult(raw),
      cliFailure: call.error ? call.error.name : null,
    };
    write(`normalized-${input.id}.json`, result);
    cases.push(result);
  }
  const finalHashes = Object.fromEntries(
    Object.entries(sources).map(([name, file]) => [name, hashFile(file)]),
  );
  const sourceHashesUnchanged = JSON.stringify(finalHashes) === JSON.stringify(hashes);
  const summary = {
    completedAt: new Date().toISOString(),
    schemaVersion: localVisionSchemaVersion,
    hashes,
    sourceHashesUnchanged,
    executionMode: "fresh_cli_process_per_case_not_controlled_warm_or_phone_latency",
    calls: cases.length,
    retries: 0,
    paidCalls: 0,
    newDownloads: 0,
    cases,
  };
  write("summary.json", summary);
  assert.ok(sourceHashesUnchanged, "sources_changed_during_run");
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await evaluate(parseArguments(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "evaluation_failed");
    process.exitCode = 1;
  }
}
