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
  const hash = createHash("sha256"),
    fd = fs.openSync(file, "r"),
    b = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, b, 0, b.length, null);
      if (!n) break;
      hash.update(b.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}
const write = (file, value) =>
  fs.writeFileSync(path.join(run, file), JSON.stringify(value, null, 2), { flag: "wx" });
const collect = (dir, pins) => {
  for (const name of fs.readdirSync(dir)) {
    const f = path.join(dir, name);
    assert(!fs.lstatSync(f).isSymbolicLink());
    if (fs.statSync(f).isDirectory()) {
      if (name !== "__pycache__") collect(f, pins);
    } else if (!name.endsWith(".pyc")) pins[path.relative(root, f)] = digest(f);
  }
};
if (process.argv[2] === "prepare") {
  const first = JSON.parse(fs.readFileSync(path.join(run, "lock.json"))),
    pins = { ...first.pins };
  for (const [file, expected] of Object.entries(pins))
    assert.equal(digest(path.join(root, file)), expected);
  for (const name of fs
    .readdirSync(run)
    .filter(
      (n) =>
        n.endsWith("-input.npy") ||
        n.endsWith("-reference.json") ||
        [
          "baseline.json",
          "text-prototypes.json",
          "vision-fp32.safetensors",
          "lock.json",
          "export-process.json",
        ].includes(n),
    ))
    pins[path.relative(root, path.join(run, name))] = digest(path.join(run, name));
  assert.equal(JSON.parse(fs.readFileSync(path.join(run, "export-process.json"))).status, 1);
  collect(path.join(run, "numpy-compat"), pins);
  for (const file of [
    "scripts/qa/siglip-mobile-recover.py",
    "scripts/qa/siglip-mobile-recover-run.mjs",
    "docs/research/siglip-mobile-converter-recovery-2026-11-16.md",
  ])
    pins[file] = digest(path.join(root, file));
  collect(path.join(run, "failed-recovery-source"), pins);
  fs.mkdirSync(path.join(run, "recovery-v2"));
  write("recovery-v2-lock.json", { ...first, pins });
  console.log(
    `Recovery frozen ${Object.keys(pins).length} pins; reference images will NOT be repeated.`,
  );
} else if (["convert", "evaluate"].includes(process.argv[2])) {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2-lock.json")));
  for (const [file, expected] of Object.entries(lock.pins))
    assert.equal(digest(path.join(root, file)), expected);
  if (process.argv[2] === "evaluate")
    for (const [file, expected] of Object.entries(
      JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/export-pins.json"))),
    ))
      assert.equal(digest(path.join(root, file)), expected);
  const r = spawnSync(
    "/usr/bin/sandbox-exec",
    [
      "-p",
      lock.networkPolicy,
      path.join(root, lock.python),
      "-I",
      path.join(root, "scripts/qa/siglip-mobile-recover.py"),
      process.argv[2],
      path.relative(root, run),
    ],
    {
      cwd: root,
      timeout: process.argv[2] === "convert" ? 600000 : 180000,
      maxBuffer: 4_000_000,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        TOKENIZERS_PARALLELISM: "false",
      },
    },
  );
  for (const [suffix, data] of [
    ["stdout", r.stdout],
    ["stderr", r.stderr],
  ])
    fs.writeFileSync(path.join(run, `recovery-v2/${process.argv[2]}.${suffix}`), data ?? "", {
      flag: "wx",
    });
  write(`recovery-v2/${process.argv[2]}-process.json`, {
    status: r.status,
    signal: r.signal,
    errorCode: r.error?.code ?? null,
  });
  assert.equal(r.status, 0, "recovery_failed_retained");
  if (process.argv[2] === "convert") {
    const pins = {};
    for (const arm of ["fp16", "int8"])
      collect(path.join(run, `recovery-v2/vision-${arm}.mlpackage`), pins);
    write("recovery-v2/export-pins.json", pins);
    console.log("Recovered conversion completed and pinned.");
  } else {
    const r = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/results.json")));
    write("recovery-v2/assessment.json", assessMobileParity(r));
    console.log(JSON.stringify(assessMobileParity(r)));
  }
} else if (process.argv[2] === "review") {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2-lock.json"))),
    artifacts = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/export-pins.json")));
  for (const [file, expected] of Object.entries({ ...lock.pins, ...artifacts }))
    assert.equal(digest(path.join(root, file)), expected);
  const r = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/results.json"))),
    prototypes = JSON.parse(fs.readFileSync(path.join(run, "text-prototypes.json"))).vectors;
  assert.deepEqual(r.baseline, JSON.parse(fs.readFileSync(path.join(run, "baseline.json"))));
  for (const [arm, value] of Object.entries(r.arms)) {
    const dir = path.join(run, `recovery-v2/vision-${arm}.mlpackage`);
    const size =
      Object.keys(artifacts)
        .filter((p) => path.join(root, p).startsWith(dir + path.sep))
        .reduce((sum, p) => sum + fs.statSync(path.join(root, p)).size, 0) +
      fs.statSync(path.join(run, "text-prototypes.json")).size;
    assert.equal(size, value.resourcesBytes);
    for (const row of value.rows) {
      assert.deepEqual(
        row,
        JSON.parse(fs.readFileSync(path.join(run, `recovery-v2/${arm}-${row.id}.json`))),
      );
      if (row.failure) continue;
      assert(row.vector.length === 768 && row.vector.every(Number.isFinite));
      const norm = Math.sqrt(row.vector.reduce((sum, x) => sum + x * x, 0));
      assert(Math.abs(norm - 1) < 1e-10);
      const reference = r.baseline.find((b) => b.id === row.id);
      const scores = prototypes.map((v) => v.reduce((sum, x, i) => sum + x * row.vector[i], 0));
      const error = Math.max(...scores.map((x, i) => Math.abs(x - reference.scores[i])));
      const cosine = row.vector.reduce((sum, x, i) => sum + x * reference.vector[i], 0);
      assert(
        Math.abs(error - row.maxScoreError) < 1e-10 &&
          Math.abs(cosine - row.embeddingCosine) < 1e-10,
      );
      assert.equal(lock.classes[scores.indexOf(Math.max(...scores))], row.top1);
    }
  }
  assert.deepEqual(
    assessMobileParity(r),
    JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/assessment.json"))),
  );
  console.log(JSON.stringify({ verified: true, assessment: assessMobileParity(r) }, null, 2));
} else throw Error("prepare|convert|evaluate|review work/RUN");
