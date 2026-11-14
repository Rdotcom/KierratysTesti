// Derived contact sheets and duplicate-risk audit only; no product inference.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkedOutput,
  checkedWorkFile,
  readBounded,
  writeJsonExclusive,
} from "./local-vision/embedding-control.mjs";
import { writeBytes } from "./reference-image/acquire-off-references.mjs";
import { loadPinnedReferenceDecoder } from "./reference-image/pinned-reference-decoder.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const input = "work/off-expansion-2026-11-14.KK6s7m/images/summary.json";
const expected = "defc205b180a0997961c818dcbfcd1d3fde6513aa34dde1b1738d6c021dbc798";
const output = checkedOutput(process.argv[2], root),
  bytes = readBounded(checkedWorkFile(input, root), 2_000_000);
assert.equal(sha(bytes), expected);
const summary = JSON.parse(bytes),
  decoder = loadPinnedReferenceDecoder(root);
fs.mkdirSync(output, { mode: 0o700 });
const profiles = [],
  sheets = [];
for (const code of [...new Set(summary.rows.map((r) => r.gtin))]) {
  const rows = summary.rows.filter((r) => r.gtin === code),
    layers = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i],
      x = (i % 3) * 240,
      y = Math.floor(i / 3) * 360;
    const caption = `${row.id} | ${row.originalId} | ${row.proposedRole.startsWith("reference") ? "REF" : row.proposedRole.startsWith("evaluation") ? "EVAL" : "RESERVE"}`;
    const label = Buffer.from(
      `<svg width="240" height="40"><rect width="240" height="40" fill="white"/><text x="8" y="26" font-size="14" fill="black">${caption}</text></svg>`,
    );
    layers.push({ input: label, left: x, top: y });
    if (row.status !== "pending_visual_review") continue;
    const image = readBounded(checkedWorkFile(row.reviewFile, root), 4_194_304);
    assert.equal(sha(image), row.reviewSha256);
    const resized = await decoder
      .sharp(image)
      .resize({ width: 228, height: 310, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    layers.push({
      input: resized.data,
      left: x + Math.floor((240 - resized.info.width) / 2),
      top: y + 44,
    });
    const pixels = await decoder.sharp(image).removeAlpha().raw().toBuffer();
    const tiny = await decoder
      .sharp(image)
      .resize(9, 8, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    let fingerprint = "";
    for (let dy = 0; dy < 8; dy++)
      for (let dx = 0; dx < 8; dx++)
        fingerprint += tiny[dy * 9 + dx] > tiny[dy * 9 + dx + 1] ? "1" : "0";
    profiles.push({
      id: row.id,
      gtin: code,
      familyId: row.familyId,
      originalSha256: row.originalSha256,
      reviewSha256: row.reviewSha256,
      pixelSha256: sha(pixels),
      width: row.width,
      height: row.height,
      dhash64: fingerprint,
    });
  }
  const image = await decoder
    .sharp({ create: { width: 720, height: 720, channels: 3, background: "#eeeeee" } })
    .composite(layers)
    .png()
    .toBuffer();
  const file = path.join(output, `${code}.png`);
  writeBytes(file, image, 8_000_000, root);
  sheets.push({ gtin: code, file: path.relative(root, file), sha256: sha(image) });
}
const duplicateRisks = [];
for (let a = 0; a < profiles.length; a++)
  for (let b = a + 1; b < profiles.length; b++) {
    const x = profiles[a],
      y = profiles[b],
      distance = [...x.dhash64].reduce((sum, bit, i) => sum + Number(bit !== y.dhash64[i]), 0);
    const exact = x.pixelSha256 === y.pixelSha256 && x.width === y.width && x.height === y.height;
    if (exact || distance <= 4)
      duplicateRisks.push({
        a: x.id,
        b: y.id,
        exactDecodedPixels: exact,
        dhashDistance: distance,
        kind:
          x.gtin === y.gtin
            ? "possible_same_product_duplicate"
            : "possible_cross_product_visual_conflict",
        independentlyVerifiedDuplicate: false,
      });
  }
const saved = writeJsonExclusive(
  path.join(output, "audit.json"),
  {
    schemaVersion: "off-expansion-pixel-risk-v1",
    input,
    inputSha256: expected,
    decoderLockSha256: decoder.lockSha256,
    sourceSha256: sha(readBounded(fileURLToPath(import.meta.url), 1_000_000)),
    profiles,
    duplicateRisks,
    sheets,
    semanticModelCalls: 0,
    visualIdentityAccepted: false,
    integrationAllowed: false,
  },
  root,
);
process.stdout.write(
  `${JSON.stringify({ audit: path.relative(root, saved.path), sha256: saved.sha256, images: profiles.length, duplicateRisks, sheets })}\n`,
);
