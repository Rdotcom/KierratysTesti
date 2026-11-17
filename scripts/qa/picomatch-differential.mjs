// Short, exhaustive samples only: never feed long hostile strings to baselines.
// Argument: directory holding reviewed upstream-v2 / upstream-v405 / upstream-v4 tags.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { patchedPicomatch, versions } from "./picomatch-hardening.mjs";

const require = createRequire(import.meta.url);
assert.ok(process.argv[2], "Provide the reviewed upstream checkout parent directory");
const originals = { "2.3.2": "upstream-v2", "4.0.5": "upstream-v405", "4.0.7": "upstream-v4" };
const values = [""];
let level = [""];
for (let index = 0; index < 5; index++) {
  level = level.flatMap((value) => ["a", "b", "c", ".", "/"].map((char) => value + char));
  values.push(...level);
}
const patterns = [
  "+(*a)",
  "*(*a)",
  "+(*)c",
  "+(*?)c",
  "+(a?*)c",
  "+(*[ab])c",
  "+(**a)c",
  "+(*a*)c",
  "+(*?a*)c",
  "+([ab]*c)",
  "x+(*a)y",
  "*(a*)b",
];
const options = [
  {},
  { windows: true },
  { dot: true },
  { bash: true },
  { literalBrackets: true },
  { unescape: true },
  { regex: false },
  { strictSlashes: true },
];
for (const version of versions) {
  const baseline = resolve(process.argv[2], originals[version]);
  assert.equal(JSON.parse(readFileSync(resolve(baseline, "package.json"))).version, version);
  const before = require(baseline);
  const { picomatch: after } = patchedPicomatch(version);
  let comparisons = 0;
  for (const pattern of patterns) {
    for (const setting of options) {
      const original = before.makeRe(pattern, setting);
      const patched = after.makeRe(pattern, setting);
      for (const value of values) {
        assert.equal(
          patched.test(value),
          original.test(value),
          `${version}: ${pattern}, ${JSON.stringify(setting)}, ${value}`,
        );
        comparisons++;
      }
    }
  }
  console.log(JSON.stringify({ version, comparisons, mismatches: 0 }));
}
