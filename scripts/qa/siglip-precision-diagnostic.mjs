import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const lock = JSON.parse(fs.readFileSync(path.join(run, "recovery-v2-lock.json")));
for (const file of [
  "scripts/qa/siglip-precision-diagnostic.py",
  "scripts/qa/siglip-precision-diagnostic.mjs",
  "scripts/qa/protocols/siglip-precision-diagnostic-2026-11-16.md",
])
  lock.pins[file] = createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");
Object.assign(
  lock.pins,
  JSON.parse(fs.readFileSync(path.join(run, "recovery-v2/export-pins.json"))),
);
fs.mkdirSync(path.join(run, "precision"));
fs.writeFileSync(path.join(run, "precision-lock.json"), JSON.stringify(lock, null, 2), {
  flag: "wx",
});
const r = spawnSync(
  "/usr/bin/sandbox-exec",
  [
    "-p",
    lock.networkPolicy,
    path.join(root, lock.python),
    "-I",
    path.join(root, "scripts/qa/siglip-precision-diagnostic.py"),
    path.relative(root, run),
  ],
  {
    cwd: root,
    timeout: 600000,
    maxBuffer: 4000000,
    env: { ...process.env, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" },
  },
);
for (const [suffix, data] of [
  ["stdout", r.stdout],
  ["stderr", r.stderr],
])
  fs.writeFileSync(path.join(run, `precision/${suffix}`), data ?? "", { flag: "wx" });
fs.writeFileSync(
  path.join(run, "precision/process.json"),
  JSON.stringify({ status: r.status, signal: r.signal, errorCode: r.error?.code ?? null }),
  { flag: "wx" },
);
assert.equal(r.status, 0, "diagnostic_failed_retained");
console.log(fs.readFileSync(path.join(run, "precision/results.json"), "utf8"));
