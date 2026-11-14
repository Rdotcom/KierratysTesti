import { describe, expect, it } from "vitest";
import {
  decodeReferenceRgbBase64,
  parseReferenceNativeJson,
  ReferenceNativeCapabilitiesSchema,
  ReferenceNativeEmbeddingSchema,
  ReferenceNativeRgbSchema,
  referenceNativeIdentity,
} from "../reference-native";

describe("experimental native reference boundary", () => {
  const caps = {
    schemaVersion: "native-reference-capabilities-v1",
    evidence: "integrity_and_interface_only",
    ...referenceNativeIdentity,
    integrationAllowed: false,
  };
  const embedding = {
    imageSha256: "a".repeat(64),
    encoderSha256: referenceNativeIdentity.encoderSha256,
    preprocessingSha256: referenceNativeIdentity.preprocessingSha256,
    vector: [1, ...Array<number>(511).fill(0)],
  };
  it("accepts exact capability evidence without granting integration", () => {
    expect(ReferenceNativeCapabilitiesSchema.parse(caps).integrationAllowed).toBe(false);
    for (const value of [
      { ...caps, integrationAllowed: true },
      { ...caps, accuracy: 1 },
      { ...caps, encoderSha256: "b".repeat(64) },
      { ...caps, decoderPolicy: "sharp" },
      { ...caps, evidence: "verified_accuracy" },
    ])
      expect(ReferenceNativeCapabilitiesSchema.safeParse(value).success).toBe(false);
  });
  it("accepts only bound finite normalized 512-dimensional vectors", () => {
    expect(ReferenceNativeEmbeddingSchema.safeParse(embedding).success).toBe(true);
    for (const vector of [
      Array(512).fill(0),
      Array(512).fill(1),
      Array(511).fill(1),
      [Number.NaN, ...Array(511).fill(0)],
      [Infinity, ...Array(511).fill(0)],
    ])
      expect(ReferenceNativeEmbeddingSchema.safeParse({ ...embedding, vector }).success).toBe(
        false,
      );
    expect(
      ReferenceNativeEmbeddingSchema.safeParse({ ...embedding, productId: "fabricated" }).success,
    ).toBe(false);
  });
  it("rejects unbounded, object, malformed and accessor JSON input without reading it", () => {
    let reads = 0;
    const hostile = {
      get schemaVersion() {
        reads++;
        return "native-reference-capabilities-v1";
      },
    };
    for (const raw of [hostile, "x".repeat(2049), "{", undefined])
      expect(() => parseReferenceNativeJson(raw, 2048)).toThrow("invalid_response");
    expect(reads).toBe(0);
    expect(
      ReferenceNativeCapabilitiesSchema.safeParse(
        parseReferenceNativeJson(JSON.stringify(caps), 2048),
      ).success,
    ).toBe(true);
  });
  it("bounds RGB geometry, schema and exact raw byte count", () => {
    const rgb = {
      schemaVersion: "native-reference-rgb-v1",
      imageSha256: "b".repeat(64),
      decoderPolicy: referenceNativeIdentity.decoderPolicy,
      width: 1,
      height: 1,
      channels: 3,
      rgbBase64: "AQID",
    };
    expect(ReferenceNativeRgbSchema.safeParse(rgb).success).toBe(true);
    for (const value of [
      { ...rgb, width: 1025 },
      { ...rgb, height: 0 },
      { ...rgb, channels: 4 },
      { ...rgb, rgbBase64: "x".repeat(4194305) },
      { ...rgb, filename: "private" },
    ])
      expect(ReferenceNativeRgbSchema.safeParse(value).success).toBe(false);
    expect([...decodeReferenceRgbBase64(rgb.rgbBase64, 3)]).toEqual([1, 2, 3]);
    expect(() => decodeReferenceRgbBase64(rgb.rgbBase64, 6)).toThrow();
  });
  it("rejects malformed/noncanonical base64 and excessive requested allocations", () => {
    for (const raw of ["AQID\n", "AQ D", "=QID", "AQI=", "!!!!", "AQID====", "A==="])
      expect(() => decodeReferenceRgbBase64(raw, 3)).toThrow();
    for (const count of [0, -1, Infinity, 3.1, 3145729])
      expect(() => decodeReferenceRgbBase64("AQID", count)).toThrow();
  });
});
