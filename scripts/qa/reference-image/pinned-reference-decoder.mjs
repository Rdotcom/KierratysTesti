import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { checkedWorkFile, readBounded } from "../local-vision/embedding-control.mjs";

// Independently checked historical lock. Never derive this trust anchor from the
// ignored work/ directory, environment, a supplied manifest, or a module export.
export const PINNED_REFERENCE_DECODER_LOCK = Object.freeze({
  file: "work/vision-sounds-2026-11-12.l0vuRb/freeze/lock.json",
  sha256: "6f790d82b096dc6b344756ce3f748035d069181ab3949ab40096841e088b2c46",
  maximumLockBytes: 1_000_000,
  artifactCount: 58,
  maximumArtifactBytes: 64_000_000,
  maximumTotalArtifactBytes: 96_000_000,
});
export const PINNED_REFERENCE_DECODER_VERSIONS = Object.freeze({
  aom: "3.15.1",
  archive: "3.8.9",
  cairo: "1.18.6",
  cgif: "0.5.4",
  exif: "0.6.26",
  expat: "2.8.5",
  ffi: "3.8.0",
  fontconfig: "2.18.3",
  freetype: "2.14.3",
  fribidi: "1.0.17",
  glib: "2.90.0",
  harfbuzz: "14.5.0",
  heif: "1.23.5",
  highway: "1.4.0",
  imagequant: "2.4.1",
  lcms: "2.19.1",
  mozjpeg: "0826579",
  pango: "1.58.2",
  pixman: "0.46.4",
  png: "1.6.58",
  "proxy-libintl": "0.5",
  rsvg: "2.63.2",
  tiff: "4.7.2",
  uhdr: "2.0.2",
  vips: "8.18.7",
  webp: "1.6.0",
  xml2: "2.15.4",
  "zlib-ng": "2.3.3",
  sharp: "0.35.5",
});
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/u;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer").get;
const nativeOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset").get;
const nativeLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength").get;
const nativeBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
const nativeResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;

