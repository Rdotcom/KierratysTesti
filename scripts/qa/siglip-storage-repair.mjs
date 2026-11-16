import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessMobileParity } from "./siglip-mobile-policy.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[3]);
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
const write = (name, value) =>
  fs.writeFileSync(path.join(run, name), JSON.stringify(value, null, 2), { flag: "wx" });
if (process.argv[2] === "prepare") {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "precision-lock.json")));
  collect(path.join(run, "precision"), lock.pins);
  for (const file of [
    "scripts/qa/siglip-storage-repair.py",
    "scripts/qa/siglip-storage-repair.mjs",
    "docs/research/siglip-fp32-compute-int8-repair-2026-11-16.md",
  ])
    lock.pins[file] = hash(path.join(root, file));
  lock.pins[path.relative(root, path.join(run, "recovery-v2/results.json"))] = hash(
    path.join(run, "recovery-v2/results.json"),
  );
  for (const [p, h] of Object.entries(lock.pins)) assert.equal(hash(path.join(root, p)), h);
  fs.mkdirSync(path.join(run, "storage"));
  write("storage-lock.json", lock);
} else if (["convert", "evaluate"].includes(process.argv[2])) {
  const lock = JSON.parse(fs.readFileSync(path.join(run, "storage-lock.json")));
  for (const [p, h] of Object.entries(lock.pins)) assert.equal(hash(path.join(root, p)), h);
  if (process.argv[2] === "evaluate")
    for (const [p, h] of Object.entries(
      JSON.parse(fs.readFileSync(path.join(run, "storage/export-pins.json"))),
    ))
      assert.equal(hash(path.join(root, p)), h);
  const r = spawnSync(
    "/usr/bin/sandbox-exec",
    [
      "-p",
      lock.networkPolicy,
      path.join(root, lock.python),
      "-I",
      path.join(root, "scripts/qa/siglip-storage-repair.py"),
      process.argv[2],
      path.relative(root, run),
    ],
    {
      cwd: root,
      timeout: 300000,
      maxBuffer: 4000000,
      env: { ...process.env, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" },
    },
  );
  for (const [s, d] of [
    ["stdout", r.stdout],
    ["stderr", r.stderr],
  ])
    fs.writeFileSync(path.join(run, `storage/${process.argv[2]}.${s}`), d ?? "", { flag: "wx" });
  write(`storage/${process.argv[2]}-process.json`, {
    status: r.status,
    signal: r.signal,
    errorCode: r.error?.code ?? null,
  });
  assert.equal(r.status, 0, "repair_failed_retained");
  if (process.argv[2] === "convert") {
    const pins = {};
    collect(path.join(run, "storage/vision-int8-fp32.mlpackage"), pins);
    pins[path.relative(root, path.join(run, "storage/synthetic.json"))] = hash(
      path.join(run, "storage/synthetic.json"),
    );
    write("storage/export-pins.json", pins);
    console.log(fs.readFileSync(path.join(run, "storage/synthetic.json"), "utf8"));
  } else {
    const r = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/results.json")));
    r.arms.int8 = JSON.parse(fs.readFileSync(path.join(run, "storage/results.json")));
    write("storage/assessment.json", assessMobileParity(r));
    console.log(JSON.stringify(assessMobileParity(r)));
  }
} else throw Error("prepare|convert|evaluate work/RUN");
