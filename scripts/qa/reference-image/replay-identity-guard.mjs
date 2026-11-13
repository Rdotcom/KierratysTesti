// Post-result engineering safety analysis on already SEEN receipts. No image
// loading/extraction/matcher calls, independent test or quality pass is implied.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsup";
import {
  checkedOutput,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { summarizeDevelopment } from "./evaluate-off-development.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const baseFile = "work/off-release-2026-11-13.MnzfCI/development-result/summary.json";
const baseSha = "8f66d78f5050f77c2a411f78c6c8cb9b9e235564f68ad5459beb3ad8f359cfd8";
const lockFile = "work/off-release-2026-11-13.MnzfCI/development-freeze/lock.json";
const lockSha = "9e2bfd32e548e99b01c1e9dcafe922b50a111ab5773c6e0f1039f0c64c0187ee";
export function selfEvidenceEnvelope(rows) {
  assert.ok(
    Array.isArray(rows) &&
      rows.length === 21 &&
      new Set(rows.map((row) => row.blindId)).size === 21,
    "exact_seen_receipts",
  );
  const own = rows.filter((row) => row.role === "gallery_self");
  assert.ok(own.length > 0 && own.length <= 32, "self_evidence_count");
  return {
    inventory: own.map((row) => ({ referenceId: row.blindId, productId: row.productId })),
    observations: own.map((row) => ({
      referenceId: row.blindId,
      productId: row.productId,
      possibleProductIds:
        row.result.status === "candidate"
          ? [row.result.productId]
          : row.result.status === "ambiguous"
            ? row.result.productIds
            : [],
    })),
  };
}
export function countGuardChanges(before, after) {
  assert.ok(
    Array.isArray(before) && Array.isArray(after) && before.length === 21 && after.length === 21,
    "exact_comparison_count",
  );
  const changed = [];
  for (let index = 0; index < before.length; index++) {
    const a = before[index],
      b = after[index];
    assert.ok(a.blindId === b.blindId && a.productId === b.productId, "comparison_join");
    if (JSON.stringify(a.result) === JSON.stringify(b.result)) continue;
    assert.ok(
      a.result.status === "candidate" &&
        b.result.status === "ambiguous" &&
        b.result.productIds.includes(a.result.productId),
      "guard_must_only_abstain",
    );
    changed.push({
      blindId: a.blindId,
      role: a.role,
      sourceProductId: a.productId,
      originalCandidate: a.result.productId,
      guardedProductIds: b.result.productIds,
      sourceAgreementLost: a.result.productId === a.productId,
      sourceDisagreementSuppressed: a.result.productId !== a.productId,
    });
  }
  return changed;
}
export async function replayIdentityGuard(outputArgument, cwd = project) {
  const output = checkedOutput(outputArgument, cwd);
  const baseBytes = readBounded(path.join(cwd, baseFile), 2_000_000),
    lockBytes = readBounded(path.join(cwd, lockFile), 2_000_000);
  assert.equal(sha(baseBytes), baseSha, "seen_result_pin");
  assert.equal(sha(lockBytes), lockSha, "seen_lock_pin");
  const base = JSON.parse(baseBytes),
    lock = JSON.parse(lockBytes);
  assert.ok(
    base.diagnosticComplete && base.humanAccepted === false && base.integrationAllowed === false,
    "unaccepted_seen_development_only",
  );
  const sourceFiles = [
    "scripts/qa/reference-image/replay-identity-guard.mjs",
    "scripts/qa/reference-image/evaluate-off-development.mjs",
    "shared/domain/src/reference-image-identity-guard.ts",
    "shared/domain/src/__tests__/reference-image-identity-guard.test.ts",
    "shared/domain/src/reference-image-runtime.ts",
    "shared/domain/src/reference-vision.ts",
    "pnpm-lock.yaml",
  ];
  const sources = () =>
    Object.fromEntries(
      sourceFiles.map((file) => [file, sha(readBounded(path.join(cwd, file), 2_000_000))]),
    );
  const beforeSources = sources();
  writeJsonExclusive(
    path.join(cwd, "work/reference-identity-guard-replay-v1-attempt.json"),
    {
      baseSha256: baseSha,
      output: path.relative(cwd, output),
      sources: beforeSources,
      newImageCalls: 0,
    },
    cwd,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  const requireMobile = createRequire(path.join(cwd, "mobile/app/package.json"));
  await build({
    entry: [requireMobile.resolve("@kierratysappi/domain/reference-vision")],
    outDir: path.join(output, "engine"),
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    bundle: true,
    splitting: false,
    noExternal: ["zod"],
    silent: true,
    clean: false,
  });
  const engineFile = path.join(output, "engine/reference-vision.mjs"),
    engineSha256 = sha(readBounded(engineFile, 4_000_000));
  const api = await import(pathToFileURL(engineFile).href);
  const guard = api.deriveReferenceIdentityGuard(JSON.stringify(selfEvidenceEnvelope(base.rows)));
  assert.equal(guard.status, "ready", "self_confusion_graph");
  const rows = base.rows.map((row) => ({
    ...row,
    result: api.guardReferenceIdentity(row.result, guard.guard),
  }));
  const changed = countGuardChanges(base.rows, rows);
  const baseline = summarizeDevelopment(base.rows, lock.plan),
    guarded = summarizeDevelopment(rows, lock.plan);
  assert.ok(baseline.diagnosticComplete && guarded.diagnosticComplete, "receipt_scope");
  assert.deepEqual(sources(), beforeSources, "guard_source_drift");
  assert.equal(sha(readBounded(path.join(cwd, baseFile), 2_000_000)), baseSha, "base_result_drift");
  const saved = writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      scope: "post_result_safety_analysis_on_seen_source_labelled_receipts",
      baseSha256: baseSha,
      lockSha256: lockSha,
      sources: beforeSources,
      engineSha256,
      guard: guard.guard,
      changed,
      baseline,
      guarded,
      newImageWork: {
        decodes: 0,
        extractions: 0,
        matches: 0,
        pretrainedPredictions: 0,
        trainingCalls: 0,
        paidRequests: 0,
      },
      humanAccepted: false,
      independentAccuracyEstablished: false,
      integrationAllowed: false,
      releaseAccepted: false,
    },
    cwd,
  );
  return {
    sha256: saved.sha256,
    changed,
    baseline: baseline.crossUpload,
    guarded: guarded.crossUpload,
    newImageCalls: 0,
    integrationAllowed: false,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3, "use replay-identity-guard.mjs work/new-output");
  console.log(JSON.stringify(await replayIdentityGuard(process.argv[2]), null, 2));
}
