import { describe, expect, it } from "vitest";
import { extractReferenceImageFeaturesV2 } from "../reference-image-features-v2";
import {
  compileReferenceImageRuntime,
  REFERENCE_RUNTIME_FEATURE_HASH_POLICY,
  type ReferenceRuntimePorts,
} from "../reference-image-runtime";

// Synthetic RGB and tiny opaque byte tags only. The injected decoder is a test
// double, not JPEG decoding, human review, real product identity or accuracy.
// Deliberately NON-cryptographic deterministic port double. Shared tests stay
// platform-independent; this checks joins/control flow, not SHA-256 correctness.
const fixtureHash = (bytes: Uint8Array) => {
  let state = 2166136261;
  for (const byte of bytes) state = Math.imul(state ^ byte, 16777619) >>> 0;
  return state.toString(16).padStart(8, "0").repeat(8);
};
const policy = { asOf: "2026-11-13", featureVersion: "pixel-scale-corners-v2" };
const review = {
  status: "accepted",
  reviewerId: "synthetic-reviewer",
  reviewedOn: "2026-11-12",
  evidence: "Synthetic fixture only",
  reconciliation: "accepted",
};
function rgb(seed: number) {
  let state = seed;
  const cells = Array.from({ length: 16 * 16 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return 30 + (state % 190);
  });
  const data = new Uint8Array(128 * 128 * 3);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++)
      data.fill(
        cells[Math.floor(y / 8) * 16 + Math.floor(x / 8)] ?? 0,
        (y * 128 + x) * 3,
        (y * 128 + x) * 3 + 3,
      );
  return { width: 128, height: 128, data };
}
const imageA = rgb(17);
const imageB = rgb(712);
const empty = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 3) };
function featureHash(image: unknown) {
  const extracted = extractReferenceImageFeaturesV2(image);
  if (extracted.status !== "ok") throw new Error("bad_synthetic_texture");
  return fixtureHash(new TextEncoder().encode(JSON.stringify(extracted.features)));
}
const hashA = featureHash(imageA),
  hashB = featureHash(imageB);
function fixture() {
  const encoded = [Uint8Array.of(1), Uint8Array.of(2), Uint8Array.of(3)];
  const references = encoded.map((value, index) => ({
    referenceId: `ref-${index}`,
    productId: "synthetic-product",
    imageSha256: fixtureHash(value),
    capturedOn: "2026-11-11",
    sourceFamilyId: `family-${index}`,
    captureGroupId: `capture-${index}`,
    split: index < 2 ? "enrollment" : "independent_query",
    origin: "independent_capture",
    rights: {
      kind: "owner_capture",
      ownerAlias: "synthetic-owner",
      license: "OWNER-PERMISSION",
      permissionEvidenceId: `permission-${index}`,
      review: { ...review },
    },
  }));
  const catalogue = {
    schemaVersion: "reference-image-catalogue-v1",
    catalogueId: "synthetic-catalogue",
    featureVersion: policy.featureVersion,
    products: [
      {
        productId: "synthetic-product",
        label: "Synthetic named fixture",
        gtin: "00000000000000",
        identity: { method: "physical_label", evidenceId: "label-fixture", review: { ...review } },
      },
    ],
    references,
    featureReceipts: references.map((reference, index) => ({
      referenceId: reference.referenceId,
      imageSha256: reference.imageSha256,
      featureSha256: index < 2 ? hashA : hashB,
      featureVersion: policy.featureVersion,
    })),
    acceptance: { ...review },
  };
  const bytes = references.map((reference, index) => ({
    referenceId: reference.referenceId,
    encoded: encoded[index] ?? new Uint8Array(),
  }));
  const calls = { hashes: 0, decodes: 0 };
  const ports: ReferenceRuntimePorts = {
    async sha256(input) {
      calls.hashes++;
      return fixtureHash(input);
    },
    async decodeRgb(input, limits) {
      calls.decodes++;
      expect(limits).toEqual({ maximumDimension: 1024, maximumPixels: 1048576 });
      return input[0] === 3 || input[0] === 4 ? imageB : input[0] === 5 ? empty : imageA;
    },
  };
  return { catalogue, bytes, ports, calls };
}
const compile = (value = fixture()) =>
  compileReferenceImageRuntime(value.catalogue, policy, value.bytes, value.ports);
