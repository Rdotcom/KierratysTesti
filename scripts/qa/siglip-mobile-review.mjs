import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessMobileParity } from "./siglip-mobile-policy.mjs";
import { reviewVectorParity } from "./siglip-mobile-evidence.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const read = (p) => JSON.parse(fs.readFileSync(path.join(run, p)));
function hash(p) {
  assert(fs.realpathSync(p) === p && fs.lstatSync(p).isFile());
  const h = createHash("sha256"),
    fd = fs.openSync(p, "r"),
    b = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, b, 0, b.length, null);
      if (!n) break;
      h.update(b.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}
const archive = read("failed-recovery-source/index.json");
for (const name of [
  "lock.json",
  "recovery-lock.json",
  "recovery-v2-lock.json",
  "precision-lock.json",
  "storage-lock.json",
  "block-lock.json",
])
  for (const [p, h] of Object.entries(read(name).pins)) {
    const mapped = name === "recovery-lock.json" ? archive.find((r) => r.original === p) : null;
    if (mapped) assert.equal(mapped.sha256, h);
    assert.equal(hash(path.join(root, mapped?.archived ?? p)), h, `${name}:${p}`);
  }
for (const name of [
  "recovery-v2/export-pins.json",
  "storage/export-pins.json",
  "block/export-pins.json",
])
  for (const [p, h] of Object.entries(read(name))) assert.equal(hash(path.join(root, p)), h);
for (const [p, status] of [
  ["export-process.json", 1],
  ["recovery/convert-process.json", 1],
  ["recovery-v2/convert-process.json", 0],
  ["recovery-v2/evaluate-process.json", 0],
  ["precision/process.json", 0],
  ["storage/convert-process.json", 0],
  ["block/process.json", 0],
])
  assert.equal(read(p).status, status);
assert.equal(read("storage/synthetic.json").passed, false);
assert.equal(read("block/synthetic.json").passed, true);
assert.equal(read("block/compressed-constants.json").length, 72);
const original = read("recovery-v2/results.json"),
  baseline = read("baseline.json"),
  text = read("text-prototypes.json"),
  lock = read("lock.json");
assert.deepEqual(text.classes, lock.classes);
assert.deepEqual(original.baseline, baseline);
for (const row of baseline) {
  const parent = lock.rows.find((r) => r.id === row.id);
  assert(parent);
  assert.equal(
    row.parentScoreMaxError,
    Math.max(...row.scores.map((x, i) => Math.abs(x - parent.parentScores[i]))),
  );
}
const recount = {};
for (const [arm, result] of Object.entries(original.arms))
  recount[`original-${arm}`] = reviewVectorParity(result, baseline, text.vectors, lock.classes);
const candidate = read("block/results.json");
for (const row of candidate.rows) assert.deepEqual(row, read(`block/${row.id}.json`));
recount.block32 = reviewVectorParity(candidate, baseline, text.vectors, lock.classes);
const pins = read("block/export-pins.json"),
  files = [];
const walk = (dir) => {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    assert(!fs.lstatSync(p).isSymbolicLink());
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push(path.relative(root, p));
  }
};
walk(path.join(run, "block/vision-int8-block32.mlpackage"));
assert.deepEqual(files.sort(), Object.keys(pins).sort());
assert.equal(
  candidate.resourcesBytes,
  files.reduce((sum, p) => sum + fs.statSync(path.join(root, p)).size, 0) +
    fs.statSync(path.join(run, "text-prototypes.json")).size,
);
const revised = { ...original, arms: { ...original.arms, int8: candidate } };
assert.deepEqual(assessMobileParity(original), read("recovery-v2/assessment.json"));
assert.deepEqual(assessMobileParity(revised), read("block/assessment.json"));
console.log(
  JSON.stringify(
    {
      verified: true,
      recount,
      resourcesBytes: candidate.resourcesBytes,
      assessment: assessMobileParity(revised),
    },
    null,
    2,
  ),
);
