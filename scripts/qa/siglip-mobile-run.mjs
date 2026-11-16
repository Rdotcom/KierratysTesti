import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessMobileParity } from "./siglip-mobile-policy.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[3] ?? "");
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
function digest(file) {
  assert(fs.realpathSync(file) === file && fs.lstatSync(file).isFile());
  const h = createHash("sha256"),
    fd = fs.openSync(file, "r"),
    buf = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}
const write = (name, value) =>
  fs.writeFileSync(path.join(run, name), JSON.stringify(value, null, 2), { flag: "wx" });
if (process.argv[2] === "prepare") {
  const parent = path.join(root, "work/object-model-smoke-20261116.N66M3L"),
    pins = {};
  assert.equal(
    digest(path.join(parent, "lock.json")),
    "7e54120c34745d98e00c446ee9bfd485a6a381e9a41b2ef8b3f31b59165dee72",
  );
  assert.equal(
    digest(path.join(parent, "observations.json")),
    "8d5e4812d6bd46ba6c0141bcd072489d2ddd8bc132a68b0f2cf6e3d86acc135b",
  );
  const previous = JSON.parse(fs.readFileSync(path.join(parent, "lock.json"))),
    observations = JSON.parse(fs.readFileSync(path.join(parent, "observations.json")));
  for (const [file, expected] of Object.entries(previous.pins)) {
    assert.equal(digest(path.join(root, file)), expected);
    pins[file] = expected;
  }
  const add = (file) => {
    pins[path.relative(root, file)] = digest(file);
  };
  add(path.join(parent, "lock.json"));
  add(path.join(parent, "observations.json"));
  for (const file of [
    "scripts/qa/siglip-mobile.py",
    "scripts/qa/siglip-mobile-policy.mjs",
    "scripts/qa/siglip-mobile-run.mjs",
    "docs/research/siglip-mobile-export-protocol-2026-11-16.md",
  ])
    add(path.join(root, file));
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name),
        info = fs.lstatSync(file);
      assert(!info.isSymbolicLink());
      if (info.isDirectory()) {
        if (name !== "__pycache__") walk(file);
      } else if (!name.endsWith(".pyc")) add(file);
    }
  };
  walk(path.join(run, "conversion-deps/coremltools"));
  for (const name of fs
    .readdirSync(path.join(run, "conversion-deps"))
    .filter((n) => n.endsWith(".dist-info")))
    add(path.join(run, "conversion-deps", name, "METADATA"));
  const rows = previous.rows.map((r) => ({
    ...r,
    parentScores: previous.classes.map(
      (group) =>
        observations.rows
          .find((o) => o.model === "siglip2" && o.id === r.id)
          .scores.find((s) => s.group === group).cosine,
    ),
  }));
  write("lock.json", {
    schemaVersion: "siglip-image-only-coreml-v1",
    modelDirectory: previous.modelDirectory,
    python: previous.python,
    prompts: previous.prompts,
    classes: previous.classes,
    rows,
    pins,
    networkPolicy: previous.networkPolicy,
  });
  console.log(`Frozen ${Object.keys(pins).length} pins; zero model calls.`);
} else if (["export", "evaluate"].includes(process.argv[2])) {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "lock.json")));
  for (const [file, expected] of Object.entries(lock.pins))
    assert.equal(digest(path.join(root, file)), expected);
  if (process.argv[2] === "evaluate") {
    const artifacts = JSON.parse(fs.readFileSync(path.join(run, "export-pins.json")));
    for (const [file, expected] of Object.entries(artifacts))
      assert.equal(digest(path.join(root, file)), expected);
  }
  const result = spawnSync(
    "/usr/bin/sandbox-exec",
    [
      "-p",
      lock.networkPolicy,
      path.join(root, lock.python),
      "-I",
      path.join(root, "scripts/qa/siglip-mobile.py"),
      process.argv[2],
      path.relative(root, run),
    ],
    {
      cwd: root,
      timeout: process.argv[2] === "export" ? 600000 : 180000,
      maxBuffer: 4_000_000,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        TOKENIZERS_PARALLELISM: "false",
      },
    },
  );
  fs.writeFileSync(path.join(run, `${process.argv[2]}.stdout`), result.stdout ?? "", {
    flag: "wx",
  });
  fs.writeFileSync(path.join(run, `${process.argv[2]}.stderr`), result.stderr ?? "", {
    flag: "wx",
  });
  write(`${process.argv[2]}-process.json`, {
    status: result.status,
    signal: result.signal,
    errorCode: result.error?.code ?? null,
  });
  assert.equal(result.status, 0, "stage_failed_receipts_retained");
  if (process.argv[2] === "export") {
    const artifacts = {};
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const f = path.join(dir, name);
        assert(!fs.lstatSync(f).isSymbolicLink());
        if (fs.statSync(f).isDirectory()) walk(f);
        else artifacts[path.relative(root, f)] = digest(f);
      }
    };
    for (const arm of ["fp16", "int8"]) walk(path.join(run, `vision-${arm}.mlpackage`));
    for (const name of fs
      .readdirSync(run)
      .filter(
        (n) =>
          n.endsWith("-input.npy") ||
          ["text-prototypes.json", "baseline.json", "vision-fp32.safetensors"].includes(n),
      ))
      artifacts[path.relative(root, path.join(run, name))] = digest(path.join(run, name));
    write("export-pins.json", artifacts);
    console.log("Actual export completed; artifacts pinned.");
  } else {
    const result = JSON.parse(fs.readFileSync(path.join(run, "results.json")));
    write("assessment.json", assessMobileParity(result));
    console.log(JSON.stringify(assessMobileParity(result)));
  }
} else if (process.argv[2] === "review") {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "lock.json"))),
    artifacts = JSON.parse(fs.readFileSync(path.join(run, "export-pins.json")));
  for (const [file, expected] of Object.entries({ ...lock.pins, ...artifacts }))
    assert.equal(digest(path.join(root, file)), expected);
  const r = JSON.parse(fs.readFileSync(path.join(run, "results.json"))),
    assessment = assessMobileParity(r);
  const prototypes = JSON.parse(fs.readFileSync(path.join(run, "text-prototypes.json"))).vectors;
  for (const [arm, value] of Object.entries(r.arms))
    for (const row of value.rows)
      if (!row.failure) {
        const base = r.baseline.find((b) => b.id === row.id);
        const cosine = row.vector.reduce((sum, x, i) => sum + x * base.vector[i], 0);
        assert(Math.abs(cosine - row.embeddingCosine) < 1e-10);
        const scores = prototypes.map((v) => v.reduce((sum, x, i) => sum + x * row.vector[i], 0));
        assert(Math.max(...scores.map((s, i) => Math.abs(s - row.scores[i]))) < 1e-10);
        assert.equal(lock.classes[scores.indexOf(Math.max(...scores))], row.top1);
        assert(
          Math.abs(
            Math.max(...scores.map((s, i) => Math.abs(s - base.scores[i]))) - row.maxScoreError,
          ) < 1e-10,
        );
        assert.equal(
          JSON.parse(fs.readFileSync(path.join(run, `${arm}-${row.id}.json`))).top1,
          row.top1,
        );
      }
  assert.deepEqual(assessment, JSON.parse(fs.readFileSync(path.join(run, "assessment.json"))));
  console.log(JSON.stringify({ verified: true, assessment }, null, 2));
} else throw Error("usage: siglip-mobile-run.mjs prepare|export|evaluate|review work/RUN");
