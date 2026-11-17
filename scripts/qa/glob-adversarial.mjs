import assert from "node:assert/strict";
import glob from "../glob-adapter/index.cjs";

export const attackPatterns = [
  "+(*a)",
  "*(*a)",
  "+(*)c",
  "+(*?)c",
  "+(a?*)c",
  "+(*[ab])c",
  "+(**a)c",
  "+(*a/b)c",
  "+(@(*a))c",
  "+(*[a-z])c",
  "+(*[!b])c",
  "+(*\\a)c",
  '+(*"a")c',
];

export function adversarialProbe() {
  let checks = 0;
  let maximumMs = 0;
  for (const options of [{}, { dot: true }, { nocase: true }, { windows: true }]) {
    for (const pattern of attackPatterns) {
      const matcher = glob(pattern, options);
      for (const length of [32, 512, 4096]) {
        const start = performance.now();
        assert.equal(matcher(`${"a".repeat(length)}b`), false, pattern);
        maximumMs = Math.max(maximumMs, performance.now() - start);
        checks++;
      }
    }
  }
  for (const length of [32, 512, 4096]) {
    assert.equal(glob(`${"a*".repeat(32)}z`)(`${"a".repeat(length)}b`), false);
    checks++;
  }
  // A malformed class is still bounded without rescanning every suffix.
  assert.throws(() => glob(`+(*${"[".repeat(4000)})`), RangeError);
  assert.equal(glob("+(*a)")("aaaa"), true);
  assert.equal(glob("+(@(*a))c")("aaaac"), true);
  assert.throws(() => glob("a".repeat(4097)), RangeError);
  assert.throws(() => glob("a")("a".repeat(32769)), RangeError);
  assert.throws(() => glob("{a,b}".repeat(64)), /expan|large|limit/i);
  return { checks, maximumMs, positiveControls: 2, bounded: true };
}

if (import.meta.main) console.log(JSON.stringify(adversarialProbe()));
