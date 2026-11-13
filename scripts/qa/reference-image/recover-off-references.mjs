import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "../local-vision/embedding-control.mjs";
import {
  blankReview,
  fetchImage,
  OFF_ACQUISITION_POLICY,
  parseSelection,
  renderBlindPage,
  writeBytes,
} from "./acquire-off-references.mjs";
import { createNodeReferencePorts, NODE_REFERENCE_DECODE_POLICY } from "./node-runtime-ports.mjs";
import { loadPinnedReferenceDecoder } from "./pinned-reference-decoder.mjs";

const project = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const selectionFile = "scripts/qa/reference-image/off-initial-selection.json";
const selectionSha256 = "904d38041e528dfaff897ebcef3f8bd5436411a7b1d138cd561bb9d397170ef8";
const ledger = "work/off-reference-recovery-v1-attempt.json";
export const OFF_RECOVERY_INPUTS = Object.freeze({
  manifestFile: "work/off-release-2026-11-13.MnzfCI/acquisition/acquisition.json",
  manifestSha256: "3b6c5f820c2599388341c197acc14f003bfb6a3f8979f2209d74d3f89c7312ff",
  diagnosticFile: "work/off-release-2026-11-13.MnzfCI/head-diagnostic.json",
  diagnosticSha256: "b31562874c0b87b5a2b33d6531a2766ce7cf859dff3765065b1659d4ed25ea02",
});
export const OFF_RECOVERY_CASES = Object.freeze([
  Object.freeze({
    blindId: "case-008",
    gtin: "5449000000996",
    originalId: "270",
    imageUrl:
      "https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/544/900/000/0996/270.400.jpg",
  }),
  Object.freeze({
    blindId: "case-013",
    gtin: "8076800195057",
    originalId: "117",
    imageUrl:
      "https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/807/680/019/5057/117.400.jpg",
  }),
]);
export const OFF_RECOVERY_POLICY = Object.freeze({
  version: "off-reference-recovery-v1",
  maximumRequests: 2,
  maximumTotalBytes: 4 * 1024 * 1024,
  maximumCopiedBytes: 96 * 1024 * 1024,
  allowedAdditionalMime: "application/octet-stream",
  onlyExactPinnedUrls: true,
  jpegSignatureAndActualDecodeRequired: true,
  integrationAllowed: false,
  automaticAcceptance: false,
});
const pending = (value) =>
  value.integrationAllowed === false &&
  value.humanAccepted === false &&
  value.captureIndependence === "unverified" &&
  value.split === "unassigned";
function parseBounded(serialized, maximum = 1_000_000) {
  assert.ok(
    typeof serialized === "string" &&
      Buffer.byteLength(serialized) > 0 &&
      Buffer.byteLength(serialized) <= maximum,
    "recovery_json_bound",
  );
  return JSON.parse(serialized);
}
const recoveryCase = (entry) =>
  OFF_RECOVERY_CASES.find(
    (item) =>
      item.blindId === entry.blindId &&
      item.gtin === entry.gtin &&
      item.originalId === entry.originalId &&
      item.imageUrl === entry.imageUrl,
  );
const frozen = (value) => {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) frozen(item);
    Object.freeze(value);
  }
  return value;
};

