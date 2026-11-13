import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  PINNED_REFERENCE_DECODER_LOCK,
  PINNED_REFERENCE_DECODER_VERSIONS,
  validatePinnedReferenceDecoderLockBytes,
} from "../qa/reference-image/pinned-reference-decoder.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const files = Object.fromEntries(
    Array.from({ length: 58 }, (_, index) => [
      `/synthetic-fixtures/decoder/artifact-${index}.cjs`,
      "a".repeat(64),
    ]),
  );
  return {
    schemaVersion: "reference-pixel-comparison-lock-v2",
    decoderIdentity: {
      entry: "/synthetic-fixtures/decoder/artifact-0.cjs",
      versions: { ...PINNED_REFERENCE_DECODER_VERSIONS },
      files,
    },
  };
}
function validate(lock) {
  const bytes = Buffer.from(JSON.stringify(lock));
  return validatePinnedReferenceDecoderLockBytes(bytes, sha(bytes));
}

test("historical decoder trust anchor is exact and immutable", () => {
  assert.equal(
    PINNED_REFERENCE_DECODER_LOCK.sha256,
    "6f790d82b096dc6b344756ce3f748035d069181ab3949ab40096841e088b2c46",
  );
  assert.equal(
    PINNED_REFERENCE_DECODER_LOCK.file,
    "work/vision-sounds-2026-11-12.l0vuRb/freeze/lock.json",
  );
  assert.equal(PINNED_REFERENCE_DECODER_LOCK.artifactCount, 58);
  assert.ok(Object.isFrozen(PINNED_REFERENCE_DECODER_LOCK));
});
test("pure synthetic validation needs no artifact, module, image, or network access", () => {
  const result = validate(fixture());
  assert.equal(result.entry, "/synthetic-fixtures/decoder/artifact-0.cjs");
  assert.equal(Object.keys(result.files).length, 58);
  assert.ok(
    Object.isFrozen(result) && Object.isFrozen(result.files) && Object.isFrozen(result.versions),
  );
});
test("changed or malformed lock is rejected by hash before JSON parsing", () => {
  const bytes = Buffer.from(JSON.stringify(fixture()));
  bytes[0] = 33;
  assert.throws(
    () => validatePinnedReferenceDecoderLockBytes(bytes, PINNED_REFERENCE_DECODER_LOCK.sha256),
    /decoder_lock_hash_mismatch/u,
  );
  assert.throws(
    () =>
      validatePinnedReferenceDecoderLockBytes(
        Buffer.from("{"),
        PINNED_REFERENCE_DECODER_LOCK.sha256,
      ),
    /decoder_lock_hash_mismatch/u,
  );
});
test("pin is explicit and cannot be absent or malformed", () => {
  const bytes = Buffer.from(JSON.stringify(fixture()));
  for (const pin of [undefined, null, "", "A".repeat(64), "0".repeat(63)])
    assert.throws(() => validatePinnedReferenceDecoderLockBytes(bytes, pin), /decoder_lock_pin/u);
});
test("oversized, shared, resizable, subclassed and getter byte inputs fail closed", () => {
  let getterCalls = 0;
  const getter = {
    get byteLength() {
      getterCalls++;
      return 1;
    },
  };
  class Bytes extends Uint8Array {}
  for (const bytes of [
    new Uint8Array(0),
    new Uint8Array(1_000_001),
    new Uint8Array(new SharedArrayBuffer(8)),
    new Uint8Array(new ArrayBuffer(8, { maxByteLength: 16 })),
    new Bytes(8),
    getter,
  ])
    assert.throws(
      () => validatePinnedReferenceDecoderLockBytes(bytes, "a".repeat(64)),
      /decoder_lock_(bytes|bound)/u,
    );
  assert.equal(getterCalls, 0);
});
test("native byte snapshot does not consult supplied getters or iterators", () => {
  const bytes = new Uint8Array(Buffer.from(JSON.stringify(fixture())));
  const pin = sha(bytes);
  let calls = 0;
  Object.defineProperty(bytes, "buffer", {
    get() {
      calls++;
      throw new Error("must not read");
    },
  });
  Object.defineProperty(bytes, Symbol.iterator, {
    get() {
      calls++;
      throw new Error("must not iterate");
    },
  });
  assert.equal(
    validatePinnedReferenceDecoderLockBytes(bytes, pin).entry,
    fixture().decoderIdentity.entry,
  );
  assert.equal(calls, 0);
});
test("unlisted executable entry is rejected even with 58 otherwise valid artifacts", () => {
  const lock = fixture();
  lock.decoderIdentity.entry = "/synthetic-fixtures/substituted-module.cjs";
  assert.throws(() => validate(lock), /decoder_entry_not_pinned/u);
});
test("entry must be a canonical absolute local path", () => {
  for (const entry of [
    "relative.cjs",
    "https://example.org/module.cjs",
    "/fixture/../module.cjs",
    "/fixture/module.cjs\n",
    "/",
  ]) {
    const lock = fixture();
    lock.decoderIdentity.entry = entry;
    assert.throws(() => validate(lock), /decoder_entry_path/u);
  }
});
test("artifact cardinality is exactly 58, not merely a nonempty manifest", () => {
  const tooFew = fixture(),
    tooMany = fixture();
  delete tooFew.decoderIdentity.files["/synthetic-fixtures/decoder/artifact-57.cjs"];
  tooMany.decoderIdentity.files["/synthetic-fixtures/decoder/artifact-58.cjs"] = "a".repeat(64);
  for (const lock of [tooFew, tooMany])
    assert.throws(() => validate(lock), /decoder_artifact_count/u);
});
test("all artifact digests and paths are checked", () => {
  for (const digest of [null, 1, "", "a".repeat(63), "A".repeat(64)]) {
    const lock = fixture();
    lock.decoderIdentity.files[lock.decoderIdentity.entry] = digest;
    assert.throws(() => validate(lock), /decoder_artifact_digest/u);
  }
  const lock = fixture();
  delete lock.decoderIdentity.files["/synthetic-fixtures/decoder/artifact-57.cjs"];
  lock.decoderIdentity.files["/synthetic-fixtures/../outside.cjs"] = "a".repeat(64);
  assert.throws(() => validate(lock), /decoder_artifact_path/u);
});
test("wrong decoder version or missing, extra version fields cannot reach a loader", () => {
  for (const key of ["sharp", "vips", "png"]) {
    const lock = fixture();
    lock.decoderIdentity.versions[key] = "99.0.0";
    assert.throws(() => validate(lock), /decoder_version_pin/u);
  }
  const missing = fixture(),
    extra = fixture();
  delete missing.decoderIdentity.versions.sharp;
  extra.decoderIdentity.versions.unexpected = "1.0.0";
  for (const lock of [missing, extra])
    assert.throws(() => validate(lock), /decoder_version_shape/u);
});
test("wrong identity schema, array, null and additional fields fail before loading", () => {
  const wrongSchema = fixture();
  wrongSchema.schemaVersion = "substituted-lock";
  assert.throws(() => validate(wrongSchema), /decoder_lock_schema/u);
  for (const value of [null, [], { ...fixture().decoderIdentity, override: true }]) {
    const lock = fixture();
    lock.decoderIdentity = value;
    assert.throws(() => validate(lock), /decoder_identity_shape/u);
  }
});
test("JSON prototype-pollution fields are rejected without changing prototypes", () => {
  const lock = fixture();
  Object.defineProperty(lock.decoderIdentity, "__proto__", {
    value: { polluted: true },
    enumerable: true,
  });
  assert.throws(() => validate(lock), /decoder_identity_shape/u);
  assert.equal(Object.prototype.polluted, undefined);
});
test("production source authenticates bytes and all artifacts before require", () => {
  const source = fs.readFileSync(
    new URL("../qa/reference-image/pinned-reference-decoder.mjs", import.meta.url),
    "utf8",
  );
  const validator = source.slice(
    source.indexOf("export function validatePinnedReferenceDecoderLockBytes"),
  );
  assert.ok(validator.indexOf("decoder_lock_hash_mismatch") < validator.indexOf("JSON.parse"));
  const loader = source.slice(source.indexOf("export function loadPinnedReferenceDecoder"));
  assert.ok(
    loader.indexOf(
      "validatePinnedReferenceDecoderLockBytes(bytes, PINNED_REFERENCE_DECODER_LOCK.sha256)",
    ) < loader.indexOf("createRequire"),
  );
  assert.ok(loader.indexOf("decoder_artifact_hash_mismatch") < loader.indexOf("createRequire"));
  assert.match(loader, /readBounded\(file, Math\.max\(1, info\.size\)\)/u);
  assert.match(loader, /decoder_total_bound/u);
  assert.match(loader, /decoder_loaded_version_drift/u);
  assert.doesNotMatch(source, /process\.env|fetch\(|https?:\/\//u);
});
test("future byte smoke uses the shared pin and records its provenance", () => {
  const source = fs.readFileSync(
    new URL("../qa/reference-image/runtime-byte-smoke.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /import \{ loadPinnedReferenceDecoder \} from "\.\/pinned-reference-decoder\.mjs"/u,
  );
  assert.match(
    source,
    /const \{ sharp, identity, lockSha256 \} = loadPinnedReferenceDecoder\(cwd\)/u,
  );
  assert.match(source, /decoderLockSha256: lockSha256/u);
  assert.doesNotMatch(source, /createRequire|previous\.decoderIdentity/u);
});
