import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "tsup";
import {
  checkedOutput,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import { createNodeReferencePorts, NODE_REFERENCE_DECODE_POLICY } from "./node-runtime-ports.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

// Explicit adapter integration smoke, not a product experiment. Generates only
// original synthetic textures in memory, not grocery photos or accepted labels.
// Fake review/capture metadata below is a TEST FIXTURE, never real independence.
const cwd = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const decodeLimits = { maximumDimension: 1024, maximumPixels: 1048576 };
const review = {
  status: "accepted",
  reviewerId: "synthetic-test-double",
  reviewedOn: "2026-11-13",
  evidence: "Automated synthetic fixture only, NOT actual human acceptance.",
  reconciliation: "accepted",
};
function texture(seed) {
  let state = seed;
  const cells = Array.from({ length: 256 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 30 + (state % 190);
  });
  const data = new Uint8Array(128 * 128 * 3);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const offset = (y * 128 + x) * 3;
      data.fill(cells[Math.floor(y / 8) * 16 + Math.floor(x / 8)], offset, offset + 3);
    }
  return data;
}
function sourceIdentity() {
  const files = {};
  function visit(file) {
    const info = fs.lstatSync(file);
    assert.ok(!info.isSymbolicLink(), "linked_source");
    if (info.isDirectory())
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
    else if (file.endsWith(".ts") || file.endsWith(".mjs")) {
      assert.ok(Object.keys(files).length < 256, "source_bound");
      files[path.relative(cwd, file)] = sha(readBounded(file, 1_000_000));
    }
  }
  visit(path.join(cwd, "shared/domain/src"));
  visit(path.join(cwd, "scripts/qa/reference-image"));
  return files;
}

