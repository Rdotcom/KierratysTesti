// Preserve the reviewed compiled model, not a newly serialized metadata variant.
// Only an isolated fresh candidate is modified; original signed candidate retained.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = fs.realpathSync(process.cwd()),
  run = path.resolve(root, process.argv[2]);
assert(run.startsWith(`${root}/work/`) && fs.realpathSync(run) === run);
const build = JSON.parse(fs.readFileSync("mobile/app/app.json")).expo.ios.buildNumber;
assert.equal(build, "21");
assert(!fs.existsSync(path.join(run, "frozen-model-preservation.json")));
const app = path.join(run, "client21.app"),
  prior = path.join(run, "rollback-prior.app"),
  backup = path.join(run, "client21-recompiled-metadata.app");
const command = (exe, args) =>
  execFileSync(exe, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
    maxBuffer: 4000000,
  });
for (const p of [app, prior]) {
  assert(fs.realpathSync(p) === p && fs.lstatSync(p).isDirectory());
  command("/usr/bin/codesign", ["--verify", "--deep", "--strict", p]);
}
if (fs.existsSync(backup)) command("/usr/bin/codesign", ["--verify", "--deep", "--strict", backup]);
const bundle = "KierratysLocalVisionModels.bundle",
  rows = [];
const hash = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function walk(dir, prefix = "") {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n),
      s = fs.lstatSync(p),
      rel = prefix + n;
    assert(!s.isSymbolicLink());
    if (s.isDirectory()) walk(p, `${rel}/`);
    else {
      assert(s.isFile());
      const destination = path.join(app, bundle, rel);
      assert(fs.lstatSync(destination).isFile() && fs.lstatSync(destination).nlink === 1);
      rows.push({ rel, before: hash(destination), frozen: hash(p) });
    }
  }
}
walk(path.join(prior, bundle));
assert.equal(rows.length, 14);
const changed = rows.filter((row) => row.before !== row.frozen);
assert.deepEqual(changed.map((row) => row.rel).sort(), [
  "mobileclip_s0_image.mlmodelc/coremldata.bin",
  "mobileclip_s0_image.mlmodelc/metadata.json",
]);
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, stable(v[k])]),
    );
  return v;
}
const metadata = (p) =>
  stable(
    JSON.parse(fs.readFileSync(path.join(p, bundle, "mobileclip_s0_image.mlmodelc/metadata.json"))),
  );
assert.deepEqual(metadata(app), metadata(prior));
// In particular numeric graph, weights, prototypes, source spec and notices match.
assert(rows.filter((row) => !changed.includes(row)).every((row) => row.before === row.frozen));
if (!fs.existsSync(backup)) command("/bin/cp", ["-cR", app, backup]);
command("/usr/bin/codesign", ["--verify", "--deep", "--strict", backup]);
assert.equal(hash(path.join(backup, "KeepItGreen")), hash(path.join(app, "KeepItGreen")));
const entitlements = command("/usr/bin/codesign", ["-d", "--entitlements", ":-", app]);
assert(entitlements.includes("<plist") && entitlements.includes("application-identifier"));
const entitlementFile = path.join(run, "preserved-signing-entitlements.plist");
if (fs.existsSync(entitlementFile))
  assert.equal(fs.readFileSync(entitlementFile, "utf8"), entitlements);
else fs.writeFileSync(entitlementFile, entitlements, { flag: "wx", mode: 0o600 });
const certificatePrefix = path.join(run, "preserved-public-signing-cert");
command("/usr/bin/codesign", ["-d", `--extract-certificates=${certificatePrefix}`, app]);
const identity = createHash("sha1")
  .update(fs.readFileSync(`${certificatePrefix}0`))
  .digest("hex")
  .toUpperCase();
assert(/^[A-F0-9]{40}$/.test(identity));
for (const row of changed)
  fs.copyFileSync(path.join(prior, bundle, row.rel), path.join(app, bundle, row.rel));
assert(rows.every((row) => hash(path.join(app, bundle, row.rel)) === row.frozen));
command("/usr/bin/codesign", [
  "--force",
  "--sign",
  identity,
  "--preserve-metadata=identifier,flags,runtime",
  "--entitlements",
  entitlementFile,
  "--generate-entitlement-der",
  app,
]);
command("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
fs.writeFileSync(
  path.join(run, "frozen-model-preservation.json"),
  JSON.stringify(
    {
      build,
      preservedOriginalSignedCandidate: true,
      changedMetadata: changed,
      semanticJsonIdentical: true,
      graphWeightsPrototypesUnchanged: true,
      all14FrozenPinsRestored: true,
      resignedExistingIdentity: true,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(
  "Restored exactly two compiler-reordered metadata files from the verified frozen model; all14pins and existing-identity signature pass. Original signed compile retained.",
);
