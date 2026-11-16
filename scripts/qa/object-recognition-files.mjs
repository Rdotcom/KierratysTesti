// Read-only image/lineage audit. Never downloads, predicts, fits or copies photos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { readBounded } from "./local-vision/embedding-control.mjs";
import { loadPinnedReferenceDecoder } from "./reference-image/pinned-reference-decoder.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const digest = (s) => assert(typeof s === "string" && /^[a-f0-9]{64}$/.test(s), "invalid_digest");
const identifier = (s) =>
  assert(typeof s === "string" && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(s), "invalid_id");
function exact(o, fields) {
  assert(o && typeof o === "object" && !Array.isArray(o), "invalid_record");
  assert.deepEqual(Object.keys(o).sort(), [...fields].sort(), "invalid_fields");
}
export function confinedFile(root, relative) {
  assert(
    typeof relative === "string" && relative.length <= 2048 && !/[\p{Cc}\p{Cf}\\:]/u.test(relative),
    "invalid_path",
  );
  assert(
    !path.isAbsolute(relative) && relative.split("/").every((p) => p && p !== "." && p !== ".."),
    "invalid_path",
  );
  const base = path.resolve(root);
  assert.equal(fs.realpathSync(base), base, "linked_root");
  const file = path.resolve(base, relative);
  assert(file.startsWith(`${base}${path.sep}`), "outside_root");
  assert.equal(fs.realpathSync(file), file, "linked_file");
  return file;
}
export function validateFileManifest(manifest) {
  exact(manifest, ["schemaVersion", "images"]);
  assert.equal(manifest.schemaVersion, "object-image-audit-v1");
  assert(Array.isArray(manifest.images) && manifest.images.length <= 500, "image_count_bound");
  const ids = new Map();
  for (const row of manifest.images) {
    exact(row, [
      "id",
      "file",
      "sha256",
      "pool",
      "split",
      "objectId",
      "sourceFamily",
      "origin",
      "parentId",
      "evidenceFile",
      "evidenceSha256",
    ]);
    for (const key of ["id", "objectId", "sourceFamily"]) identifier(row[key]);
    digest(row.sha256);
    digest(row.evidenceSha256);
    assert(!ids.has(row.id), "duplicate_id");
    ids.set(row.id, row);
    assert(["development", "physical-pilot"].includes(row.pool), "invalid_pool");
    assert(["train", "calibration", "test"].includes(row.split), "invalid_split");
    assert(["source", "physical", "derived", "generated"].includes(row.origin), "invalid_origin");
    assert(
      row.origin === "derived" ? typeof row.parentId === "string" : row.parentId === null,
      "invalid_parent",
    );
    if (row.pool === "physical-pilot")
      assert(["physical", "derived"].includes(row.origin), "source_as_physical");
  }
  for (const row of manifest.images) {
    const seen = new Set([row.id]);
    let cursor = row;
    while (cursor.parentId !== null) {
      assert(!seen.has(cursor.parentId), "lineage_cycle");
      seen.add(cursor.parentId);
      const parent = ids.get(cursor.parentId);
      assert(parent, "missing_parent");
      for (const field of ["pool", "split", "objectId", "sourceFamily"])
        assert.equal(parent[field], cursor[field], "derived_lineage_leakage");
      cursor = parent;
    }
    if (row.pool === "physical-pilot") assert.equal(cursor.origin, "physical", "nonphysical_root");
  }
  return ids;
}

