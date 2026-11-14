import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compileMaxMarginImageRuntime,
  type MaxMarginImageRuntime,
  type MaxMarginRuntimePorts,
} from "../max-margin-runtime";

// Generated RGB and fake JPEG tags only. Non-cryptographic hash/encoder/decoder
// doubles exercise binding/control flow, not real SHA256, JPEG or product quality.
const hash = (bytes: Uint8Array) => {
  let state = 2166136261;
  for (const n of bytes) state = Math.imul(state ^ n, 16777619) >>> 0;
  return state.toString(16).padStart(8, "0").repeat(8);
};
const encoded = (id: number) => Uint8Array.of(255, 216, 0, id, 0, 0, 0, 0, 0, 0, 255, 217);
const vector = (a = 1, b = 0) => [a, b, ...Array<number>(510).fill(0)];
function texture(seed: number) {
  let state = seed;
  const cells = Array.from({ length: 256 }, () => {
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
const rgbA = texture(17),
  rgbB = texture(712),
  empty = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 3) };
const source = {
  publisher: "Synthetic test fixture",
  url: "https://example.invalid/synthetic",
  licence: "SYNTHETIC-TEST-ONLY",
  checkedOn: "2026-11-14",
  snapshotSha256: "e".repeat(64),
  reviewStatus: "source_asserted_pending_review",
};
function fixture() {
  const manifest = {
    schemaVersion: "max-margin-runtime-manifest-v1",
    catalogueId: "synthetic-catalogue",
    encoderSha256: "a".repeat(64),
    preprocessingSha256: "b".repeat(64),
    products: [{ productId: "a", label: "Synthetic A" }],
    images: [
      {
        imageId: "a-1",
        role: "reference",
        productId: "a",
        imageSha256: hash(encoded(1)),
        source: { ...source },
      },
      {
        imageId: "a-2",
        role: "reference",
        productId: "a",
        imageSha256: hash(encoded(2)),
        source: { ...source },
      },
      {
        imageId: "n-1",
        role: "calibration_negative",
        imageSha256: hash(encoded(3)),
        source: { ...source },
      },
    ],
  };
  const assets = manifest.images.map((row, i) => ({
    imageId: row.imageId,
    encoded: encoded(i + 1),
  }));
  const calls = { hashes: 0, encodes: 0, decodes: 0 },
    seen: Uint8Array[] = [];
  const ports: MaxMarginRuntimePorts = {
    async sha256(bytes) {
      calls.hashes++;
      seen.push(bytes);
      return hash(bytes);
    },
    async encode(bytes) {
      calls.encodes++;
      seen.push(bytes);
      return JSON.stringify({
        imageSha256: hash(bytes),
        encoderSha256: manifest.encoderSha256,
        preprocessingSha256: manifest.preprocessingSha256,
        vector: bytes[3] === 3 ? vector(-1) : bytes[3] === 8 ? vector(0, 1) : vector(),
      });
    },
    async decodeRgb(bytes, limits) {
      calls.decodes++;
      seen.push(bytes);
      expect(limits).toEqual({ maximumDimension: 1024, maximumPixels: 1048576 });
      return bytes[3] === 6 ? empty : bytes[3] === 8 ? rgbB : rgbA;
    },
  };
  return { manifest, assets, ports, calls, seen };
}
type Fixture = ReturnType<typeof fixture>;
const compile = (f: Fixture, signal?: AbortSignal) =>
  compileMaxMarginImageRuntime(JSON.stringify(f.manifest), f.assets, f.ports, signal);
async function ready(f = fixture()): Promise<MaxMarginImageRuntime> {
  const result = await compile(f);
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  return result.runtime;
}
afterEach(() => vi.useRealTimers());
describe("byte-bound max-margin runtime", () => {
  it("derives actual fixture vectors/pixels and preserves pending provenance, not verified bins", async () => {
    const f = fixture(),
      runtime = await ready(f);
    expect(f.calls).toEqual({ hashes: 7, encodes: 3, decodes: 2 });
    const result = await runtime.identify(encoded(4));
    expect(result).toMatchObject({
      status: "candidate",
      productIds: ["a"],
      verificationStatus: "inferred",
      confidence: "uncalibrated_visual_similarity",
      integrationAllowed: false,
      queryImageSha256: hash(encoded(4)),
    });
    if (result.status === "candidate") {
      expect(result.sources).toHaveLength(2);
      expect(result.products[0]?.sourceStatus).toBe("source_asserted_pending_review");
      expect(result.explanation).toContain("No sorting rule");
      expect(result).not.toHaveProperty("bin");
    }
    expect(f.seen.every((bytes) => bytes.every((n) => n === 0))).toBe(true);
  });
  it("never encodes training images as queries", async () => {
    const f = fixture(),
      runtime = await ready(f),
      before = f.calls.encodes;
    for (const id of [1, 2, 3])
      expect(await runtime.identify(encoded(id))).toMatchObject({
        status: "invalid",
        reason: "training_image",
      });
    expect(f.calls.encodes).toBe(before);
  });
  it("returns unknown for unrelated views without invented products", async () => {
    const runtime = await ready();
    expect(await runtime.identify(encoded(8))).toMatchObject({
      status: "unknown",
      productIds: [],
      products: [],
      sources: [],
    });
  });
  it("keeps embedding recovery from low-detail query separate from gallery validity", async () => {
    expect(await (await ready()).identify(encoded(6))).toMatchObject({
      status: "candidate",
      productIds: ["a"],
    });
  });
  it("derives same-design SKU quarantine from real fixture pixel self-observations", async () => {
    const f = fixture();
    f.manifest.products.push({ productId: "b", label: "Synthetic B" });
    for (const id of [4, 5]) {
      f.manifest.images.push({
        imageId: `b-${id}`,
        role: "reference",
        productId: "b",
        imageSha256: hash(encoded(id)),
        source: { ...source },
      });
      f.assets.push({ imageId: `b-${id}`, encoded: encoded(id) });
    }
    expect(await (await ready(f)).identify(encoded(7))).toMatchObject({
      status: "ambiguous",
      productIds: ["a", "b"],
    });
  });
  it("rejects caller descriptors or fake acceptance in the manifest", async () => {
    const f = fixture();
    for (const value of [
      { ...f.manifest, vector: vector() },
      { ...f.manifest, integrationAllowed: true },
      {
        ...f.manifest,
        images: f.manifest.images.map((row) => ({
          ...row,
          source: { ...row.source, reviewStatus: "accepted" },
        })),
      },
    ])
      expect(
        await compileMaxMarginImageRuntime(JSON.stringify(value), f.assets, f.ports),
      ).toMatchObject({ status: "invalid", reason: "invalid_manifest" });
    expect(f.calls.encodes).toBe(0);
  });
  it("rejects evaluation-role enrollment, duplicate hashes and unknown products before encoding", async () => {
    for (const change of [
      (f: Fixture) => {
        Object.assign(f.manifest.images[0] ?? {}, { role: "evaluation" });
      },
      (f: Fixture) => {
        Object.assign(f.manifest.images[1] ?? {}, { imageSha256: hash(encoded(1)) });
      },
      (f: Fixture) => {
        Object.assign(f.manifest.images[0] ?? {}, { productId: "outside" });
      },
    ]) {
      const f = fixture();
      change(f);
      expect((await compile(f)).status).toBe("invalid");
      expect(f.calls.encodes).toBe(0);
    }
  });
  it("validates source dates, HTTPS and source identity without pretending to review it", async () => {
    for (const extra of [
      { checkedOn: "2026-02-30" },
      { url: "javascript:alert(1)" },
      { url: "https://user:pass@example.invalid/" },
    ]) {
      const f = fixture();
      Object.assign(f.manifest.images[0]?.source ?? {}, extra);
      expect((await compile(f)).status).toBe("invalid");
    }
  });
  it("bounds metadata/assets and never reads hostile getters", async () => {
    const f = fixture();
    expect(
      (await compileMaxMarginImageRuntime("x".repeat(2097153), f.assets, f.ports)).status,
    ).toBe("invalid");
    const assets = [
      {
        imageId: "a-1",
        get encoded() {
          throw Error("must_not_read");
        },
      },
      ...f.assets.slice(1),
    ];
    expect(
      (await compileMaxMarginImageRuntime(JSON.stringify(f.manifest), assets, f.ports)).status,
    ).toBe("invalid");
    expect(
      (
        await compileMaxMarginImageRuntime(JSON.stringify(f.manifest), f.assets, {
          get sha256() {
            throw Error("must_not_read");
          },
          encode: f.ports.encode,
          decodeRgb: f.ports.decodeRgb,
        })
      ).status,
    ).toBe("unavailable");
    expect(f.calls.hashes).toBe(0);
  });
  it("rejects shared/resizable/oversized or subclassed byte sources", async () => {
    const runtime = await ready();
    class Sub extends Uint8Array {}
    for (const input of [
      new Uint8Array(new SharedArrayBuffer(12)),
      new Uint8Array(Reflect.construct(ArrayBuffer, [12, { maxByteLength: 24 }]) as ArrayBuffer),
      new Uint8Array(1500001),
      new Sub(12),
      { encoded: encoded(4) },
      new Uint8Array(),
    ])
      expect((await runtime.identify(input)).status).toBe("invalid");
  });
  it("rejects hash mismatch before encoding and invalid hash port output", async () => {
    const f = fixture();
    Object.assign(f.manifest.images[0] ?? {}, { imageSha256: "f".repeat(64) });
    expect(await compile(f)).toMatchObject({ status: "invalid", reason: "image_hash_mismatch" });
    expect(f.calls.encodes).toBe(0);
    const other = fixture();
    other.ports.sha256 = async () => "bad";
    expect(await compile(other)).toMatchObject({
      status: "unavailable",
      reason: "hash_output_invalid",
    });
  });
  it("checks actual vector receipts and native model/input/preprocessing binding", async () => {
    const f = fixture();
    Object.assign(f.manifest.images[0] ?? {}, { expectedVectorSha256: "f".repeat(64) });
    expect(await compile(f)).toMatchObject({ status: "invalid", reason: "vector_hash_mismatch" });
    for (const field of ["imageSha256", "encoderSha256", "preprocessingSha256"]) {
      const other = fixture(),
        original = other.ports.encode;
      other.ports.encode = async (bytes, signal) => {
        const raw = JSON.parse((await original(bytes, signal)) as string);
        raw[field] = "f".repeat(64);
        return JSON.stringify(raw);
      };
      expect(await compile(other)).toMatchObject({
        status: "invalid",
        reason: "encoding_identity_mismatch",
      });
    }
  });
  it("rejects malformed, nonunit-shape/zero/native objects and missing encoder output", async () => {
    for (const output of [
      null,
      {},
      "{",
      JSON.stringify({
        imageSha256: hash(encoded(1)),
        encoderSha256: "a".repeat(64),
        preprocessingSha256: "b".repeat(64),
        vector: Array(512).fill(0),
      }),
    ]) {
      const f = fixture();
      f.ports.encode = async () => output;
      expect(await compile(f)).toMatchObject({
        status: "unavailable",
        reason: "encoding_output_invalid",
      });
    }
  });
  it("fails closed for missing/throwing ports and low-detail gallery", async () => {
    const f = fixture();
    expect(
      await compileMaxMarginImageRuntime(JSON.stringify(f.manifest), f.assets, {}),
    ).toMatchObject({ status: "unavailable", reason: "invalid_ports" });
    for (const key of ["sha256", "encode", "decodeRgb"] as const) {
      const other = fixture();
      other.ports[key] = async () => {
        throw Error("private_must_not_escape");
      };
      expect((await compile(other)).status).toBe("unavailable");
    }
    const other = fixture();
    other.ports.decodeRgb = async () => empty;
    expect(await compile(other)).toMatchObject({
      status: "unavailable",
      reason: "reference_low_detail",
    });
  });
  it("does not mutate callers and gives each port an independent copy", async () => {
    const f = fixture(),
      original = f.ports.sha256;
    f.ports.sha256 = async (bytes) => {
      const result = await original(bytes);
      bytes.fill(0);
      return result;
    };
    const runtime = await ready(f);
    expect(f.assets[0]?.encoded).toEqual(encoded(1));
    expect((await runtime.identify(encoded(4))).status).toBe("candidate");
  });
  it("does not leak mutable source metadata across calls", async () => {
    const f = fixture(),
      runtime = await ready(f);
    f.manifest.products[0] = { productId: "a", label: "tampered" };
    const a = await runtime.identify(encoded(4));
    if (a.status !== "candidate") throw Error("candidate_required");
    const first = a.sources[0];
    if (first) first.publisher = "tampered";
    const b = await runtime.identify(encoded(4));
    if (b.status !== "candidate") throw Error("candidate_required");
    expect(b.sources[0]?.publisher).toBe(source.publisher);
    expect(b.products[0]?.label).toBe("Synthetic A");
  });
  it("pre-aborted requests do no foreign work", async () => {
    const f = fixture(),
      controller = new AbortController();
    controller.abort();
    expect(await compile(f, controller.signal)).toMatchObject({ reason: "cancelled" });
    expect(f.calls.hashes).toBe(0);
  });
  it("snapshots all source bytes before the first await", async () => {
    const f = fixture(),
      original = f.ports.sha256;
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let once = true;
    f.ports.sha256 = async (bytes) => {
      if (once) {
        once = false;
        await gate;
      }
      return original(bytes);
    };
    const pending = compile(f);
    for (const a of f.assets) a.encoded.fill(0);
    release();
    expect((await pending).status).toBe("ready");
  });
  it("retains global busy gate after cancellation until actual port settlement", async () => {
    const f = fixture(),
      runtime = await ready(f),
      original = f.ports.encode;
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    f.ports.encode = original;
    // Ports were snapshotted; hold the captured original function's closure via a
    // fresh compile, rather than pretending replacing f.ports changes a runtime.
    const other = fixture(),
      base = other.ports.encode;
    let holding = false;
    other.ports.encode = async (bytes, signal) => {
      if (holding) await gate;
      return base(bytes, signal);
    };
    const rt = await ready(other);
    holding = true;
    const controller = new AbortController(),
      pending = rt.identify(encoded(4), controller.signal);
    await vi.waitFor(() => expect(other.calls.hashes).toBeGreaterThan(7));
    controller.abort();
    expect(await pending).toMatchObject({ reason: "cancelled" });
    expect(await runtime.identify(encoded(4))).toMatchObject({ reason: "busy" });
    release();
    await vi.waitFor(async () =>
      expect((await runtime.identify(encoded(4))).status).toBe("candidate"),
    );
  });
  it("returns timeout once, ignores late success and blocks overlapping work until settled", async () => {
    const f = fixture();
    let holding = false,
      release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve)),
      base = f.ports.encode;
    f.ports.encode = async (bytes, signal) => {
      if (holding) await gate;
      return base(bytes, signal);
    };
    const runtime = await ready(f);
    holding = true;
    vi.useFakeTimers();
    const pending = runtime.identify(encoded(4));
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toMatchObject({ status: "unavailable", reason: "timeout" });
    expect(await runtime.identify(encoded(5))).toMatchObject({ reason: "busy" });
    release();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    holding = false;
    expect((await runtime.identify(encoded(5))).status).toBe("candidate");
  });
  it("bounds compilation too and does not start encoding after a late hash", async () => {
    const f = fixture(),
      base = f.ports.sha256;
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    f.ports.sha256 = async (bytes) => {
      await gate;
      return base(bytes);
    };
    vi.useFakeTimers();
    const pending = compile(f);
    await vi.advanceTimersByTimeAsync(120000);
    expect(await pending).toMatchObject({ status: "unavailable", reason: "timeout" });
    expect(await compile(fixture())).toMatchObject({ reason: "busy" });
    release();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    expect(f.calls.encodes).toBe(0);
    expect((await compile(fixture())).status).toBe("ready");
  });
  it("never converts invalid query encoder output or decoder failure to a successful unknown", async () => {
    const f = fixture(),
      base = f.ports.encode;
    let bad = false;
    f.ports.encode = async (bytes, signal) => (bad ? "{}" : base(bytes, signal));
    const runtime = await ready(f);
    bad = true;
    expect(await runtime.identify(encoded(4))).toMatchObject({
      status: "unavailable",
      reason: "encoding_output_invalid",
    });
    const other = fixture();
    other.ports.decodeRgb = async () => ({ width: 5000, height: 5000, data: new Uint8Array() });
    expect(await compile(other)).toMatchObject({
      status: "unavailable",
      reason: "decoder_output_invalid",
    });
  });
});
