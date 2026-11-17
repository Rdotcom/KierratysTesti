import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

// Bind tests to active, hash-pinned packages, not obsolete virtual-store copies.
export function patchedPicomatch(version) {
  assert.match(version, /^\d+\.\d+\.\d+$/u);
  const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8").replaceAll("\r\n", "\n");
  const entries = [...lock.matchAll(/^ {2}picomatch@(\d+\.\d+\.\d+): ([a-f0-9]{64})$/gmu)];
  const hash = entries.find((entry) => entry[1] === version)?.[2];
  assert.ok(hash, `Missing picomatch@${version} patch hash`);
  const patch = readFileSync(join(root, "patches", `picomatch@${version}.patch`));
  assert.equal(createHash("sha256").update(patch).digest("hex"), hash);
  const directory = join(
    root,
    "node_modules/.pnpm",
    `picomatch@${version}_patch_hash=${hash}`,
    "node_modules/picomatch",
  );
  assert.equal(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).version, version);
  assert.match(readFileSync(join(directory, "lib/parse.js"), "utf8"), /CVE-2026-112366/u);
  return { directory: realpathSync(directory), picomatch: require(directory) };
}

export const versions = ["2.3.2", "4.0.5", "4.0.7"];

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

export function adversarialProbe(version) {
  const { picomatch } = patchedPicomatch(version);
  const settings = [{}, { capture: true }, { windows: true }, { bash: true }, { dot: true }];
  let checks = 0;
  let maximumMs = 0;
  for (const options of settings) {
    for (const pattern of attackPatterns) {
      const regex = picomatch.makeRe(pattern, options);
      for (const length of [32, 512, 4096]) {
        const before = performance.now();
        assert.equal(regex.test(`${"a".repeat(length)}b`), false, `${version} ${pattern}`);
        maximumMs = Math.max(maximumMs, performance.now() - before);
        checks++;
      }
    }
  }
  // A malformed class must not make the new classifier rescan every suffix.
  picomatch.makeRe(`+(*${"[".repeat(4096)})`);
  return { version, checks, maximumMs, malformedClassCompiled: true };
}

if (import.meta.main) {
  assert.ok(versions.includes(process.argv[2]));
  console.log(JSON.stringify(adversarialProbe(process.argv[2])));
}