/** Pure synthetic-testable metadata checks; production authenticates bytes first. */
export function parseRecoveryInputs(baseText, diagnosticText, selectionText) {
  const base = parseBounded(baseText),
    diagnostic = parseBounded(diagnosticText),
    entries = parseSelection(selectionText);
  assert.ok(
    base.version === OFF_ACQUISITION_POLICY.version &&
      pending(base) &&
      hashPattern.test(base.lockSha256) &&
      base.selectionSha256 === selectionSha256,
    "recovery_base_scope",
  );
  assert.ok(
    Array.isArray(base.observations) && base.observations.length === 21,
    "recovery_base_count",
  );
  let originalBytes = 0;
  for (let index = 0; index < entries.length; index++) {
    const row = base.observations[index],
      entry = entries[index];
    assert.ok(row && typeof row === "object", "recovery_base_row");
    assert.deepEqual(
      Object.fromEntries(Object.keys(entry).map((key) => [key, row[key]])),
      entry,
      "recovery_source_identity",
    );
    if (recoveryCase(entry)) {
      assert.ok(
        row.status === "failed" &&
          row.reason === "response_type" &&
          row.bytesReceived === 0 &&
          !Object.hasOwn(row, "originalFile") &&
          !Object.hasOwn(row, "reviewFile"),
        "recovery_original_failure_required",
      );
    } else {
      assert.ok(
        row.status === "ready" &&
          row.originalFile === `originals/${row.blindId}.jpg` &&
          row.reviewFile === `blind/images/${row.blindId}.png` &&
          hashPattern.test(row.originalSha256) &&
          hashPattern.test(row.reviewImageSha256) &&
          Number.isSafeInteger(row.originalBytes) &&
          row.originalBytes > 0 &&
          row.originalBytes <= OFF_ACQUISITION_POLICY.maximumImageBytes &&
          row.bytesReceived === row.originalBytes &&
          row.reviewTransform === OFF_ACQUISITION_POLICY.reviewTransform &&
          [row.width, row.height].every(
            (value) => Number.isInteger(value) && value >= 32 && value <= 1024,
          ),
        "recovery_reused_asset",
      );
      originalBytes += row.originalBytes;
    }
  }
  assert.deepEqual(
    base.counters,
    {
      planned: 21,
      requests: 21,
      bytesReceived: originalBytes,
      downloaded: 19,
      decodes: 19,
      reviewEncodes: 19,
      ready: 19,
      failed: 2,
      notAttempted: 0,
      featureExtractions: 0,
      matcherCalls: 0,
      trainingCalls: 0,
      paidRequests: 0,
    },
    "recovery_base_counters",
  );
  assert.ok(
    diagnostic.schemaVersion === "off-reference-head-diagnostic-v1" &&
      diagnostic.acquisitionSha256 === OFF_RECOVERY_INPUTS.manifestSha256 &&
      diagnostic.metadataRequests === 2 &&
      [
        "getRequests",
        "bodyReads",
        "decodes",
        "featureExtractions",
        "matcherCalls",
        "retries",
        "redirectsFollowed",
      ].every((key) => diagnostic[key] === 0) &&
      pending(diagnostic.assessment) &&
      Array.isArray(diagnostic.results) &&
      diagnostic.results.length === 2,
    "recovery_diagnostic_scope",
  );
  for (let index = 0; index < OFF_RECOVERY_CASES.length; index++) {
    const row = diagnostic.results[index],
      expected = OFF_RECOVERY_CASES[index];
    assert.ok(
      row.blindId === expected.blindId &&
        row.url === expected.imageUrl &&
        row.method === "HEAD" &&
        row.status === 200 &&
        row.contentType === OFF_RECOVERY_POLICY.allowedAdditionalMime &&
        row.bodyRead === false &&
        row.redirectFollowed === false &&
        typeof row.contentLength === "string" &&
        /^\d{1,7}$/u.test(row.contentLength) &&
        Number(row.contentLength) > 0 &&
        Number(row.contentLength) <= OFF_ACQUISITION_POLICY.maximumImageBytes,
      "recovery_diagnostic_case",
    );
  }
  return frozen({ base, diagnostic, entries: entries.filter(recoveryCase) });
}
function inputState(cwd) {
  const manifest = readBounded(checkedWorkFile(OFF_RECOVERY_INPUTS.manifestFile, cwd), 1_000_000),
    diagnostic = readBounded(checkedWorkFile(OFF_RECOVERY_INPUTS.diagnosticFile, cwd), 1_000_000),
    selection = readBounded(path.join(cwd, selectionFile), 65536);
  assert.equal(sha(manifest), OFF_RECOVERY_INPUTS.manifestSha256, "recovery_base_hash");
  assert.equal(sha(diagnostic), OFF_RECOVERY_INPUTS.diagnosticSha256, "recovery_diagnostic_hash");
  assert.equal(sha(selection), selectionSha256, "recovery_selection_hash");
  return parseRecoveryInputs(
    manifest.toString("utf8"),
    diagnostic.toString("utf8"),
    selection.toString("utf8"),
  );
}

