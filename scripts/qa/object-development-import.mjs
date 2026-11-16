// Private, bounded source acquisition/clean copies. Never model or app work.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";
import { fileURLToPath } from "node:url";
import { readBounded } from "./local-vision/embedding-control.mjs";
import {
  confinedFile,
  historicalFileManifest,
  imageIoPixelDecoder,
  validateFileManifest,
} from "./object-recognition-files.mjs";
export const sourceTitles = Object.freeze([
  "File:Ceramic mug.jpg",
  "File:Wooden Spoon.jpg",
  "File:Spoon-20080714.jpg",
  "File:Wooden Spoon and Fork 01.jpg",
  "File:A white mug filled with warm coffee.jpg",
]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const write = (p, bytes) => fs.writeFileSync(p, bytes, { flag: "wx", mode: 0o600 });
const allowedHosts = new Set([
  "commons.wikimedia.org",
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
]);
export function stripPngMetadata(bytes) {
  assert(
    Buffer.isBuffer(bytes) &&
      bytes.length <= 8_000_000 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "png_signature",
  );
  const chunks = [bytes.subarray(0, 8)];
  let at = 8,
    header = false,
    data = false,
    end = false;
  while (at < bytes.length) {
    assert(at + 12 <= bytes.length && !end, "png_truncated");
    const n = bytes.readUInt32BE(at),
      next = at + n + 12;
    assert(next <= bytes.length, "png_length");
    const type = bytes.toString("ascii", at + 4, at + 8);
    assert(
      /^[A-Za-z]{4}$/.test(type) &&
        crc32(bytes.subarray(at + 4, next - 4)) === bytes.readUInt32BE(next - 4),
      "png_crc",
    );
    assert(header || type === "IHDR", "png_header");
    if (type === "IHDR") {
      assert(!header && n === 13, "png_header");
      header = true;
    }
    if (type === "IDAT") data = true;
    if (type === "IEND") {
      assert(n === 0 && data, "png_end");
      end = true;
    }
    const keep = ["IHDR", "PLTE", "tRNS", "sRGB", "gAMA", "cHRM", "IDAT", "IEND"].includes(type);
    assert(keep || type[0] === type[0].toLowerCase(), "unknown_critical_png_chunk");
    if (keep) chunks.push(bytes.subarray(at, next));
    at = next;
  }
  assert(end, "png_end");
  return Buffer.concat(chunks);
}
export function checkedSourceUrl(raw) {
  const u = new URL(raw);
  assert(
    u.protocol === "https:" &&
      allowedHosts.has(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port,
    "source_origin",
  );
  return u;
}
async function boundedFetch(url, maximum, type) {
  checkedSourceUrl(url);
  const r = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "KierratysAppi-research/0.1 (local educational image research)" },
  });
  assert(r.ok && r.headers.get("content-type")?.startsWith(type), "source_response");
  assert(Number(r.headers.get("content-length") ?? 0) <= maximum, "source_declared_bound");
  let n = 0;
  const chunks = [];
  try {
    for await (const part of r.body) {
      n += part.length;
      assert(n <= maximum, "source_byte_bound");
      chunks.push(part);
    }
  } finally {
    if (n > maximum) await r.body?.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
export function commonsRecord(json) {
  assert(json?.query?.pages && Object.keys(json.query.pages).length === 1, "source_page");
  const page = Object.values(json.query.pages)[0],
    info = page.imageinfo?.[0],
    extra = info?.extmetadata;
  assert(page.pageid > 0 && info && extra, "source_info");
  const license = extra.LicenseShortName?.value;
  assert(
    [
      "CC0",
      "CC0 1.0",
      "CC BY 2.0",
      "CC BY 3.0",
      "CC BY 4.0",
      "CC BY-SA 3.0",
      "CC BY-SA 4.0",
    ].includes(license),
    "source_license",
  );
  assert(extra.Artist?.value && extra.LicenseUrl?.value, "source_credit_missing");
  const imageUrl = info.thumburl ?? info.url;
  checkedSourceUrl(imageUrl);
  return {
    pageId: page.pageid,
    title: page.title,
    imageUrl,
    authorHtml: extra.Artist.value,
    license,
    licenseUrl: extra.LicenseUrl.value,
    sourcePage: info.descriptionurl,
    sourceImageUrl: info.url,
    upstreamResized: Boolean(info.thumburl),
    independence: "unverified-web-source-development-only",
    materialTruth: "unknown",
  };
}
export function aggregateLineage(manifests, reports) {
  assert(manifests.length === reports.length && manifests.length <= 40, "batch_count");
  const combined = {
    schemaVersion: "object-image-audit-v1",
    images: manifests.flatMap((m) => m.images),
  };
  const rows = validateFileManifest(combined, 20000),
    receipts = new Map(),
    groups = new Map(),
    findings = [];
  for (const report of reports) {
    assert.equal(report.schemaVersion, "object-image-audit-result-v1", "report_schema");
    assert(Array.isArray(report.receipts), "report_receipts");
    for (const receipt of report.receipts) {
      const row = rows.get(receipt.id);
      assert(
        row && row.sha256 === receipt.imageSha256 && row.evidenceSha256 === receipt.evidenceSha256,
        "receipt_join",
      );
      assert(!receipts.has(receipt.id), "duplicate_global_receipt");
      assert(/^[a-f0-9]{64}$/.test(receipt.pixelSha256), "pixel_hash");
      receipts.set(receipt.id, receipt);
    }
  }
  for (const row of rows.values()) {
    if (!receipts.has(row.id)) findings.push({ kind: "missing_global_receipt", id: row.id });
    const receipt = receipts.get(row.id);
    if (!receipt) continue;
    for (const [kind, value] of [
      ["object", row.objectId],
      ["family", row.sourceFamily],
      ["bytes", row.sha256],
      ["pixels", receipt.pixelSha256],
    ]) {
      const key = `${kind}:${value}`,
        group = groups.get(key) ?? { ids: [], splits: new Set() };
      group.ids.push(row.id);
      group.splits.add(`${row.pool}:${row.split}`);
      groups.set(key, group);
    }
  }
  for (const [key, group] of groups)
    if (group.splits.size > 1)
      findings.push({ kind: `global_cross_split_${key.split(":")[0]}`, ids: group.ids });
  // Global dHash comparison is bounded separately; no truncation masquerades as completion.
  const list = [...receipts.values()];
  let pairsChecked = 0;
  const nearReview = [];
  const completeNearScan = list.length <= 2000;
  if (completeNearScan)
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        assert(
          /^[a-f0-9]{16}$/.test(list[i].perceptualHash) &&
            /^[a-f0-9]{16}$/.test(list[j].perceptualHash),
          "perceptual_hash",
        );
        const a = rows.get(list[i].id),
          b = rows.get(list[j].id);
        // Parent-child copies are expected; cross-pool/split reuse is never exempted.
        if (a.objectId === b.objectId && a.pool === b.pool && a.split === b.split) continue;
        pairsChecked++;
        let bits = BigInt(`0x${list[i].perceptualHash}`) ^ BigInt(`0x${list[j].perceptualHash}`),
          n = 0;
        while (bits) {
          bits &= bits - 1n;
          n++;
        }
        if (n <= 4)
          nearReview.push({
            ids: [a.id, b.id],
            crossSplit: a.pool !== b.pool || a.split !== b.split,
          });
      }
  return {
    images: rows.size,
    receipts: receipts.size,
    findings,
    nearReview,
    pairsChecked,
    completeNearScan,
    metadataFlags: list.filter((r) => r.metadataPresent).length,
    inferenceReady: false,
    releaseReady: false,
    limitation:
      "Global declared joins/duplicates, not independent capture or material truth; metadata-bearing originals remain quarantined.",
  };
}

