// Run reviewed upstream tag assertions against the actual hash-pinned parser.
// Usage: PICOMATCH_QA_VERSION=4.0.7 PICOMATCH_QA_SOURCE=/reviewed/tag-checkout
//   node --test --test-concurrency=1 --test-timeout=120000 scripts/qa/picomatch-upstream.cjs
// This is a Node BDD adapter, not a claim to have run upstream's Mocha CI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const bdd = require("node:test");
for (const key of ["describe", "it", "before", "after", "beforeEach", "afterEach"]) {
  global[key] = bdd[key];
}
const root = path.resolve(__dirname, "../..");
const version = process.env.PICOMATCH_QA_VERSION;
assert(["2.3.2", "4.0.5", "4.0.7"].includes(version));
assert(process.env.PICOMATCH_QA_SOURCE, "Provide a previously reviewed upstream tag checkout");
const upstream = fs.realpathSync(process.env.PICOMATCH_QA_SOURCE);
assert.equal(JSON.parse(fs.readFileSync(path.join(upstream, "package.json"))).version, version);
// Capture before v2 tests deliberately change path.sep in their Windows hooks.
const prefix = upstream + path.sep;
const libPrefix = `lib${path.sep}`;
const lock = fs.readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8").replaceAll("\r\n", "\n");
const hash = lock.match(
  new RegExp(`^  picomatch@${version.replaceAll(".", "\\.")}: ([a-f0-9]{64})$`, "m"),
)?.[1];
assert(hash);
const target =
  process.env.PICOMATCH_QA_BASELINE === "true"
    ? upstream
    : path.join(
        root,
        "node_modules/.pnpm",
        `picomatch@${version}_patch_hash=${hash}`,
        "node_modules/picomatch",
      );
assert.equal(JSON.parse(fs.readFileSync(path.join(target, "package.json"))).version, version);
const micromatchRequire = Module.createRequire(
  path.join(root, "node_modules/.pnpm/micromatch@4.0.8/node_modules/micromatch/package.json"),
);
const bracesRequire = Module.createRequire(micromatchRequire.resolve("braces/package.json"));
const fillRange = bracesRequire.resolve("fill-range");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "fill-range") return fillRange;
  const resolved = original.call(this, request, parent, ...rest);
  if (typeof resolved === "string" && resolved.startsWith(prefix)) {
    const relative = path.relative(upstream, resolved);
    if (relative === "index.js" || relative === "posix.js" || relative.startsWith(libPrefix)) {
      return path.join(target, relative);
    }
  }
  return resolved;
};
for (const name of fs.readdirSync(path.join(upstream, "test")).sort()) {
  if (name.endsWith(".js")) require(path.join(upstream, "test", name));
}
process.on("beforeExit", () => {
  assert(require.cache[path.join(target, "lib/parse.js")], "Actual target parser was loaded");
});
