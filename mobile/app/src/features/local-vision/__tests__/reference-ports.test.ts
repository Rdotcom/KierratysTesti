import { decodePhotoBase64, encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import { referenceNativeIdentity } from "@kierratysappi/contracts/reference-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeReferenceRuntimePorts, type ReferenceNativeReader } from "../reference-ports";

// Noncryptographic test double only. Actual SHA parity is a native CLI check.
const sha = (bytes: Uint8Array) => {
  let value = 2166136261;
  for (const byte of bytes) value = Math.imul(value ^ byte, 16777619) >>> 0;
  return value.toString(16).padStart(8, "0").repeat(8);
};
function fixture() {
  // Synthetic port double only; these tests never load Core ML or decode JPEGs.
  const bytes = new Uint8Array([255, 216, 0, 1, 255, 217]);
  const identity = {
    encoderSha256: referenceNativeIdentity.encoderSha256,
    preprocessingSha256: referenceNativeIdentity.preprocessingSha256,
  };
  const caps = {
    schemaVersion: "native-reference-capabilities-v1",
    evidence: "integrity_and_interface_only",
    ...referenceNativeIdentity,
    integrationAllowed: false,
  };
  const embedding = {
    ...identity,
    imageSha256: sha(bytes),
    vector: [1, ...Array<number>(511).fill(0)],
  };
  const rgb = {
    schemaVersion: "native-reference-rgb-v1",
    imageSha256: sha(bytes),
    decoderPolicy: referenceNativeIdentity.decoderPolicy,
    width: 32,
    height: 32,
    channels: 3,
    rgbBase64: encodePhotoBase64(new Uint8Array(32 * 32 * 3).fill(17)),
  };
  const reader: ReferenceNativeReader = {
    inspectReferenceCapabilities: vi.fn(async () => JSON.stringify(caps)),
    hashReferenceBytes: vi.fn(async (raw) => sha(decodePhotoBase64(raw))),
    encodeReferenceImage: vi.fn(async () => JSON.stringify(embedding)),
    decodeReferenceRgb: vi.fn(async () => JSON.stringify(rgb)),
  };
  return { bytes, reader, caps, embedding, rgb };
}
async function ready(f: ReturnType<typeof fixture>) {
  const result = await createNativeReferenceRuntimePorts(() => f.reader);
  if (result.status !== "available") throw new Error("fixture_failed");
  return result;
}
describe("experimental native runtime ports", () => {
  afterEach(() => vi.useRealTimers());
  it("does no work on unsupported/legacy modules or a pre-cancelled request", async () => {
    expect(await createNativeReferenceRuntimePorts(() => undefined)).toEqual({
      status: "unavailable",
      reason: "unsupported",
    });
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    expect(await createNativeReferenceRuntimePorts(() => f.reader, controller.signal)).toEqual({
      status: "unavailable",
      reason: "cancelled",
    });
    expect(f.reader.inspectReferenceCapabilities).not.toHaveBeenCalled();
  });
  it("requires exact native capability identity and refuses fake integration authority", async () => {
    const f = fixture();
    for (const value of [
      { ...f.caps, integrationAllowed: true },
      { ...f.caps, encoderSha256: "a".repeat(64) },
      f.caps,
      "{",
    ]) {
      f.reader.inspectReferenceCapabilities = async () =>
        typeof value === "string" ? value : value === f.caps ? value : JSON.stringify(value);
      expect((await createNativeReferenceRuntimePorts(() => f.reader)).status).toBe("unavailable");
    }
  });
  it("passes owned bytes to the hash port and returns exact embedding/extractor-shaped RGB", async () => {
    const f = fixture(),
      result = await ready(f);
    expect(result.integrationAllowed).toBe(false);
    expect(await result.ports.sha256(f.bytes)).toBe(sha(f.bytes));
    expect(await result.ports.encode(f.bytes)).toBe(JSON.stringify(f.embedding));
    const rgb = await result.ports.decodeRgb(f.bytes, {
      maximumDimension: 1024,
      maximumPixels: 1048576,
    });
    expect(rgb).toEqual({ width: 32, height: 32, data: new Uint8Array(3072).fill(17) });
  });
  it("rejects wrong query joins, model/preprocessing and malformed vectors", async () => {
    const f = fixture(),
      { ports } = await ready(f);
    for (const patch of [
      { imageSha256: "a".repeat(64) },
      { encoderSha256: "b".repeat(64) },
      { preprocessingSha256: "b".repeat(64) },
      { vector: Array(512).fill(0) },
    ]) {
      f.reader.encodeReferenceImage = async () => JSON.stringify({ ...f.embedding, ...patch });
      // Factory captures methods so a caller cannot mutate a checked module later.
      const next = await ready(f);
      await expect(next.ports.encode(f.bytes)).rejects.toThrow();
    }
    expect(await ports.encode(f.bytes)).toBe(JSON.stringify(f.embedding));
  });
  it("rejects RGB hash/size/data/policy failures before extraction", async () => {
    const f = fixture();
    for (const patch of [
      { imageSha256: "b".repeat(64) },
      { width: 1025 },
      { rgbBase64: "AQID" },
      { decoderPolicy: "sharp" },
      { channels: 4 },
    ]) {
      f.reader.decodeReferenceRgb = async () => JSON.stringify({ ...f.rgb, ...patch });
      const { ports } = await ready(f);
      await expect(
        ports.decodeRgb(f.bytes, { maximumDimension: 1024, maximumPixels: 1048576 }),
      ).rejects.toThrow();
    }
  });
  it("rejects empty/oversized/shared/subclass input without native work or custom getters", async () => {
    const f = fixture(),
      { ports } = await ready(f);
    class Sub extends Uint8Array {}
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array(1500001),
      new Sub([1]),
      new Uint8Array(new SharedArrayBuffer(3)),
    ])
      await expect(ports.sha256(bytes)).rejects.toThrow();
    let reads = 0;
    const bytes = new Uint8Array([1, 2, 3]);
    Object.defineProperty(bytes, "buffer", {
      get() {
        reads++;
        throw new Error("private");
      },
    });
    expect(await ports.sha256(bytes)).toBe(sha(new Uint8Array([1, 2, 3])));
    expect(reads).toBe(0);
  });
  it("retains global JS gate after cancellation until actual settlement", async () => {
    const f = fixture();
    let settle: (raw: unknown) => void = () => {};
    f.reader.inspectReferenceCapabilities = () =>
      new Promise((resolve) => {
        settle = resolve;
      });
    const controller = new AbortController();
    const pending = createNativeReferenceRuntimePorts(() => f.reader, controller.signal);
    await Promise.resolve();
    controller.abort();
    expect(await pending).toEqual({ status: "unavailable", reason: "cancelled" });
    expect(await createNativeReferenceRuntimePorts(() => fixture().reader)).toEqual({
      status: "unavailable",
      reason: "busy",
    });
    settle(JSON.stringify(f.caps));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await ready(fixture())).status).toBe("available");
  });
  it("retains global JS gate after watchdog timeout and suppresses late success", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let settle: (raw: unknown) => void = () => {};
    f.reader.inspectReferenceCapabilities = () =>
      new Promise((resolve) => {
        settle = resolve;
      });
    const pending = createNativeReferenceRuntimePorts(() => f.reader);
    await vi.advanceTimersByTimeAsync(15001);
    expect(await pending).toEqual({ status: "unavailable", reason: "failed" });
    expect(await createNativeReferenceRuntimePorts(() => fixture().reader)).toEqual({
      status: "unavailable",
      reason: "busy",
    });
    settle(JSON.stringify(f.caps));
    await vi.advanceTimersByTimeAsync(0);
    expect((await ready(fixture())).status).toBe("available");
  });
  it("cancels a query before native work and sanitizes rejected capability errors", async () => {
    const f = fixture(),
      { ports } = await ready(f),
      c = new AbortController();
    c.abort();
    await expect(ports.encode(f.bytes, c.signal)).rejects.toThrow("cancelled");
    expect(f.reader.encodeReferenceImage).not.toHaveBeenCalled();
    f.reader.inspectReferenceCapabilities = async () => {
      throw new Error("secret diagnostic");
    };
    expect(await createNativeReferenceRuntimePorts(() => f.reader)).toEqual({
      status: "unavailable",
      reason: "failed",
    });
  });
});