async function runtime(value = fixture()) {
  const result = await compile(value);
  if (result.status !== "ready")
    throw new Error(`Expected synthetic compiler readiness: ${result.status}`);
  return result;
}

describe("byte-bound experimental reference runtime", () => {
  it("computes actual V2 features and binds every metadata/reference/feature receipt", async () => {
    const value = fixture();
    const result = await runtime(value);
    expect(result).toMatchObject({
      status: "ready",
      enrollmentReferences: 2,
      boundIndependentQueries: 1,
      featureHashPolicy: REFERENCE_RUNTIME_FEATURE_HASH_POLICY,
      integrationAllowed: false,
    });
    expect(value.calls).toEqual({ hashes: 6, decodes: 3 });
    expect(Object.keys(result.runtime)).toEqual(["identify"]);
    expect(Object.isFrozen(result.runtime)).toBe(true);
    expect(result.runtime).not.toHaveProperty("features");
    const found = await result.runtime.identify(Uint8Array.of(1));
    expect(found).toMatchObject({
      status: "candidate",
      product: {
        productId: "synthetic-product",
        label: "Synthetic named fixture",
        declaredIdentifier: { verificationStatus: "reviewer_asserted" },
      },
      reference: { split: "enrollment" },
      verificationStatus: "inferred",
      confidence: "uncalibrated_visual_similarity",
      integrationAllowed: false,
    });
    if (found.status !== "candidate") throw new Error("Expected synthetic feature match");
    expect(found.product.identity).toEqual(value.catalogue.products[0]?.identity);
    expect(found.reference.rights).toEqual(value.catalogue.references[0]?.rights);
    expect(found.featureReceipt.featureSha256).toBe(hashA);
    expect(found.catalogueAcceptance).toEqual(value.catalogue.acceptance);
    for (const key of ["bin", "material", "verifiedGtin", "verifiedIdentity", "probability"])
      expect(found).not.toHaveProperty(key);
  });

  it("checks held-out query references but never enrolls them", async () => {
    const compiled = await runtime();
    expect(await compiled.runtime.identify(Uint8Array.of(3))).toMatchObject({
      status: "unknown",
      reason: "no_geometric_match",
    });
  });

  it("retains cross-product ambiguity rather than selecting a shared-brand identity", async () => {
    const value = fixture();
    const product = value.catalogue.products[0];
    if (!product) throw new Error("missing synthetic product");
    value.catalogue.products.push({
      ...product,
      productId: "synthetic-other",
      label: "Other synthetic product",
      gtin: "00000000000017",
    });
    const originalReferences = [...value.catalogue.references];
    for (let index = 0; index < 3; index++) {
      const reference = originalReferences[index];
      if (!reference) throw new Error("missing synthetic reference");
      const encoded = Uint8Array.of(6 + index);
      const referenceId = `other-${index}`;
      const imageSha256 = fixtureHash(encoded);
      value.catalogue.references.push({
        ...reference,
        referenceId,
        productId: "synthetic-other",
        imageSha256,
        sourceFamilyId: `other-family-${index}`,
        captureGroupId: `other-capture-${index}`,
      });
      value.catalogue.featureReceipts.push({
        referenceId,
        imageSha256,
        featureSha256: hashA,
        featureVersion: policy.featureVersion,
      });
      value.bytes.push({ referenceId, encoded });
    }
    const compiled = await runtime(value);
    const result = await compiled.runtime.identify(Uint8Array.of(1));
    expect(result).toMatchObject({
      status: "ambiguous",
      productIds: ["synthetic-other", "synthetic-product"],
      integrationAllowed: false,
    });
    expect(result).not.toHaveProperty("product");
    expect(result).not.toHaveProperty("declaredIdentifier");
  });

  it("rejects metadata that is invalid or incomplete before any hash or decoder call", async () => {
    const value = fixture();
    value.catalogue.acceptance.status = "pending";
    expect(await compile(value)).toMatchObject({ status: "incomplete", integrationAllowed: false });
    value.catalogue.schemaVersion = "forged-ready";
    expect(await compile(value)).toMatchObject({ status: "invalid", reason: "invalid_metadata" });
    expect(value.calls).toEqual({ hashes: 0, decodes: 0 });
    expect(
      await compileReferenceImageRuntime({ status: "ready", runtime: {} }, policy, [], value.ports),
    ).toMatchObject({ status: "invalid" });
  });

  it("refuses V1 catalogue policy rather than silently running V2", async () => {
    const value = fixture();
    const v1 = {
      ...value.catalogue,
      featureVersion: "pixel-corners-v1",
      featureReceipts: value.catalogue.featureReceipts.map((receipt) => ({
        ...receipt,
        featureVersion: "pixel-corners-v1",
      })),
    };
    expect(
      await compileReferenceImageRuntime(
        v1,
        { ...policy, featureVersion: "pixel-corners-v1" },
        value.bytes,
        value.ports,
      ),
    ).toMatchObject({ status: "invalid", reason: "invalid_metadata" });
    expect(value.calls.decodes).toBe(0);
  });

  it("requires the exact reference-byte set without extra caller features or ready flags", async () => {
    for (const transform of [
      (bytes: unknown[]) => bytes.slice(1),
      (bytes: unknown[]) => [...bytes, bytes[0]],
      (bytes: unknown[]) => [bytes[0], bytes[0], bytes[2]],
      (bytes: unknown[]) => [{ ...(bytes[0] as object), features: {} }, ...bytes.slice(1)],
    ]) {
      const value = fixture();
      expect(
        await compileReferenceImageRuntime(
          value.catalogue,
          policy,
          transform(value.bytes),
          value.ports,
        ),
      ).toMatchObject({ status: "invalid", reason: "invalid_reference_bytes" });
      expect(value.calls).toEqual({ hashes: 0, decodes: 0 });
    }
  });

  it("compares encoded image hash before decoding and actual feature hash after extraction", async () => {
    const value = fixture();
    value.bytes[0]?.encoded.fill(9);
    expect(await compile(value)).toMatchObject({
      status: "invalid",
      reason: "image_hash_mismatch",
    });
    expect(value.calls).toEqual({ hashes: 1, decodes: 0 });
    const mismatched = fixture();
    const receipt = mismatched.catalogue.featureReceipts[0];
    if (!receipt) throw new Error("missing fixture");
    receipt.featureSha256 = "a".repeat(64);
    expect(await compile(mismatched)).toMatchObject({
      status: "invalid",
      reason: "feature_hash_mismatch",
    });
    expect(mismatched.calls).toEqual({ hashes: 2, decodes: 1 });
  });

  it("rejects swapped source bytes and refuses a partially bound catalogue", async () => {
    const value = fixture();
    const first = value.bytes[0],
      second = value.bytes[1];
    if (!first || !second) throw new Error("missing synthetic assets");
    [first.encoded, second.encoded] = [second.encoded, first.encoded];
    expect(await compile(value)).toMatchObject({
      status: "invalid",
      reason: "image_hash_mismatch",
    });
    expect(value.calls).toEqual({ hashes: 1, decodes: 0 });
    const partial = fixture();
    const lastReceipt = partial.catalogue.featureReceipts[2];
    if (!lastReceipt) throw new Error("missing synthetic receipt");
    lastReceipt.featureSha256 = "b".repeat(64);
    const result = await compile(partial);
    expect(result).toMatchObject({ status: "invalid", reason: "feature_hash_mismatch" });
    expect(result).not.toHaveProperty("runtime");
    expect(partial.calls).toEqual({ hashes: 6, decodes: 3 });
  });

  it("snapshots all source bytes and metadata before awaiting trusted ports", async () => {
    const value = fixture();
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalHash = value.ports.sha256;
    let first = true;
    value.ports.sha256 = async (bytes) => {
      if (first) {
        first = false;
        await pending;
      }
      return originalHash(bytes);
    };
    const compiling = compile(value);
    value.bytes.forEach((entry) => {
      entry.encoded.fill(99);
    });
    const product = value.catalogue.products[0];
    if (product) product.label = "Mutated caller label";
    if (!release) throw new Error("missing release");
    release();
    const result = await compiling;
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(await result.runtime.identify(Uint8Array.of(1))).toMatchObject({
      status: "candidate",
      product: { label: "Synthetic named fixture" },
    });
  });

  it("passes separate copies to hash and decode and clears only its own temporary copies", async () => {
    const value = fixture();
    const observed: Uint8Array[] = [];
    value.ports.sha256 = async (bytes) => {
      observed.push(bytes);
      const digest = fixtureHash(bytes);
      bytes.fill(99);
      return digest;
    };
    const decode = value.ports.decodeRgb;
    value.ports.decodeRgb = async (bytes, limits) => {
      observed.push(bytes);
      const image = await decode(bytes, limits);
      bytes.fill(98);
      return image;
    };
    const result = await compile(value);
    expect(result.status).toBe("ready");
    expect(value.bytes.map((entry) => entry.encoded[0])).toEqual([1, 2, 3]);
    expect(new Set(observed).size).toBe(observed.length);
    expect(observed.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
  });

  it("serializes compile and identify without accumulating a query queue", async () => {
    const value = fixture();
    const compiled = await runtime(value);
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalHash = value.ports.sha256;
    // Existing runtime captured its original ports. A new runtime captures this
    // separately delayed implementation before any identify operation starts.
    value.ports.sha256 = async (bytes) => {
      await pending;
      return originalHash(bytes);
    };
    const compiling = compile(value);
    expect(await compiled.runtime.identify(Uint8Array.of(1))).toMatchObject({
      status: "unavailable",
      reason: "busy",
    });
    expect(await compile(fixture())).toMatchObject({ status: "unavailable", reason: "busy" });
    if (!release) throw new Error("missing release");
    release();
    expect((await compiling).status).toBe("ready");
    expect((await compiled.runtime.identify(Uint8Array.of(1))).status).toBe("candidate");
  });

  it.each(["throw", "invalid_hash", "decode_throw", "invalid_rgb", "low_detail"])(
    "fails closed and releases serial work after %s",
    async (kind) => {
      const value = fixture();
      if (kind === "throw")
        value.ports.sha256 = async () => {
          throw new Error("private diagnostic");
        };
      if (kind === "invalid_hash") value.ports.sha256 = async () => "not-a-sha256";
      if (kind === "decode_throw")
        value.ports.decodeRgb = async () => {
          throw new Error("private decoder path");
        };
      if (kind === "invalid_rgb")
        value.ports.decodeRgb = async () => ({ width: 1, height: 1, data: [] });
      if (kind === "low_detail") value.ports.decodeRgb = async () => empty;
      const result = await compile(value);
      expect(result.status).toBe("unavailable");
      expect(JSON.stringify(result)).not.toMatch(/private|diagnostic|path/u);
      expect((await compile()).status).toBe("ready");
    },
  );

  it("handles unknown/low-detail queries and contains later platform failures", async () => {
    const value = fixture();
    let failing = false;
    const hash = value.ports.sha256;
    value.ports.sha256 = async (bytes) => {
      if (failing) throw new Error("private");
      return hash(bytes);
    };
    const compiled = await runtime(value);
    expect(await compiled.runtime.identify(Uint8Array.of(5))).toMatchObject({
      status: "unknown",
      reason: "low_detail",
    });
    failing = true;
    expect(await compiled.runtime.identify(Uint8Array.of(1))).toMatchObject({
      status: "unavailable",
      reason: "hash_unavailable",
    });
    failing = false;
    expect((await compiled.runtime.identify(Uint8Array.of(1))).status).toBe("candidate");
  });

  it("never invokes supplied metadata, source, port or typed-array accessors/iterators", async () => {
    const value = fixture();
    let calls = 0;
    const accessor = {
      referenceId: "ref-0",
      get encoded() {
        calls++;
        throw new Error("getter");
      },
    };
    expect(
      await compileReferenceImageRuntime(
        value.catalogue,
        policy,
        [accessor, ...value.bytes.slice(1)],
        value.ports,
      ),
    ).toMatchObject({ status: "invalid" });
    const badPorts = {
      get sha256() {
        calls++;
        throw new Error("getter");
      },
      decodeRgb: value.ports.decodeRgb,
    };
    expect(
      await compileReferenceImageRuntime(value.catalogue, policy, value.bytes, badPorts),
    ).toMatchObject({ status: "unavailable" });
    const raw = value.bytes[0]?.encoded;
    if (!raw) throw new Error("missing fixture");
    for (const key of ["length", Symbol.iterator])
      Object.defineProperty(raw, key, {
        get() {
          calls++;
          throw new Error("getter");
        },
      });
    expect((await compile(value)).status).toBe("ready");
    expect(calls).toBe(0);
  });

  it("bounds source arrays and encoded bytes before hashing or decoding", async () => {
    const value = fixture();
    for (const input of [
      null,
      {},
      new Array(33).fill(null),
      new Array(3),
      [{ referenceId: "ref-0", encoded: new Uint8Array() }, ...value.bytes.slice(1)],
      [
        { referenceId: "ref-0", encoded: new Uint8Array(2 * 1024 * 1024 + 1) },
        ...value.bytes.slice(1),
      ],
    ]) {
      expect(
        await compileReferenceImageRuntime(value.catalogue, policy, input, value.ports),
      ).toMatchObject({ status: "invalid", reason: "invalid_reference_bytes" });
    }
    expect(value.calls).toEqual({ hashes: 0, decodes: 0 });
  });

  it("bounds oversized asset arrays before enumerating all their descriptors", async () => {
    const value = fixture();
    const source: unknown[] = [];
    source.length = 100_000_000;
    let enumerated = 0;
    const proxy = new Proxy(source, {
      ownKeys() {
        enumerated++;
        throw new Error("must not enumerate");
      },
    });
    expect(
      await compileReferenceImageRuntime(value.catalogue, policy, proxy, value.ports),
    ).toMatchObject({ status: "invalid", reason: "invalid_reference_bytes" });
    expect(enumerated).toBe(0);
    expect(value.calls).toEqual({ hashes: 0, decodes: 0 });
  });

  it("enforces the aggregate byte budget before hashing any otherwise valid source", async () => {
    const value = fixture();
    for (let index = 3; index < 9; index++) {
      const reference = value.catalogue.references[0];
      if (!reference) throw new Error("missing synthetic reference");
      const encoded = Uint8Array.of(index + 1);
      const referenceId = `extra-${index}`;
      const imageSha256 = fixtureHash(encoded);
      value.catalogue.references.push({
        ...reference,
        referenceId,
        imageSha256,
        sourceFamilyId: `extra-family-${index}`,
        captureGroupId: `extra-capture-${index}`,
      });
      value.catalogue.featureReceipts.push({
        referenceId,
        imageSha256,
        featureSha256: hashA,
        featureVersion: policy.featureVersion,
      });
      value.bytes.push({ referenceId, encoded });
    }
    const large = value.bytes.map((entry) => ({
      ...entry,
      encoded: new Uint8Array(2 * 1024 * 1024),
    }));
    expect(
      await compileReferenceImageRuntime(value.catalogue, policy, large, value.ports),
    ).toMatchObject({ status: "invalid", reason: "invalid_reference_bytes" });
    expect(value.calls).toEqual({ hashes: 0, decodes: 0 });
  });

  it("rejects query byte proxies, shared buffers, subclasses and malformed values", async () => {
    const compiled = await runtime();
    class Bytes extends Uint8Array {}
    const invalid: unknown[] = [
      null,
      {},
      [],
      "url",
      new Uint8Array(),
      new Uint8ClampedArray(1),
      new Bytes(1),
      new Proxy(Uint8Array.of(1), {}),
      new Uint8Array(2 * 1024 * 1024 + 1),
    ];
    if (typeof SharedArrayBuffer !== "undefined")
      invalid.push(new Uint8Array(new SharedArrayBuffer(1)));
    for (const input of invalid)
      expect(await compiled.runtime.identify(input)).toMatchObject({
        status: "invalid",
        reason: "invalid_encoded_image",
      });
    expect((await compiled.runtime.identify(Uint8Array.of(1))).status).toBe("candidate");
  });
});