export function pinnedPixelDecoder(root) {
  const decoder = loadPinnedReferenceDecoder(root);
  return {
    lockSha256: decoder.lockSha256,
    async decode(bytes) {
      const make = () =>
        decoder
          .sharp(bytes, { limitInputPixels: 8_000_000, failOn: "warning", sequentialRead: true })
          .timeout({ seconds: 10 });
      const metadata = await make().metadata();
      assert(["jpeg", "png"].includes(metadata.format), "unsupported_image");
      assert(
        metadata.width >= 32 &&
          metadata.height >= 32 &&
          metadata.width <= 4096 &&
          metadata.height <= 4096,
        "dimension_bound",
      );
      assert(!metadata.pages || metadata.pages === 1, "animated_image");
      const canonical = await make()
        .autoOrient()
        .toColourspace("srgb")
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const thumbnail = await make()
        .autoOrient()
        .resize(9, 8, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer();
      let bits = 0n;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++)
          bits = (bits << 1n) | BigInt(thumbnail[y * 9 + x] > thumbnail[y * 9 + x + 1]);
      return {
        width: canonical.info.width,
        height: canonical.info.height,
        pixelSha256: sha(
          Buffer.concat([
            Buffer.from(
              `${canonical.info.width}:${canonical.info.height}:${canonical.info.channels}:`,
            ),
            canonical.data,
          ]),
        ),
        perceptualHash: bits.toString(16).padStart(16, "0"),
        metadataPresent: Boolean(
          metadata.exif || metadata.xmp || metadata.iptc || metadata.comments?.length,
        ),
      };
    },
  };
}

export function imageIoPixelDecoder(root, binary, expectedSha256) {
  digest(expectedSha256);
  const executable = confinedFile(root, binary);
  assert.equal(sha(readBounded(executable, 8_000_000)), expectedSha256, "decoder_binary_mismatch");
  return {
    decoderIdentity: {
      kind: "macos-imageio-rgba-v1",
      binarySha256: expectedSha256,
      sourceSha256: sha(
        readBounded(
          confinedFile(root, "scripts/qa/local-vision/object-image-audit.swift"),
          100_000,
        ),
      ),
      os: os.version(),
      limitation:
        "OS ImageIO/CoreGraphics trusted; not the historical Sharp pin or shipping preprocessing.",
    },
    async decode(bytes) {
      assert.equal(sha(readBounded(executable, 8_000_000)), expectedSha256, "decoder_binary_drift");
      const result = spawnSync(executable, [], { input: bytes, timeout: 10000, maxBuffer: 65536 });
      assert.equal(result.status, 0, "decoder_process_failure");
      return JSON.parse(result.stdout.toString("utf8"));
    },
  };
}
function hamming(a, b) {
  let bits = BigInt(`0x${a}`) ^ BigInt(`0x${b}`),
    count = 0;
  while (bits) {
    bits &= bits - 1n;
    count++;
  }
  return count;
}