export async function runByteSmoke(outputArgument) {
  const output = checkedOutput(outputArgument, cwd);
  const sources = sourceIdentity();
  const { sharp, identity, lockSha256 } = loadPinnedReferenceDecoder(cwd);
  fs.mkdirSync(output, { mode: 0o700 });
  const frozen = writeJsonExclusive(
    path.join(output, "source-lock.json"),
    {
      sources,
      decoderIdentity: identity,
      decoderLockSha256: lockSha256,
      decodePolicy: NODE_REFERENCE_DECODE_POLICY,
    },
    cwd,
  );
  await build({
    entry: [path.join(cwd, "shared/domain/src/reference-vision.ts")],
    outDir: path.join(output, "engine"),
    format: ["esm"],
    outExtension: () => ({ js: ".mjs" }),
    bundle: true,
    splitting: false,
    noExternal: ["zod"],
    silent: true,
    clean: false,
  });
  const enginePath = path.join(output, "engine/reference-vision.mjs");
  const engineSha256 = sha(readBounded(enginePath, 4_000_000));
  const engine = await import(pathToFileURL(enginePath).href);
  assert.deepEqual(sourceIdentity(), sources, "source_drift_before_calls");
  const rawA = texture(17),
    rawB = texture(712);
  const encode = (raw, compressionLevel) =>
    sharp(raw, { raw: { width: 128, height: 128, channels: 3 } })
      .png({ compressionLevel })
      .toBuffer();
  const encoded = [
    new Uint8Array(await encode(rawA, 1)),
    new Uint8Array(await encode(rawA, 9)),
    new Uint8Array(await encode(rawB, 9)),
  ];
  assert.equal(new Set(encoded.map(sha)).size, 3, "synthetic_encoding_identity");
  const actual = createNodeReferencePorts(sharp);
  const counters = { sha256Calls: 0, decodeCalls: 0 };
  const ports = {
    async sha256(bytes) {
      counters.sha256Calls++;
      return actual.sha256(bytes);
    },
    async decodeRgb(bytes, limits) {
      counters.decodeCalls++;
      return actual.decodeRgb(bytes, limits);
    },
  };
  const references = [],
    receipts = [],
    bytes = [];
  for (let index = 0; index < 3; index++) {
    const referenceId = `synthetic-${index}`;
    const imageSha256 = await ports.sha256(encoded[index]);
    const decoded = await ports.decodeRgb(encoded[index], decodeLimits);
    const extracted = engine.extractReferenceImageFeaturesV2(decoded);
    assert.equal(extracted.status, "ok", "synthetic_features_required");
    const featureSha256 = await ports.sha256(
      new TextEncoder().encode(JSON.stringify(extracted.features)),
    );
    references.push({
      referenceId,
      productId: "synthetic-texture",
      imageSha256,
      capturedOn: "2026-11-13",
      sourceFamilyId: `synthetic-family-${index}`,
      captureGroupId: `synthetic-capture-${index}`,
      split: index < 2 ? "enrollment" : "independent_query",
      origin: "independent_capture",
      rights: {
        kind: "owner_capture",
        ownerAlias: "synthetic-test",
        license: "OWNER-PERMISSION",
        permissionEvidenceId: "test-only-no-real-rights-claim",
        review,
      },
    });
    receipts.push({
      referenceId,
      imageSha256,
      featureSha256,
      featureVersion: engine.REFERENCE_FEATURE_VERSION_V2,
    });
    bytes.push({ referenceId, encoded: encoded[index] });
  }
  const catalogue = {
    schemaVersion: engine.REFERENCE_CATALOGUE_VERSION,
    catalogueId: "synthetic-byte-smoke",
    featureVersion: engine.REFERENCE_FEATURE_VERSION_V2,
    products: [
      {
        productId: "synthetic-texture",
        label: "Synthetic texture TEST ONLY",
        identity: { method: "physical_label", evidenceId: "synthetic-label-double", review },
      },
    ],
    references,
    featureReceipts: receipts,
    acceptance: review,
  };
  const compiled = await engine.compileReferenceImageRuntime(
    catalogue,
    { asOf: "2026-11-13", featureVersion: engine.REFERENCE_FEATURE_VERSION_V2 },
    bytes,
    ports,
  );
  assert.equal(compiled.status, "ready", "byte_binding_compile");
  const matched = await compiled.runtime.identify(encoded[0]);
  const excluded = await compiled.runtime.identify(encoded[2]);
  assert.equal(matched.status, "candidate", "synthetic_enrollment_retrieval");
  assert.equal(excluded.status, "unknown", "query_split_not_enrolled");
  assert.equal(compiled.integrationAllowed, false);
  assert.deepEqual(counters, { sha256Calls: 14, decodeCalls: 8 });
  assert.deepEqual(sourceIdentity(), sources, "source_drift_after_calls");
  assert.equal(sha(readBounded(enginePath, 4_000_000)), engineSha256, "engine_drift");
  for (const [file, digest] of Object.entries(identity.files))
    assert.equal(sha(readBounded(file, 64_000_000)), digest, "decoder_drift_after_calls");
  return writeJsonExclusive(
    path.join(output, "summary.json"),
    {
      status: "pass",
      scope: "synthetic_png_real_sha256_adapter_binding_only",
      sourceLockSha256: frozen.sha256,
      engineSha256,
      decodePolicy: NODE_REFERENCE_DECODE_POLICY,
      decoderArtifactsRechecked: 58,
      decoderLockSha256: lockSha256,
      counters,
      syntheticPngEncodes: 3,
      enrollmentReferences: compiled.enrollmentReferences,
      boundIndependentQueries: compiled.boundIndependentQueries,
      matched,
      excluded,
      productAccuracyEstablished: false,
      humanAccepted: false,
      integrationAllowed: false,
      externalImageDownloads: 0,
      paidRequests: 0,
    },
    cwd,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 3, "use runtime-byte-smoke.mjs work/<new-output-directory>");
    const result = await runByteSmoke(process.argv[2]);
    console.log(
      JSON.stringify({ summary: result.path, sha256: result.sha256, integrationAllowed: false }),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "byte_smoke_failed");
    process.exitCode = 1;
  }
}
