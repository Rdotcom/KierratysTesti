import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { patchedPicomatch, versions } from "../qa/picomatch-hardening.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("every locked picomatch version and runtime edge uses its exact reviewed patch", () => {
  const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8").replaceAll("\r\n", "\n");
  assert.match(
    readFileSync(join(root, ".gitattributes"), "utf8"),
    /^patches\/\*\.patch text eol=lf$/mu,
  );
  const workspace = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const packages = lock.split("\npackages:\n")[1].split("\nsnapshots:\n")[0];
  const actual = [...packages.matchAll(/^ {2}picomatch@([^:]+):$/gmu)].map((match) => match[1]);
  assert.deepEqual(actual, versions);
  for (const version of actual) {
    patchedPicomatch(version);
    assert.ok(workspace.includes(`picomatch@${version}: patches/picomatch@${version}.patch`));
  }
  const snapshots = lock.split("\nsnapshots:\n")[1];
  const edges = [...snapshots.matchAll(/^ {6}picomatch: (.+)$/gmu)];
  assert.ok(edges.length >= 8);
  for (const [, edge] of edges) {
    const match = /^(\d+\.\d+\.\d+)\(patch_hash=([a-f0-9]{64})\)$/u.exec(edge);
    assert.ok(match, `Unpatched runtime edge: ${edge}`);
    assert.ok(lock.includes(`  picomatch@${match[1]}: ${match[2]}\n`));
  }
});

test("actual Expo, Metro, Vite, tinyglobby and micromatch consumer resolution is patched", () => {
  const mobileRequire = createRequire(join(root, "mobile/app/package.json"));
  const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
  const rootRequire = createRequire(join(root, "package.json"));
  const consumers = [
    expoRequire.resolve("@expo/cli/package.json"),
    expoRequire.resolve("@expo/metro-config/package.json"),
    rootRequire.resolve("vite/package.json"),
  ];
  const viteRequire = createRequire(consumers[2]);
  consumers.push(viteRequire.resolve("tinyglobby/package.json"));
  const metroRequire = createRequire(consumers[1]);
  consumers.push(metroRequire.resolve("micromatch/package.json"));
  for (const consumer of consumers) {
    const entry = createRequire(consumer).resolve("picomatch");
    const version = JSON.parse(readFileSync(join(dirname(entry), "package.json"), "utf8")).version;
    assert.equal(dirname(entry), patchedPicomatch(version).directory);
  }
});

for (const version of versions) {
  test(`picomatch ${version} rejects adversarial near misses within a bounded subprocess`, () => {
    const worker = spawnSync(
      process.execPath,
      ["--max-old-space-size=128", join(root, "scripts/qa/picomatch-hardening.mjs"), version],
      { encoding: "utf8", timeout: 10_000, maxBuffer: 32_768, windowsHide: true },
    );
    assert.ifError(worker.error);
    assert.equal(worker.signal, null);
    assert.equal(worker.status, 0, worker.stderr);
    const receipt = JSON.parse(worker.stdout);
    assert.equal(receipt.version, version);
    assert.equal(receipt.checks, 195);
    assert.equal(receipt.malformedClassCompiled, true);
    assert.ok(Number.isFinite(receipt.maximumMs));
  });

  test(`picomatch ${version} preserves simple repeated-star matching and ordinary globs`, () => {
    const { picomatch: pm } = patchedPicomatch(version);
    for (const options of [{}, { windows: true }, { dot: true }, { bash: true }]) {
      for (const [value, pattern, expected] of [
        ["a", "+(*a)", true],
        ["aaaa", "+(*a)", true],
        ["baba", "+(*a)", true],
        ["", "+(*a)", false],
        ["", "*(*a)", false],
        ["abc", "+(*)c", true],
        ["c", "+(*?)c", false],
        ["abc", "+(*?)c", true],
        ["aaabc", "+(*[ab])c", true],
        ["bbc", "+(*[ab])c", true],
        ["ac", "+(**a)c", true],
        ["mobile/app/home.tsx", "**/*.{ts,tsx}", true],
        ["mobile/app/home.png", "**/*.{ts,tsx}", false],
        ["main.test.ts", "*.test.ts", true],
        ["src/main.ts", "src/!(*.test).ts", true],
        ["src/main.test.ts", "src/!(*.test).ts", false],
        ["foo/bar.ts", "@(foo|baz)/*.ts", true],
        ["ffo", "*(f*(o))", true],
        ["a*a*", '+("a*")', true],
        ["aaaa", '+("a*")', false],
        ["a*a*", "+(a\\*)", true],
        ["aaaa", "+(a\\*)", false],
        ["***", "+([*])", true],
      ]) {
        assert.equal(
          pm.isMatch(value, pattern, options),
          expected,
          `${version} ${pattern} ${value}`,
        );
      }
    }
  });

  test(`picomatch ${version} fails closed for new complex-star and capture cases`, () => {
    const { picomatch: pm } = patchedPicomatch(version);
    for (const pattern of ["+(*a/b)", "+(@(*a))", "+(*[!b])", "+(*[a-z])"]) {
      assert.equal(pm.isMatch("aaaa", pattern), false);
      assert.equal(pm.isMatch(pattern, pattern), true);
    }
    assert.equal(pm.isMatch("aaaa", "+(*a)", { capture: true }), false);
    assert.equal(pm.isMatch("+(*a)", "+(*a)", { capture: true }), true);
    // Preserve ordinary capture behavior; only the vulnerable forms fail closed.
    assert.deepEqual(pm.makeRe("foo/(*)", { capture: true }).exec("foo/bar")?.slice(1), [
      "bar",
      "bar",
    ]);
    // An explicit upstream security opt-out remains an opt-out. Never execute it
    // against adversarial input, and do not describe this patch as covering it.
    assert.notEqual(
      pm.makeRe("+(*a)").source,
      pm.makeRe("+(*a)", { maxExtglobRecursion: false }).source,
    );
  });
}
