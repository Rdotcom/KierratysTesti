import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import glob from "../glob-adapter/index.cjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(join(root, file), "utf8").replaceAll("\r\n", "\n");
const mobileRequire = createRequire(join(root, "mobile/app/package.json"));
const expoRequire = createRequire(mobileRequire.resolve("expo/package.json"));
const viteRequire = createRequire(require.resolve("vite/package.json"));
const tinyRequire = createRequire(viteRequire.resolve("tinyglobby/package.json"));
const metroRequire = createRequire(expoRequire.resolve("@expo/metro-config/package.json"));
const regularMetroRequire = createRequire(metroRequire.resolve("metro-file-map/package.json"));
const jestRequire = createRequire(regularMetroRequire.resolve("jest-worker/package.json"));

test("manifest migration only changes pinned implementation dependencies, never audit or versions", () => {
  const { hooks } = require("../../.pnpmfile.cjs");
  assert.deepEqual(Object.keys(hooks), ["readPackage"]);
  const unrelated = {
    name: "unrelated",
    version: "1.0.0",
    dependencies: { picomatch: "4.0.7", vulnerable: "1.0.0" },
  };
  assert.deepEqual(hooks.readPackage(structuredClone(unrelated)), unrelated);
  const future = { name: "vite", version: "99.0.0", dependencies: { picomatch: "4.0.7" } };
  assert.deepEqual(hooks.readPackage(structuredClone(future)), future);
  const pinned = {
    name: "fdir",
    version: "6.5.0",
    dependencies: { other: "1.2.3" },
    peerDependencies: { picomatch: "^4", other: "*" },
    peerDependenciesMeta: { picomatch: { optional: true } },
  };
  assert.deepEqual(hooks.readPackage(pinned), {
    name: "fdir",
    version: "6.5.0",
    dependencies: { other: "1.2.3", "@keepitgreen/build-glob": "workspace:*" },
    peerDependencies: { other: "*" },
    peerDependenciesMeta: {},
  });
});