export async function importDevelopment(
  root,
  out,
  binary,
  binarySha256,
  acquire = false,
  reuseSources = null,
) {
  assert(out.startsWith("work/"), "private_output_only");
  const parent = confinedFile(root, path.posix.dirname(out));
  assert(!fs.existsSync(path.join(root, out)), "output_exists");
  assert(path.posix.basename(out).match(/^[a-z0-9][a-zA-Z0-9.-]{0,79}$/), "output_name");
  const target = path.join(parent, path.posix.basename(out));
  fs.mkdirSync(target, { mode: 0o700 });
  const decoder = imageIoPixelDecoder(root, binary, binarySha256),
    executable = confinedFile(root, binary);
  const original = historicalFileManifest(root),
    sources = [],
    acquisition = [];
  write(path.join(target, "historical-manifest.json"), JSON.stringify(original, null, 2));
  if (reuseSources) {
    const prior = JSON.parse(
      readBounded(confinedFile(root, `${reuseSources}/new-sources.json`), 1_000_000),
    );
    validateFileManifest(prior);
    const priorCredits = JSON.parse(
      readBounded(confinedFile(root, `${reuseSources}/attribution.json`), 1_000_000),
    );
    for (const row of prior.images) {
      assert(row.pool === "development" && row.origin === "source", "reuse_source_only");
      assert.equal(
        sha(readBounded(confinedFile(root, row.file), 4_000_000)),
        row.sha256,
        "reuse_image_hash",
      );
      assert.equal(
        sha(readBounded(confinedFile(root, row.evidenceFile), 1_000_000)),
        row.evidenceSha256,
        "reuse_evidence_hash",
      );
      const record = priorCredits.find((r) => r.id === row.id);
      assert(
        record?.imageSha256 === row.sha256 && record.evidenceSha256 === row.evidenceSha256,
        "reuse_credit_join",
      );
      sources.push(row);
      acquisition.push(record);
    }
  }
  if (acquire)
    for (let i = 0; i < sourceTitles.length; i++) {
      if (acquisition.some((r) => r.title === sourceTitles[i])) continue;
      const id = `commons-${i + 1}`;
      try {
        const api = new URL("https://commons.wikimedia.org/w/api.php");
        api.search = new URLSearchParams({
          action: "query",
          format: "json",
          prop: "imageinfo",
          iiprop: "url|extmetadata",
          titles: sourceTitles[i],
          iiurlwidth: "1280",
        });
        const evidence = await boundedFetch(api.href, 1_000_000, "application/json");
        write(path.join(target, `${id}-source.json`), evidence);
        const record = commonsRecord(JSON.parse(evidence));
        const bytes = await boundedFetch(record.imageUrl, 4_000_000, "image/jpeg");
        write(path.join(target, `${id}.jpg`), bytes);
        sources.push({
          id,
          file: `${out}/${id}.jpg`,
          sha256: sha(bytes),
          pool: "development",
          split: "test",
          objectId: id,
          sourceFamily: `commons-page-${record.pageId}`,
          origin: "source",
          parentId: null,
          evidenceFile: `${out}/${id}-source.json`,
          evidenceSha256: sha(evidence),
        });
        acquisition.push({
          id,
          status: "acquired-not-visually-reviewed",
          checkedOn: "2026-11-16",
          imageSha256: sha(bytes),
          evidenceSha256: sha(evidence),
          ...record,
        });
      } catch {
        acquisition.push({
          id,
          title: sourceTitles[i],
          status: "acquisition-failed-retained-no-retry",
        });
      }
      write(path.join(target, `${id}-receipt.json`), JSON.stringify(acquisition.at(-1), null, 2));
    }
  const newSources = { schemaVersion: "object-image-audit-v1", images: sources };
  write(path.join(target, "new-sources.json"), JSON.stringify(newSources, null, 2));
  write(path.join(target, "attribution.json"), JSON.stringify(acquisition, null, 2));
  const images = [...original.images, ...sources],
    derived = [],
    transformations = [];
  for (const row of images) {
    try {
      const bytes = readBounded(confinedFile(root, row.file), 8_000_000);
      assert.equal(sha(bytes), row.sha256, "original_drift");
      assert.equal(sha(readBounded(executable, 8_000_000)), binarySha256, "cleaner_drift");
      const r = spawnSync(executable, ["--clean"], {
        input: bytes,
        timeout: 10000,
        maxBuffer: 8_000_001,
      });
      assert.equal(r.status, 0, "clean_failure");
      assert(r.stdout.length > 0 && r.stdout.length <= 8_000_000, "clean_bound");
      const clean = stripPngMetadata(r.stdout);
      const pixels = await decoder.decode(clean);
      assert.equal(pixels.metadataPresent, false, "metadata_remains");
      const file = `${out}/${row.id}-clean.png`;
      write(path.join(root, file), clean);
      // Verify original remained unchanged and preserve parent/source relationship.
      assert.equal(
        sha(readBounded(confinedFile(root, row.file), 8_000_000)),
        row.sha256,
        "original_changed",
      );
      derived.push({
        ...row,
        id: `${row.id}-clean`,
        file,
        sha256: sha(clean),
        origin: "derived",
        parentId: row.id,
      });
      transformations.push({
        id: row.id,
        originalSha256: row.sha256,
        cleanSha256: sha(clean),
        cleanerSha256: binarySha256,
        recipe: "imageio-srgb-png-and-ancillary-strip-v1",
        pixels,
        status: "clean",
      });
    } catch {
      transformations.push({ id: row.id, status: "cleaning-failed-retained" });
    }
  }
  const combined = { schemaVersion: "object-image-audit-v1", images: [...images, ...derived] };
  validateFileManifest(combined);
  write(path.join(target, "combined-manifest.json"), JSON.stringify(combined, null, 2));
  write(
    path.join(target, "transformations.json"),
    JSON.stringify(
      {
        decoder: decoder.decoderIdentity,
        importerSha256: sha(
          readBounded(confinedFile(root, "scripts/qa/object-development-import.mjs"), 100_000),
        ),
        transformations,
      },
      null,
      2,
    ),
  );
  return {
    directory: out,
    originalImages: images.length,
    newSources: sources.length,
    cleaned: derived.length,
    failedCleaning: transformations.filter((r) => r.status !== "clean").length,
    acquired: acquisition.map((r) => ({ id: r.id, status: r.status })),
    inferenceReady: false,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
    if (process.argv[2] === "--aggregate") {
      assert(process.argv.length === 5, "aggregate_arguments");
      const json = (p) => JSON.parse(readBounded(confinedFile(root, p), 16_000_000));
      const result = aggregateLineage([json(process.argv[3])], [json(process.argv[4])]);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode =
        result.findings.length ||
        result.nearReview.length ||
        result.metadataFlags ||
        !result.completeNearScan
          ? 2
          : 0;
    } else {
      assert(
        [5, 6, 7].includes(process.argv.length) &&
          (process.argv.length === 5 ||
            (process.argv.length === 6 && process.argv[5] === "--acquire-commons") ||
            (process.argv.length === 7 &&
              ["--reuse-sources", "--reuse-and-acquire"].includes(process.argv[5]))),
        "arguments",
      );
      console.log(
        JSON.stringify(
          await importDevelopment(
            root,
            process.argv[2],
            process.argv[3],
            process.argv[4],
            process.argv.length === 6 || process.argv[5] === "--reuse-and-acquire",
            process.argv[6] ?? null,
          ),
        ),
      );
    }
  } catch {
    process.stderr.write("Development import rejected; output preserved, no overwrite/retry.\n");
    process.exitCode = 1;
  }
}
