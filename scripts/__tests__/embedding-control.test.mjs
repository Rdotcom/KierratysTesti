import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertEmbeddingFresh,
  assertEmbeddingStageAvailable,
  captureEmbeddingSources,
  checkedOutput,
  checkedWorkFile,
  claimEmbeddingStage,
  readBounded,
  validateEmbeddingSpec,
  writeJsonExclusive,
} from "../qa/local-vision/embedding-control.mjs";
const project = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const hash = (b) => createHash("sha256").update(b).digest("hex");
function temp(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "kig-embedding-control-"));
  fs.mkdirSync(path.join(root, "work"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  return root;
}
test("registered spec is closed and matches fixed worker, features, math and budgets", () => {
  const spec = JSON.parse(
    fs.readFileSync(new URL("../qa/local-vision/embedding-learning-spec.json", import.meta.url)),
  );
  assert.equal(validateEmbeddingSpec(spec).experimentId, "kig-embedding-v2");
  for (const [section, key, value] of [
    ["worker", "outerTimeoutMs", 60000],
    ["worker", "binarySha256", "0".repeat(64)],
    ["features", "partialViewsAllowed", true],
    ["head", "lambda", 1],
    ["head", "minimumRawMargin", 0],
    ["execution", "maximumImagePredictions", 145],
    ["execution", "appIntegrationAllowed", true],
    ["validationGate", "maximumBaselineCorrectLosses", 2],
  ]) {
    const bad = structuredClone(spec);
    bad[section][key] = value;
    assert.throws(() => validateEmbeddingSpec(bad));
  }
  assert.throws(() => validateEmbeddingSpec({ ...spec, search: true }));
});
test("source snapshot is deterministic and performs no claim or model operation", () => {
  const first = captureEmbeddingSources(project),
    second = captureEmbeddingSources(project);
  assert.deepEqual(first, second);
  assert.match(first.sourceHash, /^[a-f0-9]{64}$/u);
  assert.ok(first.files["scripts/qa/local-vision/embedding-main.swift"]);
  assert.ok(first.files["scripts/qa/protocols/local-vision-two-view-protocol.md"]);
});
test("bounded reads support empty failed output but reject oversize and hard links", (t) => {
  const cwd = temp(t),
    file = path.join(cwd, "work/input");
  fs.writeFileSync(file, "");
  assert.equal(readBounded(file, 8).length, 0);
  fs.writeFileSync(file, "123456789");
  assert.throws(() => readBounded(file, 8));
  fs.linkSync(file, path.join(cwd, "work/alias"));
  assert.throws(() => readBounded(file, 32));
  assert.throws(() => readBounded(file, 0));
});
test("only the pinned installed-runtime metadata may have a package-cache hard-link alias", (t) => {
  const cwd = temp(t);
  for (const area of ["backend", "mobile", "shared"]) fs.mkdirSync(path.join(cwd, area));
  for (const dir of [
    "scripts/qa/local-vision",
    "shared/contracts/src",
    "shared/domain/src",
    "scripts/qa/protocols",
    "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx",
  ])
    fs.mkdirSync(path.join(cwd, dir), { recursive: true });
  for (const p of [
    "scripts/qa/protocols/local-vision-two-view-protocol.md",
    "scripts/qa/protocols/local-vision-linear-protocol.md",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "package.json",
    "shared/contracts/package.json",
    "shared/domain/package.json",
  ])
    fs.writeFileSync(path.join(cwd, p), "{}");
  const pkg = path.join(cwd, "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json");
  fs.writeFileSync(pkg, "{}");
  fs.linkSync(pkg, path.join(cwd, "runtime-cache-alias"));
  assert.throws(() => readBounded(pkg));
  assert.equal(
    captureEmbeddingSources(cwd).files[
      "node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/package.json"
    ],
    hash("{}"),
  );
});
test("input, output and intermediate links cannot escape canonical work", (t) => {
  const cwd = temp(t),
    file = path.join(cwd, "work/input");
  fs.writeFileSync(file, "safe");
  assert.equal(checkedWorkFile("work/input", cwd), file);
  fs.symlinkSync(file, path.join(cwd, "work/linked"));
  assert.throws(() => checkedWorkFile("work/linked", cwd));
  fs.mkdirSync(path.join(cwd, "work/real"));
  fs.symlinkSync(path.join(cwd, "work/real"), path.join(cwd, "work/parent"));
  assert.throws(() => checkedOutput("work/parent/new", cwd));
  assert.throws(() => checkedOutput("outside", cwd));
  assert.throws(() => checkedWorkFile("https://example.org/data", cwd));
});
test("JSON writes are private exclusive data-only and reject accessors/nonfinite values", (t) => {
  const cwd = temp(t),
    result = writeJsonExclusive("work/output.json", { valid: true, rows: [1, 2] }, cwd);
  assert.equal(result.sha256, hash(result.bytes));
  assert.deepEqual(JSON.parse(readBounded(result.path)), { valid: true, rows: [1, 2] });
  assert.equal(fs.statSync(result.path).mode & 0o777, 0o600);
  assert.throws(() => writeJsonExclusive("work/output.json", { replaced: true }, cwd));
  let read = false;
  const bad = {
    get secret() {
      read = true;
      throw Error("never");
    },
  };
  assert.throws(() => writeJsonExclusive("work/accessor.json", bad, cwd));
  assert.equal(read, false);
  assert.throws(() => writeJsonExclusive("work/nan.json", { value: Number.NaN }, cwd));
});
test("image and fit ledgers are global to experiment, stage-specific and chained", (t) => {
  const cwd = temp(t),
    lockSha256 = "1".repeat(64);
  assertEmbeddingFresh(cwd);
  assertEmbeddingStageAvailable("images", cwd);
  assert.throws(() => claimEmbeddingStage("fit", { lockSha256, output: "work/run" }, cwd));
  const images = claimEmbeddingStage("images", { lockSha256, output: "work/images" }, cwd);
  assert.equal(images.marker.limits.maximumImagePredictions, 144);
  assert.equal(images.marker.limits.maximumFits, 0);
  assert.throws(() => assertEmbeddingFresh(cwd));
  assert.throws(() =>
    claimEmbeddingStage("images", { lockSha256: "2".repeat(64), output: "work/copy" }, cwd),
  );
  assert.throws(() =>
    claimEmbeddingStage("fit", { lockSha256: "2".repeat(64), output: "work/run" }, cwd),
  );
  const fitted = claimEmbeddingStage("fit", { lockSha256, output: "work/run" }, cwd);
  assert.equal(fitted.marker.priorImagesClaimSha256, images.sha256);
  assert.equal(fitted.marker.limits.maximumImagePredictions, 0);
  assert.equal(fitted.marker.limits.maximumFits, 1);
  assert.throws(() => claimEmbeddingStage("fit", { lockSha256, output: "work/run-copy" }, cwd));
});
test("unknown stages, budgets, forged image claims and linked ledger roots fail closed", (t) => {
  const cwd = temp(t),
    lockSha256 = "1".repeat(64);
  assert.throws(() => claimEmbeddingStage("other", { lockSha256, output: "work/images" }, cwd));
  assert.throws(() =>
    claimEmbeddingStage(
      "images",
      { lockSha256, output: "work/images", maximumImagePredictions: 999 },
      cwd,
    ),
  );
  fs.mkdirSync(path.join(cwd, "target"));
  fs.symlinkSync(path.join(cwd, "target"), path.join(cwd, "work/embedding-learning-attempts"));
  assert.throws(() => assertEmbeddingFresh(cwd));
  assert.equal(fs.readdirSync(path.join(cwd, "target")).length, 0);
});
test("a forged prior image claim never permits fitting", (t) => {
  const cwd = temp(t);
  fs.mkdirSync(path.join(cwd, "work/embedding-learning-attempts"));
  fs.writeFileSync(
    path.join(cwd, "work/embedding-learning-attempts/kig-embedding-v2-images.json"),
    JSON.stringify({ stage: "images", lockSha256: "1".repeat(64) }),
  );
  assert.throws(() =>
    claimEmbeddingStage("fit", { lockSha256: "1".repeat(64), output: "work/run" }, cwd),
  );
});