test("frozen graph eliminates picomatch/micromatch rather than disguising their versions", () => {
  const lock = read("pnpm-lock.yaml");
  assert.doesNotMatch(lock, /(?:^|\n)\s+(?:['"])?(?:pico|micro)match(?:@|:)/u);
  assert.match(lock, /minimatch@11\.0\.9:/u);
  assert.match(read(".gitattributes"), /^\.pnpmfile\.cjs text eol=lf$/mu);
  const adapter = JSON.parse(read("scripts/glob-adapter/package.json"));
  assert.equal(adapter.name, "@keepitgreen/build-glob");
  assert.equal(adapter.dependencies.minimatch, "11.0.9");
  assert.doesNotMatch(read("scripts/glob-adapter/index.cjs"), /new RegExp|\.makeRe\(/u);
  assert.equal(glob.makeRe, undefined);
  assert.equal(glob.compileRe, undefined);
});

test("all eight actual tool consumers resolve the new implementation with pinned source patches", () => {
  const consumers = [
    expoRequire.resolve("@expo/cli/package.json"),
    expoRequire.resolve("@expo/metro-config/package.json"),
    require.resolve("vite/package.json"),
    require.resolve("vitest/package.json"),
    viteRequire.resolve("tinyglobby/package.json"),
    tinyRequire.resolve("fdir/package.json"),
    jestRequire.resolve("jest-util/package.json"),
    metroRequire.resolve("metro-file-map/package.json"),
  ];
  const adapterFile = realpathSync(require.resolve("@keepitgreen/build-glob"));
  const lock = read("pnpm-lock.yaml");
  for (const file of consumers) {
    const consumer = createRequire(file);
    assert.equal(realpathSync(consumer.resolve("@keepitgreen/build-glob")), adapterFile);
    for (const removed of ["picomatch", "micromatch"]) {
      assert.throws(() => consumer.resolve(removed), /Cannot find module|not defined by/u);
    }
    const { name, version } = JSON.parse(readFileSync(file, "utf8"));
    const patch = `patches/${name.replace("/", "__")}@${version}.patch`;
    const bytes = readFileSync(join(root, patch));
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(lock.includes(hash), `${name} patch must be hash-pinned`);
  }
  // This is the real ESM consumer, not a stubbed regexp-shaped object.
  const vite = readFileSync(join(dirname(consumers[2]), "dist/node/chunks/node.js"), "utf8");
  assert.doesNotMatch(vite, /pm\.makeRe\(/u);
  assert.match(vite, /if \(!config\.assetsInclude\(cleanUrl\(id\)\)/u);
});

test("original default/dot/case/basename/windows/brace/ignore matching contract is preserved", () => {
  const fixture = JSON.parse(read("scripts/qa/glob-contract.json"));
  let row = 0;
  for (const pattern of fixture.patterns) {
    for (const options of fixture.options) {
      // Golden outputs were frozen on POSIX. Explicit windows:true rows still
      // test separator conversion; native default selection is checked below.
      const matcher = glob(pattern, { windows: false, ...options });
      const expected = fixture.results[row++];
      for (const [i, value] of fixture.paths.entries()) {
        assert.equal(
          matcher(value),
          expected[i] === "1",
          JSON.stringify({ pattern, options, value }),
        );
      }
    }
  }
  assert.equal(row, fixture.results.length);
  assert.equal(glob("C:/src/*.ts")("C:\\src\\a.ts"), process.platform === "win32");
});

test("linear path scanner preserves literal roots and slash-containing groups", () => {
  for (const [pattern, base, parts] of [
    ["src/*.ts", "src", ["src", "*.ts"]],
    ["./src/*.ts", "src", ["src", "*.ts"]],
    ["!src/**/*.ts", "src", ["src", "**", "*.ts"]],
    ["/a/b/*.ts", "/a/b", ["", "a", "b", "*.ts"]],
    ["C:/src/*.ts", "C:/src", ["C:", "src", "*.ts"]],
    ["src/{a/b,c/d}/*.ts", "src", ["src", "{a/b,c/d}", "*.ts"]],
    ["src/@(a/b|c)/x", "src", ["src", "@(a/b|c)", "x"]],
    ["src/\\*.ts", "src/\\*.ts", ["src", "\\*.ts"]],
    ["foo//bar/*.js", "foo//bar", ["foo", "", "bar", "*.js"]],
    ["foo/", "foo/", ["foo", ""]],
    ["file.ts", "file.ts", ["file.ts"]],
  ]) {
    const state = glob.scan(pattern, { parts: true });
    assert.equal(state.base, base, pattern);
    assert.deepEqual(state.parts, parts, pattern);
  }
  assert.equal(glob.scan("!(foo)").negatedExtglob, true);
  assert.equal(glob.scan("!foo").negated, true);
  assert.equal(glob.scan("src/\\*.ts").isGlob, false);
  assert.equal(glob.scan("src/+(a").isGlob, true);
});

test("disable switches use literal extglobs and single-level globstars, not regex fast paths", () => {
  assert.equal(glob("src/@(a|b)/*.ts", { noextglob: true })("src/a/file.ts"), false);
  assert.equal(glob("src/@(a|b)/*.ts", { noextglob: true })("src/@(a|b)/file.ts"), true);
  assert.equal(glob("**/*.ts", { noglobstar: true })("a/b/c.ts"), false);
  assert.equal(glob("**/*.ts", { noglobstar: true })("a/b.ts"), true);
  assert.equal(glob("dir/**")("dir"), true);
  assert.equal(glob("dir/**", { noglobstar: true })("dir"), false);
  for (const options of [{ capture: true }, { contains: true }, { bash: true }]) {
    assert.throws(() => glob("**/*", options), /does not implement/u);
  }
});

test("original ReDoS families and malformed inputs remain bounded in a subprocess", () => {
  const worker = spawnSync(
    process.execPath,
    ["--max-old-space-size=128", join(root, "scripts/qa/glob-adversarial.mjs")],
    {
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 32768,
      windowsHide: true,
    },
  );
  assert.ifError(worker.error);
  assert.equal(worker.signal, null);
  assert.equal(worker.status, 0, worker.stderr);
  const receipt = JSON.parse(worker.stdout);
  assert.equal(receipt.checks, 159);
  assert.equal(receipt.positiveControls, 2);
  assert.equal(receipt.bounded, true);
});

test("input count, depth, types and paths fail explicitly instead of allowing unbounded work", () => {
  assert.throws(() => glob(new Array(1025).fill("*.js")), RangeError);
  assert.throws(() => glob(new Array(100).fill("a".repeat(1000))), RangeError);
  assert.throws(() => glob(new Array(8).fill("{a,b}".repeat(10))), RangeError);
  assert.throws(() => glob(`[${"{a,b}".repeat(32)}`), RangeError);
  assert.throws(() => glob.scan("(".repeat(65)), RangeError);
  assert.throws(() => glob.scan("a/".repeat(257)), RangeError);
  assert.throws(() => glob(42), TypeError);
  assert.throws(() => glob(["ok", null]), TypeError);
  assert.throws(() => glob("a\0b"), TypeError);
  assert.throws(() => glob("a")(null), TypeError);
  assert.equal(glob([])("a"), false);
});

test("actual Expo, ordered Jest exclusion and Metro watcher use the adapted matcher", () => {
  const cli = dirname(expoRequire.resolve("@expo/cli/package.json"));
  const { createGlobFilter } = require(join(cli, "build/src/utils/createFileTransform.js"));
  assert.equal(createGlobFilter(["**/*.png", "**/*.svg"], { dot: true })("dir/.icon.svg"), true);
  assert.equal(createGlobFilter("**/*.png")("dir/.icon.png"), false);
  const jestDir = dirname(jestRequire.resolve("jest-util/package.json"));
  const { default: globsToMatcher } = require(join(jestDir, "build/globsToMatcher.js"));
  const matcher = globsToMatcher(["**/*.ts", "!**/*.test.ts", "**/keep.test.ts"]);
  assert.equal(matcher("dir/a.ts"), true);
  assert.equal(matcher("dir/a.test.ts"), false);
  assert.equal(matcher("dir/keep.test.ts"), true);
  assert.equal(globsToMatcher(["!**/node_modules/**"])("node_modules/a.js"), false);
  const metroDir = dirname(metroRequire.resolve("metro-file-map/package.json"));
  const { includedByGlob } = require(join(metroDir, "src/watchers/common.js"));
  assert.equal(includedByGlob("f", ["**/*.js"], false, "dir/a.js"), true);
  assert.equal(includedByGlob("f", ["**/*.js"], false, "dir/.a.js"), false);
});

test("actual tinyglobby and fdir enumerate real files with exclusions and escaped names", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keepitgreen-glob-"));
  for (const file of [
    "a.ts",
    "b.test.ts",
    ".hidden.ts",
    "dir/c.ts",
    "dir/d.js",
    "literal[1].txt",
  ]) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), "fixture", { flag: "wx" });
  }
  const { globSync, glob: asyncGlob } = viteRequire("tinyglobby");
  const patterns = ["**/*.ts", "!**/*.test.ts"];
  assert.deepEqual(globSync(patterns, { cwd: directory }).sort(), ["a.ts", "dir/c.ts"]);
  assert.deepEqual((await asyncGlob(patterns, { cwd: directory, dot: true })).sort(), [
    ".hidden.ts",
    "a.ts",
    "dir/c.ts",
  ]);
  assert.deepEqual(globSync("literal\\[1\\].txt", { cwd: directory }), ["literal[1].txt"]);
  const { fdir } = tinyRequire("fdir");
  const files = new fdir().withRelativePaths().glob("**/*.ts").crawl(directory).sync();
  assert.deepEqual(files.map((f) => f.replaceAll("\\", "/")).sort(), [
    ".hidden.ts",
    "a.ts",
    "b.test.ts",
    "dir/c.ts",
  ]);
});

test("actual Vite builds import.meta.glob and custom assets without a regexp prefilter", async () => {
  const directory = mkdtempSync(join(tmpdir(), "keepitgreen-vite-"));
  mkdirSync(join(directory, "items"));
  writeFileSync(join(directory, "items/a.js"), "export const value = 1;", { flag: "wx" });
  writeFileSync(join(directory, "sample.odd"), "a custom asset", { flag: "wx" });
  writeFileSync(
    join(directory, "entry.js"),
    'import asset from "./sample.odd"; export const result = [asset, import.meta.glob("./items/*.js", {eager:true})];',
    { flag: "wx" },
  );
  const { build, createServer } = await import("vite");
  const output = await build({
    root: directory,
    configFile: false,
    logLevel: "silent",
    assetsInclude: ["**/*.odd"],
    build: {
      write: false,
      minify: false,
      assetsInlineLimit: 0,
      lib: { entry: join(directory, "entry.js"), formats: ["es"] },
    },
  });
  const chunks = (Array.isArray(output) ? output : [output]).flatMap((o) => o.output);
  const code = chunks
    .filter((c) => c.type === "chunk")
    .map((c) => c.code)
    .join("\n");
  assert.match(code, /items\/a\.js/u);
  assert.match(code, /data:application\/octet-stream;base64,YSBjdXN0b20gYXNzZXQ=/u);
  const server = await createServer({
    root: directory,
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    assert.equal(server.config.fsDenyGlob("dir/.env"), true);
    assert.equal(server.config.fsDenyGlob("dir/a.pem"), true);
    assert.equal(server.config.fsDenyGlob("dir/a.ts"), false);
  } finally {
    await server.close();
  }
});
