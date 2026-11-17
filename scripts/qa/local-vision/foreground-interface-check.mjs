// Explicit single owned-uniform-image probe; never a quality benchmark or retry.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function checked(work, input, directory = false) {
  const file = path.resolve(input),
    stat = fs.lstatSync(file);
  assert.equal(fs.realpathSync(file), file);
  assert.ok(file.startsWith(`${work}${path.sep}`) && !stat.isSymbolicLink());
  assert.ok(directory ? stat.isDirectory() : stat.isFile());
  return file;
}
export function probeCompleted(call) {
  const r = call.raw;
  const exact =
    r &&
    typeof r === "object" &&
    !Array.isArray(r) &&
    Object.keys(r).sort().join(",") ===
      [
        "schemaVersion",
        "status",
        "purpose",
        "maskRequestRevision",
        "maskComputeUnits",
        "outcome",
        "subjectCount",
        "mask",
        "maskRequestsAttempted",
        "maskRequestsCompleted",
        "clipPredictions",
        "durationMs",
      ]
        .sort()
        .join(",");
  const mask = r?.mask;
  const layoutValid =
    mask === null
      ? r?.subjectCount === 0
      : Boolean(
          mask &&
            Object.keys(mask).sort().join(",") ===
              [
                "width",
                "height",
                "bytesPerRow",
                "pixelFormat",
                "encoding",
                "subjectInstanceIndices",
                "observedMaskLabels",
              ]
                .sort()
                .join(",") &&
            Number.isInteger(mask.width) &&
            mask.width > 0 &&
            mask.width <= 4096 &&
            Number.isInteger(mask.height) &&
            mask.height > 0 &&
            mask.height <= 4096 &&
            mask.width * mask.height <= 16_000_000 &&
            Number.isInteger(mask.pixelFormat) &&
            mask.pixelFormat >= 0 &&
            mask.pixelFormat <= 0xffff_ffff &&
            ["uint8_instance_labels", "float32_integer_instance_labels"].includes(mask.encoding) &&
            mask.pixelFormat ===
              (mask.encoding === "uint8_instance_labels" ? 1278226488 : 1278226534) &&
            Number.isInteger(mask.bytesPerRow) &&
            mask.bytesPerRow >= mask.width * (mask.encoding === "uint8_instance_labels" ? 1 : 4) &&
            mask.bytesPerRow <= Math.floor(70_000_000 / mask.height) &&
            Array.isArray(mask.subjectInstanceIndices) &&
            mask.subjectInstanceIndices.length === r.subjectCount &&
            mask.subjectInstanceIndices.every(
              (n, i, a) =>
                Number.isInteger(n) &&
                n > 0 &&
                n <= (mask.encoding === "uint8_instance_labels" ? 255 : 65_535) &&
                (i === 0 || n > a[i - 1]),
            ) &&
            JSON.stringify(mask.observedMaskLabels) === JSON.stringify(mask.subjectInstanceIndices),
        );
  return Boolean(
    exact &&
      layoutValid &&
      !call.failed &&
      !call.signal &&
      call.exitCode === 0 &&
      r &&
      r.schemaVersion === "foreground-interface-probe-v1" &&
      r.status === "completed" &&
      r.purpose === "owned_uniform_rgb512_interface_only_not_accuracy" &&
      r.maskRequestRevision === 1 &&
      r.maskComputeUnits === "vision_system_default" &&
      r.maskRequestsAttempted === 1 &&
      r.maskRequestsCompleted === 1 &&
      r.clipPredictions === 0 &&
      Number.isInteger(r.durationMs) &&
      r.durationMs >= 0 &&
      r.durationMs < 12_000 &&
      Number.isInteger(r.subjectCount) &&
      r.subjectCount >= 0 &&
      r.subjectCount <= 4 &&
      r.outcome === (r.subjectCount === 0 ? "no_subjects" : "subjects_observed"),
  );
}
export function runProbe(args, cwd = process.cwd()) {
  assert.equal(args.length, 7);
  assert.deepEqual(
    [args[0], args[1], args[3], args[5]],
    ["--run", "--binary", "--binary-sha", "--output"],
  );
  const work = fs.realpathSync(path.join(cwd, "work"));
  const binary = checked(work, args[2]);
  assert.match(args[4], /^[a-f0-9]{64}$/u);
  assert.equal(digest(binary), args[4]);
  fs.accessSync(binary, fs.constants.X_OK);
  assert.ok(fs.statSync(binary).size < 50_000_000);
  const output = path.resolve(args[6]);
  checked(work, path.dirname(output), true);
  assert.equal(fs.existsSync(output), false, "never_repeat_probe_in_same_output");
  const sources = {
    binary,
    source: path.join(cwd, "scripts/qa/local-vision/foreground-main.swift"),
    protocol: path.join(cwd, "scripts/qa/protocols/local-vision-foreground-protocol.md"),
    runner: path.join(cwd, "scripts/qa/local-vision/foreground-interface-check.mjs"),
  };
  const hashesNow = () =>
    Object.fromEntries(Object.entries(sources).map(([key, file]) => [key, digest(file)]));
  const hashes = hashesNow();
  fs.mkdirSync(output);
  const write = (name, value) =>
    fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
  write("started.json", {
    startedAt: new Date().toISOString(),
    hashes,
    plannedMaskCalls: 1,
    plannedClipCalls: 0,
    input: "owned_in_memory_uniform_rgb512",
  });
  const started = performance.now();
  const result = spawnSync(binary, ["--interface-probe"], {
    input: "",
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 100_000,
  });
  let raw = null;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    /* Invalid output stays invalid. */
  }
  const call = {
    raw,
    failed: Boolean(result.error || result.signal),
    signal: result.signal,
    exitCode: result.status,
    errorCode: result.error?.code ?? null,
    wallMs: Math.round(performance.now() - started),
    stdout: result.stdout,
    stderr: result.stderr,
  };
  write("raw.json", call);
  const summary = {
    completedAt: new Date().toISOString(),
    hashes,
    sourceHashesUnchanged: JSON.stringify(hashesNow()) === JSON.stringify(hashes),
    interfaceAvailable: probeCompleted(call),
    qualityEvidence: false,
    retries: 0,
    paidCalls: 0,
    wallMs: call.wallMs,
    result: raw,
    processError: call.errorCode,
    processSignal: call.signal,
  };
  write("summary.json", summary);
  assert.equal(summary.sourceHashesUnchanged, true);
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const summary = runProbe(process.argv.slice(2));
    console.log(
      JSON.stringify({
        interfaceAvailable: summary.interfaceAvailable,
        qualityEvidence: false,
        retries: 0,
        wallMs: summary.wallMs,
      }),
    );
    if (!summary.interfaceAvailable) process.exitCode = 1;
  } catch {
    console.error("foreground_interface_preflight_failed; preserve_receipts_no_retry");
    process.exitCode = 1;
  }
}