/**
 * One trusted adapter exception, never a general MIME relaxation. HEAD was only
 * diagnosis. A GET still must pass status/bounds/JPEG magic and actual decoding.
 */
export async function fetchRecoveryImage(entry, fetcher, remainingBytes) {
  assert.ok(recoveryCase(entry), "recovery_exact_case_required");
  assert.ok(
    Number.isSafeInteger(remainingBytes) &&
      remainingBytes > 0 &&
      remainingBytes <= OFF_RECOVERY_POLICY.maximumTotalBytes,
    "recovery_byte_budget",
  );
  let calls = 0;
  const responseMetadata = {
    httpStatus: null,
    originalContentType: null,
    normalizedContentType: null,
    genericMimeException: false,
  };
  const fetched = await fetchImage(
    entry,
    async (url, options) => {
      assert.ok(
        ++calls === 1 && url === entry.imageUrl && options.redirect === "error",
        "recovery_request_bound",
      );
      const response = await fetcher(url, options);
      const mime =
        response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
      responseMetadata.httpStatus = response.status;
      responseMetadata.originalContentType = mime && mime.length <= 128 ? mime : null;
      responseMetadata.normalizedContentType = responseMetadata.originalContentType;
      if (response.status === 200 && mime === OFF_RECOVERY_POLICY.allowedAdditionalMime) {
        responseMetadata.normalizedContentType = "image/jpeg";
        responseMetadata.genericMimeException = true;
        return {
          ok: response.ok,
          status: response.status,
          body: response.body,
          headers: {
            get(name) {
              return name.toLowerCase() === "content-type"
                ? "image/jpeg"
                : response.headers.get(name);
            },
          },
        };
      }
      return response;
    },
    remainingBytes,
  );
  return { ...fetched, responseMetadata };
}
function sourceIdentity(cwd) {
  return Object.fromEntries(
    [
      "scripts/qa/reference-image/recover-off-references.mjs",
      "scripts/__tests__/off-reference-recovery.test.mjs",
      "scripts/qa/reference-image/acquire-off-references.mjs",
      "scripts/qa/reference-image/node-runtime-ports.mjs",
      "scripts/qa/reference-image/pinned-reference-decoder.mjs",
      "scripts/qa/reference-image/prepare-off-candidates.mjs",
      "scripts/qa/local-vision/embedding-control.mjs",
      "scripts/qa/local-vision/embedding-head.mjs",
      selectionFile,
    ].map((name) => [name, sha(readBounded(path.join(cwd, name), 1_000_000))]),
  );
}
function baseAssetIdentity(base, cwd) {
  const directory = path.dirname(path.join(cwd, OFF_RECOVERY_INPUTS.manifestFile)),
    files = {};
  let totalBytes = 0;
  for (const row of base.observations.filter((item) => item.status === "ready")) {
    for (const [name, digest, maximum] of [
      [row.originalFile, row.originalSha256, OFF_ACQUISITION_POLICY.maximumImageBytes],
      [row.reviewFile, row.reviewImageSha256, OFF_ACQUISITION_POLICY.maximumReviewBytes],
    ]) {
      const file = checkedWorkFile(path.join(directory, name), cwd),
        bytes = readBounded(file, maximum);
      totalBytes += bytes.length;
      assert.ok(totalBytes <= OFF_RECOVERY_POLICY.maximumCopiedBytes, "recovery_copy_total_bound");
      assert.equal(sha(bytes), digest, "recovery_base_asset_hash");
      files[path.relative(cwd, file)] = digest;
    }
  }
  const creditFile = checkedWorkFile(path.join(directory, "blind/CREDITS.md"), cwd);
  files[path.relative(cwd, creditFile)] = sha(readBounded(creditFile, 20_000));
  assert.equal(Object.keys(files).length, 39, "recovery_base_asset_count");
  return files;
}
function lockState(cwd) {
  const inputs = inputState(cwd),
    { identity, lockSha256 } = loadPinnedReferenceDecoder(cwd);
  return {
    version: OFF_RECOVERY_POLICY.version,
    policy: OFF_RECOVERY_POLICY,
    inputs: OFF_RECOVERY_INPUTS,
    selectionSha256,
    sources: sourceIdentity(cwd),
    baseFiles: baseAssetIdentity(inputs.base, cwd),
    decoderIdentity: identity,
    decoderLockSha256: lockSha256,
    decodePolicy: NODE_REFERENCE_DECODE_POLICY,
    entries: inputs.entries,
  };
}
export function freezeRecovery(outputArgument, cwd = project) {
  const output = checkedOutput(outputArgument, cwd),
    lock = lockState(cwd);
  fs.mkdirSync(output, { mode: 0o700 });
  return writeJsonExclusive(path.join(output, "lock.json"), lock, cwd);
}
export function summarizeRecovery(baseCounters, recoveryCounters, observations) {
  return {
    planned: 21,
    requests: baseCounters.requests + recoveryCounters.requests,
    bytesReceived: baseCounters.bytesReceived + recoveryCounters.bytesReceived,
    downloaded: baseCounters.downloaded + recoveryCounters.downloaded,
    decodes: baseCounters.decodes + recoveryCounters.decodes,
    reviewEncodes: baseCounters.reviewEncodes + recoveryCounters.reviewEncodes,
    ready: observations.filter((row) => row.status === "ready").length,
    failed: observations.filter((row) => row.status === "failed").length,
    notAttempted: observations.filter((row) => row.status === "not_attempted").length,
    featureExtractions: 0,
    matcherCalls: 0,
    trainingCalls: 0,
    paidRequests: 0,
    failedAttempts: baseCounters.failed + recoveryCounters.failed,
    copiedOriginals: 19,
    copiedReviewImages: 19,
  };
}

