import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assessDeviceParity } from "./siglip-device-parity.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const run = path.resolve(root, process.argv[3]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const read = (p) => JSON.parse(fs.readFileSync(path.join(run, p)));
const archive = fs.existsSync(path.join(run, "source-archive/index.json"))
  ? read("source-archive/index.json")
  : [];
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
function walk(dir, pins) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    assert(!fs.lstatSync(p).isSymbolicLink());
    if (fs.statSync(p).isDirectory()) walk(p, pins);
    else pins[path.relative(root, p)] = hash(p);
  }
}
const check = (pins) => {
  for (const [p, h] of Object.entries(pins)) {
    const historical = archive.find((entry) => entry.original === p && entry.sha256 === h);
    if (historical) {
      const file = path.resolve(root, historical.archived);
      assert(file.startsWith(`${run}/source-archive/`));
      assert.equal(hash(file), h, p);
    } else assert.equal(hash(path.join(root, p)), h, p);
  }
};
if (process.argv[2] === "freeze") {
  const initial = read("native-lock.json");
  check(initial.pins);
  const app = path.join(run, "DerivedData/Build/Products/Release-iphoneos/SiglipValidation.app");
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" });
  const id = execFileSync(
    "/usr/bin/plutil",
    ["-extract", "CFBundleIdentifier", "raw", path.join(app, "Info.plist")],
    { encoding: "utf8" },
  ).trim();
  assert.equal(id, "fi.roopeaaltonen.siglipvalidation");
  const manifest = read("assets/manifest.json");
  for (const [p, h] of Object.entries(manifest.modelFiles))
    assert.equal(hash(path.join(app, "assets/vision-int8-block32.mlmodelc", p)), h);
  for (const row of manifest.cases)
    assert.equal(hash(path.join(app, "assets", `${row.id}.png`)), row.imageSha256);
  const pins = { ...initial.pins };
  walk(app, pins);
  for (const p of [
    "scripts/qa/siglip-native-artifact.mjs",
    "scripts/qa/siglip-native-build.mjs",
    "scripts/qa/siglip-device-parity.mjs",
  ])
    pins[p] = hash(path.join(root, p));
  pins[path.relative(root, path.join(run, "native-lock.json"))] = hash(
    path.join(run, "native-lock.json"),
  );
  fs.writeFileSync(
    path.join(run, "signed-lock.json"),
    JSON.stringify(
      { pins, bundleIdentifier: id, app: path.relative(root, app), run: path.basename(run) },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log("Signed test host/model/images/source frozen;0device model calls.");
} else if (process.argv[2] === "review") {
  check(read("signed-lock.json").pins);
  const raw = read("device-results/qa-results.json"),
    manifest = read("assets/manifest.json");
  assert.equal(read("device-results/qa-started.json").run, manifest.run);
  for (const row of raw.rows) assert.deepEqual(row, read(`device-results/${row.id}.json`));
  const parent = path.join(root, "work/siglip-mobile-20261116.yV442u");
  const load = (p) => JSON.parse(fs.readFileSync(path.join(parent, p)));
  const result = assessDeviceParity(
    raw,
    manifest,
    load("baseline.json"),
    load("text-prototypes.json"),
    load("block/results.json"),
  );
  console.log(JSON.stringify({ ...result, modelLoadMs: raw.modelLoadMs, os: raw.os }, null, 2));
} else throw Error("freeze|review work/RUN");