/** decode injection is for unit tests; trusted CLI only uses the pinned decoder. */
export async function auditImageFiles(root, manifest, decode) {
  const rows = validateFileManifest(manifest),
    findings = [],
    receipts = [];
  let totalBytes = 0;
  for (const row of rows.values()) {
    try {
      const file = confinedFile(root, row.file),
        evidence = confinedFile(root, row.evidenceFile);
      const remaining = 200_000_000 - totalBytes;
      assert(remaining > 0, "total_byte_bound");
      const bytes = readBounded(file, Math.min(8_000_000, remaining));
      totalBytes += bytes.length;
      assert(totalBytes <= 200_000_000, "total_byte_bound");
      assert.equal(sha(bytes), row.sha256, "image_hash_mismatch");
      assert.equal(
        sha(readBounded(evidence, 4_000_000)),
        row.evidenceSha256,
        "evidence_hash_mismatch",
      );
      const pixels = await decode(bytes);
      digest(pixels.pixelSha256);
      assert(/^[a-f0-9]{16}$/.test(pixels.perceptualHash), "invalid_pixel_receipt");
      assert(typeof pixels.metadataPresent === "boolean", "invalid_metadata_receipt");
      if (pixels.metadataPresent)
        findings.push({ kind: "embedded_metadata", ids: [row.id], severity: "high" });
      receipts.push({
        id: row.id,
        imageSha256: row.sha256,
        evidenceSha256: row.evidenceSha256,
        bytes: bytes.length,
        ...pixels,
      });
    } catch {
      // Retain failed rows, but not paths, EXIF, decoder messages or private text.
      findings.push({ kind: "unverified_image_or_evidence", ids: [row.id], severity: "high" });
    }
  }
  for (let i = 0; i < receipts.length; i++)
    for (let j = i + 1; j < receipts.length; j++) {
      const a = receipts[i],
        b = receipts[j],
        ar = rows.get(a.id),
        br = rows.get(b.id);
      const crossSplit = ar.split !== br.split || ar.pool !== br.pool;
      if (a.imageSha256 === b.imageSha256 || a.pixelSha256 === b.pixelSha256) {
        findings.push({
          kind: "duplicate_bytes_or_pixels",
          ids: [a.id, b.id],
          severity: "high",
          crossSplit,
        });
      } else if (hamming(a.perceptualHash, b.perceptualHash) <= 4) {
        findings.push({
          kind: "near_duplicate_review",
          ids: [a.id, b.id],
          severity: crossSplit ? "high" : "medium",
          crossSplit,
        });
      }
    }
  for (const field of ["objectId", "sourceFamily"]) {
    const groups = new Map();
    for (const row of rows.values()) {
      const group = groups.get(row[field]) ?? new Set();
      group.add(`${row.pool}:${row.split}`);
      groups.set(row[field], group);
    }
    for (const [group, splits] of groups)
      if (splits.size > 1)
        findings.push({
          kind: `cross_split_${field}`,
          ids: [...rows.values()].filter((r) => r[field] === group).map((r) => r.id),
          severity: "high",
        });
  }
  return {
    schemaVersion: "object-image-audit-result-v1",
    declaredImages: rows.size,
    decodedImages: receipts.length,
    totalBytes,
    physicalDeclaredImages: [...rows.values()].filter((r) => r.pool === "physical-pilot").length,
    findings,
    receipts,
    byteAuditClean: rows.size > 0 && findings.length === 0,
    inferenceReady: false,
    releaseReady: false,
    limitation:
      "Hashes bind declared evidence bytes, not legal rights/material truth. dHash flags are review candidates, not proven duplicates. No cleaned image is written. No model ran.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
    assert(
      [3, 5].includes(process.argv.length),
      "usage: object-recognition-files.mjs MANIFEST|--historical [IMAGEIO_BINARY SHA256]",
    );
    let manifest;
    if (process.argv[2] === "--historical") {
      const { loadNativeCorpus } = await import("./reference-image/native-corpus-data.mjs");
      const corpus = loadNativeCorpus(root);
      manifest = {
        schemaVersion: "object-image-audit-v1",
        images: corpus.rows.map((r) => ({
          id: r.id,
          file: r.file,
          sha256: r.imageSha256,
          pool: "development",
          split: ["reference", "calibration_only"].includes(r.role) ? "train" : "test",
          objectId: r.id,
          sourceFamily: sha(Buffer.from(r.sourceFamily)),
          origin: "source",
          parentId: null,
          evidenceFile: Object.entries(corpus.files).find(
            ([, hash]) => hash === r.source.snapshotSha256,
          )?.[0],
          evidenceSha256: r.source.snapshotSha256,
        })),
      };
    } else manifest = JSON.parse(readBounded(confinedFile(root, process.argv[2]), 4_000_000));
    validateFileManifest(manifest);
    const decoder =
      process.argv.length === 5
        ? imageIoPixelDecoder(root, process.argv[3], process.argv[4])
        : pinnedPixelDecoder(root);
    const report = await auditImageFiles(root, manifest, decoder.decode);
    process.stdout.write(
      `${JSON.stringify({ decoderIdentity: decoder.decoderIdentity ?? { kind: "historical-sharp", lockSha256: decoder.lockSha256 }, manifestSha256: sha(Buffer.from(JSON.stringify(manifest))), ...report }, null, 2)}\n`,
    );
    process.exitCode = report.byteAuditClean ? 0 : 2;
  } catch {
    process.stderr.write(
      "Image audit rejected: check manifest, lineage, file bounds and pinned decoder availability.\n",
    );
    process.exitCode = 1;
  }
}
