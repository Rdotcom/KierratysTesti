import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessMobileParity } from "./siglip-mobile-policy.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const hash = (file) => {
  assert(fs.realpathSync(file) === file && fs.lstatSync(file).isFile());
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
};
const collect = (dir, pins) => {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    assert(!fs.lstatSync(file).isSymbolicLink());
    if (fs.statSync(file).isDirectory()) collect(file, pins);
    else pins[path.relative(root, file)] = hash(file);
  }
};
const lock = JSON.parse(fs.readFileSync(path.join(run, "storage-lock.json")));
collect(path.join(run, "storage"), lock.pins);
for (const file of [
  "scripts/qa/siglip-block-repair.py",
  "scripts/qa/siglip-block-repair.mjs",
  "scripts/qa/protocols/siglip-block-storage-repair-2026-11-16.md",
])
  lock.pins[file] = hash(path.join(root, file));
for (const [p, h] of Object.entries(lock.pins)) assert.equal(hash(path.join(root, p)), h);
fs.mkdirSync(path.join(run, "block"));
fs.writeFileSync(path.join(run, "block-lock.json"), JSON.stringify(lock, null, 2), { flag: "wx" });
const r = spawnSync(
  "/usr/bin/sandbox-exec",
  [
    "-p",
    lock.networkPolicy,
    path.join(root, lock.python),
    "-I",
    path.join(root, "scripts/qa/siglip-block-repair.py"),
    path.relative(root, run),
  ],
  {
    cwd: root,
    timeout: 600000,
    maxBuffer: 4000000,
    env: { ...process.env, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" },
  },
);
for (const [s, d] of [
  ["stdout", r.stdout],
  ["stderr", r.stderr],
])
  fs.writeFileSync(path.join(run, `block/${s}`), d ?? "", { flag: "wx" });
fs.writeFileSync(
  path.join(run, "block/process.json"),
  JSON.stringify({ status: r.status, signal: r.signal, errorCode: r.error?.code ?? null }),
  { flag: "wx" },
);
assert.equal(r.status, 0, "block_repair_failed_retained");
const results = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/results.json")));
results.arms.int8 = JSON.parse(fs.readFileSync(path.join(run, "block/results.json")));
const assessment = assessMobileParity(results);
fs.writeFileSync(path.join(run, "block/assessment.json"), JSON.stringify(assessment, null, 2), {
  flag: "wx",
});
console.log(JSON.stringify(assessment));