export async function recoverReferences(
  lockArgument,
  expectedHash,
  outputArgument,
  { cwd = project, fetcher = fetch, onObservation = () => {} } = {},
) {
  assert.match(expectedHash, hashPattern, "recovery_lock_hash_required");
  const lockFile = checkedWorkFile(lockArgument, cwd),
    lockBytes = readBounded(lockFile, 1_000_000);
  assert.equal(sha(lockBytes), expectedHash, "recovery_lock_hash");
  const lock = JSON.parse(lockBytes);
  assert.deepEqual(lock, lockState(cwd), "recovery_frozen_plan_drift");
  const { base, entries } = inputState(cwd),
    output = checkedOutput(outputArgument, cwd),
    marker = checkedOutput(ledger, cwd);
  // A new freeze/output never authorizes a second pass or resets the old ledger.
  writeJsonExclusive(
    marker,
    {
      status: "started",
      lockSha256: expectedHash,
      baseAcquisitionSha256: OFF_RECOVERY_INPUTS.manifestSha256,
      plannedBlindIds: OFF_RECOVERY_CASES.map((row) => row.blindId),
      output: path.relative(cwd, output),
      startedAt: new Date().toISOString(),
    },
    cwd,
  );
  fs.mkdirSync(output, { mode: 0o700 });
  for (const directory of ["originals", "blind", "blind/images"])
    fs.mkdirSync(path.join(output, directory), { mode: 0o700 });
  const baseDirectory = path.dirname(path.join(cwd, OFF_RECOVERY_INPUTS.manifestFile));
  for (const row of base.observations.filter((item) => item.status === "ready")) {
    for (const [name, digest, maximum] of [
      [row.originalFile, row.originalSha256, OFF_ACQUISITION_POLICY.maximumImageBytes],
      [row.reviewFile, row.reviewImageSha256, OFF_ACQUISITION_POLICY.maximumReviewBytes],
    ]) {
      const bytes = readBounded(checkedWorkFile(path.join(baseDirectory, name), cwd), maximum);
      assert.equal(sha(bytes), digest, "recovery_copy_hash");
      writeBytes(path.join(output, name), bytes, maximum, cwd);
    }
    writeJsonExclusive(path.join(output, `${row.blindId}-receipt.json`), row, cwd);
  }
  const { sharp } = loadPinnedReferenceDecoder(cwd),
    ports = createNodeReferencePorts(sharp),
    recovered = new Map(),
    counters = {
      planned: 2,
      requests: 0,
      bytesReceived: 0,
      downloaded: 0,
      decodes: 0,
      reviewEncodes: 0,
      ready: 0,
      failed: 0,
      notAttempted: 0,
      featureExtractions: 0,
      matcherCalls: 0,
      trainingCalls: 0,
      paidRequests: 0,
      genericMimeNormalizations: 0,
    };
  for (const entry of entries) {
    const baseAttempt = { status: "failed", reason: "response_type", bytesReceived: 0 },
      remaining = OFF_RECOVERY_POLICY.maximumTotalBytes - counters.bytesReceived;
    let row = {
      ...entry,
      baseAttempt,
      status: "not_attempted",
      reason: "recovery_total_byte_budget",
    };
    if (remaining <= 0) counters.notAttempted++;
    else {
      writeJsonExclusive(
        path.join(output, `${entry.blindId}-dispatch.json`),
        {
          blindId: entry.blindId,
          requestOrdinal: counters.requests + 1,
          state: "recovery_dispatch_reserved",
          baseFailure: "response_type",
          networkReachability: "not_yet_proven",
        },
        cwd,
      );
      assert.ok(
        ++counters.requests <= OFF_RECOVERY_POLICY.maximumRequests,
        "recovery_request_limit",
      );
      const fetched = await fetchRecoveryImage(entry, fetcher, remaining);
      counters.bytesReceived += fetched.bytesReceived;
      if (fetched.responseMetadata.genericMimeException) counters.genericMimeNormalizations++;
      row = { ...entry, baseAttempt, ...fetched };
      delete row.bytes;
      if (fetched.status === "downloaded") {
        counters.downloaded++;
        row.originalSha256 = sha(fetched.bytes);
        row.originalBytes = fetched.bytes.byteLength;
        row.originalFile = `originals/${entry.blindId}.jpg`;
        writeJsonExclusive(path.join(output, `${entry.blindId}-download.json`), row, cwd);
        writeBytes(
          path.join(output, row.originalFile),
          fetched.bytes,
          OFF_ACQUISITION_POLICY.maximumImageBytes,
          cwd,
        );
        let review;
        try {
          counters.decodes++;
          const rgb = await ports.decodeRgb(fetched.bytes, {
            maximumDimension: 1024,
            maximumPixels: 1048576,
          });
          counters.reviewEncodes++;
          const png = await sharp(rgb.data, {
            raw: { width: rgb.width, height: rgb.height, channels: 3 },
          })
            .png({ compressionLevel: 9 })
            .toBuffer();
          const metadata = await sharp(png).metadata();
          assert.ok(
            !metadata.exif &&
              !metadata.xmp &&
              !metadata.iptc &&
              !metadata.icc &&
              !metadata.orientation,
            "recovery_review_metadata_present",
          );
          review = { png, width: rgb.width, height: rgb.height };
        } catch {
          row = { ...row, status: "failed", reason: "decode_or_review_failed" };
          counters.failed++;
        }
        if (review) {
          row = {
            ...row,
            status: "ready",
            reviewImageSha256: sha(review.png),
            reviewFile: `blind/images/${entry.blindId}.png`,
            reviewTransform: OFF_ACQUISITION_POLICY.reviewTransform,
            width: review.width,
            height: review.height,
          };
          writeBytes(
            path.join(output, row.reviewFile),
            review.png,
            OFF_ACQUISITION_POLICY.maximumReviewBytes,
            cwd,
          );
          counters.ready++;
        }
      } else counters.failed++;
    }
    recovered.set(entry.blindId, row);
    writeJsonExclusive(path.join(output, `${entry.blindId}-receipt.json`), row, cwd);
    onObservation({ blindId: row.blindId, status: row.status });
  }
  assert.deepEqual(lockState(cwd), lock, "recovery_source_or_input_drift_after_requests");
  const observations = base.observations.map((row) => recovered.get(row.blindId) ?? row),
    combined = summarizeRecovery(base.counters, counters, observations),
    acquiredAt = new Date().toISOString();
  const manifest = writeJsonExclusive(
    path.join(output, "acquisition.json"),
    {
      version: OFF_RECOVERY_POLICY.version,
      lockSha256: expectedHash,
      selectionSha256,
      acquiredAt,
      baseAcquisition: {
        manifestFile: OFF_RECOVERY_INPUTS.manifestFile,
        manifestSha256: OFF_RECOVERY_INPUTS.manifestSha256,
        lockSha256: base.lockSha256,
        counters: base.counters,
      },
      diagnosticFile: OFF_RECOVERY_INPUTS.diagnosticFile,
      diagnosticSha256: OFF_RECOVERY_INPUTS.diagnosticSha256,
      recovery: {
        lockSha256: expectedHash,
        counters,
        plannedBlindIds: OFF_RECOVERY_CASES.map((row) => row.blindId),
      },
      counters: combined,
      observations,
      integrationAllowed: false,
      humanAccepted: false,
      captureIndependence: "unverified",
      split: "unassigned",
    },
    cwd,
  );
  for (const reviewer of ["a", "b"])
    writeJsonExclusive(
      path.join(output, `blind/reviewer-${reviewer}.json`),
      blankReview(observations, manifest.sha256),
      cwd,
    );
  writeBytes(
    path.join(output, "blind/index.html"),
    Buffer.from(renderBlindPage(observations)),
    200_000,
    cwd,
  );
  const credits = readBounded(
    checkedWorkFile(path.join(baseDirectory, "blind/CREDITS.md"), cwd),
    20_000,
  );
  assert.equal(
    sha(credits),
    lock.baseFiles[path.relative(cwd, path.join(baseDirectory, "blind/CREDITS.md"))],
    "recovery_credit_drift",
  );
  writeBytes(path.join(output, "blind/CREDITS.md"), credits, 20_000, cwd);
  const attribution = `# Open Food Facts reference-image attribution\n\nPRIVATE REVIEW PREPARATION — NOT AN ACCEPTED CATALOGUE.\n\nProduct data: Open Food Facts contributors, ODbL 1.0; contents DbCL 1.0. Images: CC BY-SA 3.0, https://creativecommons.org/licenses/by-sa/3.0/ . Rights/privacy and identity acceptance remain pending.\n\nReview PNGs bake orientation, decode to sRGB/white RGB and remove source metadata. Same-licence derivatives, not independent captures. Do not distribute until complete attribution, rights and review procedure are approved.\n\nBase 21-request acquisition SHA256 ${OFF_RECOVERY_INPUTS.manifestSha256} remains unchanged: 19 ready, 2 response_type failures. Separate exact-two recovery SHA256 ${manifest.sha256}; request counters remain separate. HEAD diagnostic did not prove JPEG bytes or product identity.\n\n${observations.map((row) => `- ${row.blindId}: ${row.authorCredit}; source ${row.imageUrl}; accessed ${acquiredAt.slice(0, 10)}; source SHA256 ${row.originalSha256 ?? "not acquired"}; review SHA256 ${row.reviewImageSha256 ?? "not produced"}.`).join("\n")}\n`;
  writeBytes(path.join(output, "ATTRIBUTION.md"), Buffer.from(attribution), 100_000, cwd);
  writeJsonExclusive(
    path.join(output, "completion.json"),
    {
      status: combined.ready === 21 ? "all_acquired_for_review" : "incomplete_acquisition",
      acquisitionSha256: manifest.sha256,
      baseCounters: base.counters,
      recoveryCounters: counters,
      counters: combined,
      humanAccepted: false,
      integrationAllowed: false,
    },
    cwd,
  );
  return {
    output,
    acquisitionSha256: manifest.sha256,
    counters: combined,
    baseCounters: base.counters,
    recoveryCounters: counters,
    integrationAllowed: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === "--freeze") {
      const result = freezeRecovery(args[1]);
      console.log(JSON.stringify({ lock: result.path, sha256: result.sha256 }));
    } else if (args.length === 4 && args[0] === "--run")
      console.log(
        JSON.stringify(
          await recoverReferences(args[1], args[2], args[3], {
            onObservation: (value) => console.log(JSON.stringify(value)),
          }),
        ),
      );
    else
      throw new Error(
        "Use --freeze work/new-directory OR --run work/lock.json sha256 work/new-directory",
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "recovery_failed");
    process.exitCode = 1;
  }
}