function snapshotLockBytes(input) {
  assert.ok(
    input &&
      (Object.getPrototypeOf(input) === Uint8Array.prototype ||
        Object.getPrototypeOf(input) === Buffer.prototype),
    "decoder_lock_bytes",
  );
  const buffer = nativeBuffer.call(input),
    offset = nativeOffset.call(input),
    length = nativeLength.call(input);
  assert.ok(
    Object.getPrototypeOf(buffer) === ArrayBuffer.prototype &&
      !nativeResizable?.call(buffer) &&
      nativeBufferLength.call(buffer) >= offset + length &&
      length > 0 &&
      length <= PINNED_REFERENCE_DECODER_LOCK.maximumLockBytes,
    "decoder_lock_bound",
  );
  // Do not consult an input iterator, Buffer subclass, getter, or species hook.
  return Buffer.from(new Uint8Array(buffer, offset, length));
}
function record(input, keys, reason) {
  assert.ok(
    input && typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype,
    reason,
  );
  const descriptors = Object.getOwnPropertyDescriptors(input),
    ownKeys = Reflect.ownKeys(descriptors);
  assert.ok(
    ownKeys.length === keys.length &&
      ownKeys.every((key) => typeof key === "string" && keys.includes(key)) &&
      keys.every((key) => Object.hasOwn(descriptors[key] ?? {}, "value")),
    reason,
  );
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function artifactPath(input) {
  return (
    typeof input === "string" &&
    input.length > 0 &&
    input.length <= 4096 &&
    !/[\p{Cc}\p{Cf}]/u.test(input) &&
    path.isAbsolute(input) &&
    path.normalize(input) === input &&
    path.basename(input).length > 0 &&
    input !== path.parse(input).root
  );
}

/**
 * Pure, bounded validator for byte-level regression fixtures. The explicit hash
 * is a trusted test input, not a production override: the loader below always
 * supplies the hard-coded historical pin. No file/module/network access here.
 */
export function validatePinnedReferenceDecoderLockBytes(input, trustedLockSha256) {
  assert.ok(
    typeof trustedLockSha256 === "string" && hashPattern.test(trustedLockSha256),
    "decoder_lock_pin",
  );
  const bytes = snapshotLockBytes(input);
  // Authenticate the entire record BEFORE parsing paths or decoder metadata.
  assert.equal(sha(bytes), trustedLockSha256, "decoder_lock_hash_mismatch");
  const lock = JSON.parse(bytes.toString("utf8"));
  assert.ok(
    lock &&
      Object.getPrototypeOf(lock) === Object.prototype &&
      lock.schemaVersion === "reference-pixel-comparison-lock-v2",
    "decoder_lock_schema",
  );
  const identity = record(
    lock.decoderIdentity,
    ["entry", "versions", "files"],
    "decoder_identity_shape",
  );
  const versions = record(
    identity.versions,
    Object.keys(PINNED_REFERENCE_DECODER_VERSIONS),
    "decoder_version_shape",
  );
  assert.deepEqual(versions, PINNED_REFERENCE_DECODER_VERSIONS, "decoder_version_pin");
  assert.ok(
    identity.files &&
      Object.getPrototypeOf(identity.files) === Object.prototype &&
      Reflect.ownKeys(identity.files).length === PINNED_REFERENCE_DECODER_LOCK.artifactCount,
    "decoder_artifact_count",
  );
  const files = {};
  for (const [file, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(identity.files),
  )) {
    assert.ok(artifactPath(file), "decoder_artifact_path");
    assert.ok(
      Object.hasOwn(descriptor, "value") &&
        typeof descriptor.value === "string" &&
        hashPattern.test(descriptor.value),
      "decoder_artifact_digest",
    );
    files[file] = descriptor.value;
  }
  assert.ok(artifactPath(identity.entry), "decoder_entry_path");
  assert.ok(Object.hasOwn(files, identity.entry), "decoder_entry_not_pinned");
  return Object.freeze({
    entry: identity.entry,
    versions: Object.freeze(versions),
    files: Object.freeze(files),
  });
}

/**
 * Verify all 58 known artifacts before executing the entry. This pins these
 * decoder artifacts, not the whole OS, module cache, or host runtime. The local
 * platform and its module loader remain explicit trusted assumptions.
 */
export function loadPinnedReferenceDecoder(cwd) {
  const lockFile = checkedWorkFile(PINNED_REFERENCE_DECODER_LOCK.file, cwd),
    bytes = readBounded(lockFile, PINNED_REFERENCE_DECODER_LOCK.maximumLockBytes),
    identity = validatePinnedReferenceDecoderLockBytes(bytes, PINNED_REFERENCE_DECODER_LOCK.sha256);
  let total = 0;
  for (const [file, digest] of Object.entries(identity.files)) {
    const info = fs.lstatSync(file);
    assert.ok(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.nlink === 1 &&
        Number.isSafeInteger(info.size) &&
        info.size >= 0 &&
        info.size <= PINNED_REFERENCE_DECODER_LOCK.maximumArtifactBytes,
      "decoder_artifact_bound",
    );
    total += info.size;
    assert.ok(
      total <= PINNED_REFERENCE_DECODER_LOCK.maximumTotalArtifactBytes,
      "decoder_total_bound",
    );
    // readBounded independently checks canonical paths, hard links and races.
    assert.equal(
      sha(readBounded(file, Math.max(1, info.size))),
      digest,
      "decoder_artifact_hash_mismatch",
    );
  }
  assert.equal(
    sha(readBounded(lockFile, PINNED_REFERENCE_DECODER_LOCK.maximumLockBytes)),
    PINNED_REFERENCE_DECODER_LOCK.sha256,
    "decoder_lock_drift_before_load",
  );
  const sharp = createRequire(import.meta.url)(identity.entry);
  assert.equal(typeof sharp, "function", "decoder_export");
  assert.deepEqual(sharp.versions, identity.versions, "decoder_loaded_version_drift");
  return Object.freeze({ sharp, identity, lockSha256: PINNED_REFERENCE_DECODER_LOCK.sha256 });
}
