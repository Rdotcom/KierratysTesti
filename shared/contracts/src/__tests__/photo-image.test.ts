import { describe, expect, it } from "vitest";
import {
  decodePhotoBase64,
  encodePhotoBase64,
  preparePhotoBase64,
  stripPhotoMetadata,
} from "../photo-image";

// Marker-stream fixture, not an actual product or a fully decoded image.
const frame = [255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0];
const scan = [255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42, 255, 0, 17];
const jpeg = (...metadata: number[]) =>
  new Uint8Array([255, 216, ...metadata, ...frame, ...scan, 255, 217]);

describe("bounded image codec and metadata removal", () => {
  it("round-trips canonical base64 without a platform dependency", () => {
    for (let size = 1; size < 90; size++) {
      const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 17) % 256);
      expect(decodePhotoBase64(encodePhotoBase64(bytes))).toEqual(bytes);
    }
  });
  it("rejects malformed, non-canonical and excessive image data", () => {
    for (const value of [
      "AAB=",
      "AA A=",
      "AA==\n",
      "data:image/jpeg;base64,AA==",
      "AAA",
      "=AAA",
      "A".repeat(2_000_004),
    ])
      expect(() => decodePhotoBase64(value)).toThrow("invalid_image");
  });
  it("removes EXIF/GPS, ICC and comments without altering scan bytes", () => {
    const annotated = jpeg(
      255,
      225,
      0,
      8,
      71,
      80,
      83,
      0,
      1,
      2,
      255,
      226,
      0,
      4,
      3,
      4,
      255,
      254,
      0,
      4,
      5,
      6,
    );
    expect(stripPhotoMetadata(annotated)).toEqual(jpeg());
    expect(preparePhotoBase64(encodePhotoBase64(annotated))).toBe(encodePhotoBase64(jpeg()));
  });
  it("removes metadata between progressive scans and preserves escaped entropy", () => {
    const bytes = new Uint8Array([
      255,
      216,
      ...frame,
      ...scan,
      255,
      209,
      18,
      255,
      225,
      0,
      4,
      3,
      4,
      ...scan,
      255,
      217,
    ]);
    const clean = stripPhotoMetadata(bytes);
    expect([...clean]).not.toContain(225);
    expect([...clean]).toContain(209);
  });
  it("rejects trailing data, truncated segments, missing frames and oversized dimensions", () => {
    const oversized = jpeg();
    oversized[7] = 32;
    for (const bytes of [
      new Uint8Array([1, 2, 3]),
      new Uint8Array([...jpeg(), 1]),
      jpeg(255, 225, 255, 255),
      new Uint8Array([255, 216, 255, 217]),
      oversized,
    ])
      expect(() => stripPhotoMetadata(bytes)).toThrow("invalid_image");
  });
});
