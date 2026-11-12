import { describe, expect, it } from "vitest";
import {
  extractReferenceImageFeaturesV2,
  REFERENCE_FEATURE_VERSION_V2,
} from "../reference-image-features-v2";
import { matchReferenceImageV2 } from "../reference-image-matcher-v2";

function pixels(
  width = 128,
  height = 128,
  seed = 17,
): { width: number; height: number; data: Uint8Array } {
  let state = seed;
  const cells = Array.from({ length: 16 * 16 }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return 30 + (state % 190);
  });
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = cells[Math.floor((y * 16) / height) * 16 + Math.floor((x * 16) / width)] ?? 0;
      data.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return { width, height, data };
}

describe("own multiscale bounded reference-image pixel features V2", () => {
  it("retains scale-conditioned supports at at least three fixed pyramid levels", () => {
    const result = extractReferenceImageFeaturesV2(pixels(256, 256));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected synthetic detail");
    const scales = [...new Set(result.features.keypoints.map((point) => point.scale))];
    expect(scales.length).toBeGreaterThanOrEqual(3);
    expect(scales.length).toBeLessThanOrEqual(4);
    for (const scale of scales)
      expect(
        result.features.keypoints.filter((point) => point.scale === scale).length,
      ).toBeLessThanOrEqual(32);
    expect(result.features.version).not.toBe("pixel-corners-v1");
  });

  it("matches one synthetic texture represented at a different canonical image scale", () => {
    const reference = extractReferenceImageFeaturesV2(pixels(256, 256));
    const query = extractReferenceImageFeaturesV2(pixels(181, 181));
    if (reference.status !== "ok" || query.status !== "ok")
      throw new Error("expected synthetic detail");
    const result = matchReferenceImageV2(query.features, [
      {
        productId: "synthetic-texture",
        referenceId: "synthetic-reference",
        imageSha256: "a".repeat(64),
        features: reference.features,
      },
    ]);
    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") throw new Error("expected synthetic scale correspondence");
    expect(result.evidence.inliers).toBeGreaterThanOrEqual(8);
  });

  it("extracts deterministic bounded 256-bit descriptors from synthetic pixels", () => {
    const input = pixels();
    const first = extractReferenceImageFeaturesV2(input);
    expect(first.status).toBe("ok");
    expect(extractReferenceImageFeaturesV2(input)).toEqual(first);
    if (first.status !== "ok") throw new Error("expected synthetic detail");
    expect(first.features.version).toBe(REFERENCE_FEATURE_VERSION_V2);
    expect(first.features.width).toBe(128);
    expect(first.features.height).toBe(128);
    expect(first.features.keypoints.length).toBeGreaterThanOrEqual(8);
    expect(first.features.keypoints.length).toBeLessThanOrEqual(128);
    for (const point of first.features.keypoints) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
      expect(point.scale).toBeGreaterThanOrEqual(1);
      expect(point.scale).toBeLessThanOrEqual(4);
      expect(point.descriptor).toHaveLength(8);
      for (const word of point.descriptor) {
        expect(Number.isInteger(word)).toBe(true);
        expect(word).toBeGreaterThanOrEqual(0);
        expect(word).toBeLessThanOrEqual(0xffff_ffff);
      }
    }
  });

  it("preserves aspect ratio within rounding and caps the normalized edge", () => {
    const result = extractReferenceImageFeaturesV2(pixels(512, 384));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected synthetic detail");
    expect(result.features.width).toBe(256);
    expect(result.features.height).toBe(192);
  });

  it("does not mutate inputs or retain mutable pixel/descriptor references", () => {
    const input = pixels();
    const before = Uint8Array.from(input.data);
    const result = extractReferenceImageFeaturesV2(input);
    expect(input.data).toEqual(before);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected synthetic detail");
    const snapshot = JSON.stringify(result);
    input.data.fill(0);
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(Object.isFrozen(result.features)).toBe(true);
    expect(Object.isFrozen(result.features.keypoints)).toBe(true);
    expect(Object.isFrozen(result.features.keypoints[0]?.descriptor)).toBe(true);
  });

  it("rejects constants, smooth ramps and tiny low-detail images", () => {
    const blank = pixels();
    blank.data.fill(180);
    expect(extractReferenceImageFeaturesV2(blank).status).toBe("low_detail");
    const ramp = pixels();
    for (let y = 0; y < ramp.height; y += 1) {
      for (let x = 0; x < ramp.width; x += 1) {
        ramp.data.fill(
          Math.round((x * 255) / (ramp.width - 1)),
          (y * ramp.width + x) * 3,
          (y * ramp.width + x) * 3 + 3,
        );
      }
    }
    expect(extractReferenceImageFeaturesV2(ramp).status).toBe("low_detail");
    expect(
      extractReferenceImageFeaturesV2({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 3) })
        .status,
    ).toBe("low_detail");
  });

  it("rejects very weak contrast rather than inventing distinctive texture", () => {
    const input = pixels();
    for (let i = 0; i < input.data.length; i += 1) input.data[i] = 126 + ((input.data[i] ?? 0) % 3);
    expect(extractReferenceImageFeaturesV2(input).status).toBe("low_detail");
  });

  it("handles uniform additive illumination on an unclipped synthetic image", () => {
    const original = pixels();
    const lighter = { ...original, data: Uint8Array.from(original.data, (value) => value + 20) };
    const a = extractReferenceImageFeaturesV2(original);
    const b = extractReferenceImageFeaturesV2(lighter);
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    if (a.status !== "ok" || b.status !== "ok") throw new Error("expected synthetic detail");
    // Small floating-point tie changes can alter corner ordering; exact-position
    // intersections still compare binary patches independently of illumination.
    const matching = a.features.keypoints.filter((point) =>
      b.features.keypoints.some(
        (other) =>
          point.x === other.x &&
          point.y === other.y &&
          point.descriptor.every((word, index) => word === other.descriptor[index]),
      ),
    );
    expect(matching.length).toBeGreaterThanOrEqual(8);
  });

  it("different synthetic texture seeds do not produce identical features", () => {
    expect(extractReferenceImageFeaturesV2(pixels(128, 128, 19))).not.toEqual(
      extractReferenceImageFeaturesV2(pixels()),
    );
  });

  it("retains local patch agreement after an exact synthetic quarter turn", () => {
    const original = pixels();
    const turned = { ...original, data: new Uint8Array(original.data.length) };
    for (let y = 0; y < original.height; y += 1) {
      for (let x = 0; x < original.width; x += 1) {
        const from = (y * original.width + x) * 3;
        const to = (x * original.width + original.width - 1 - y) * 3;
        turned.data.set(original.data.subarray(from, from + 3), to);
      }
    }
    const a = extractReferenceImageFeaturesV2(original);
    const b = extractReferenceImageFeaturesV2(turned);
    if (a.status !== "ok" || b.status !== "ok") throw new Error("expected synthetic detail");
    let agreements = 0;
    for (const point of a.features.keypoints) {
      for (const other of b.features.keypoints) {
        if (Math.abs(other.x - (1 - point.y)) > 0.01 || Math.abs(other.y - point.x) > 0.01)
          continue;
        let distance = 0;
        for (let word = 0; word < 8; word += 1) {
          let value = ((point.descriptor[word] ?? 0) ^ (other.descriptor[word] ?? 0)) >>> 0;
          while (value) {
            value = (value & (value - 1)) >>> 0;
            distance += 1;
          }
        }
        if (distance <= 48) {
          agreements += 1;
          break;
        }
      }
    }
    expect(agreements).toBeGreaterThanOrEqual(8);
  });

  it("abstains on strongly blurred synthetic texture", () => {
    const input = pixels();
    let values = Uint8Array.from(input.data);
    for (let pass = 0; pass < 4; pass += 1) {
      const result = new Uint8Array(values.length);
      for (let y = 0; y < input.height; y += 1) {
        for (let x = 0; x < input.width; x += 1) {
          let sum = 0;
          for (let delta = -16; delta <= 16; delta += 1) {
            const sx = pass % 2 === 0 ? Math.max(0, Math.min(input.width - 1, x + delta)) : x;
            const sy = pass % 2 === 1 ? Math.max(0, Math.min(input.height - 1, y + delta)) : y;
            sum += values[(sy * input.width + sx) * 3] ?? 0;
          }
          result.fill(
            Math.round(sum / 33),
            (y * input.width + x) * 3,
            (y * input.width + x) * 3 + 3,
          );
        }
      }
      values = result;
    }
    expect(extractReferenceImageFeaturesV2({ ...input, data: values }).status).toBe("low_detail");
  });

  it("contains malformed, excessive and wrong typed input", () => {
    const valid = pixels();
    for (const input of [
      null,
      undefined,
      true,
      "image",
      [],
      new Date(),
      {},
      { ...valid, width: 31 },
      { ...valid, height: 31 },
      { ...valid, width: 1_025 },
      { ...valid, height: Infinity },
      { ...valid, width: Number.NaN },
      { ...valid, width: 128.5 },
      { ...valid, data: [] },
      { ...valid, data: new Uint8ClampedArray(valid.data) },
      { ...valid, data: new Uint8Array(valid.data.length - 1) },
      { ...valid, data: new Uint8Array(valid.data.length + 1) },
      { ...valid, unknown: 1 },
      Object.create(valid),
    ]) {
      expect(extractReferenceImageFeaturesV2(input).status).toBe("invalid");
    }
  });

  it("does not invoke externally provided property accessors", () => {
    let calls = 0;
    for (const name of ["width", "height", "data"]) {
      const input = pixels();
      Object.defineProperty(input, name, {
        get() {
          calls += 1;
          throw new Error("private");
        },
      });
      expect(extractReferenceImageFeaturesV2(input)).toEqual({
        status: "invalid",
        reason: "invalid_rgb_input",
      });
    }
    expect(calls).toBe(0);
  });

  it("contains throwing proxy traps and rejects typed-array proxies", () => {
    const fail = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("private");
        },
      },
    );
    expect(extractReferenceImageFeaturesV2(fail)).toEqual({
      status: "invalid",
      reason: "invalid_rgb_input",
    });
    const input = pixels();
    expect(
      extractReferenceImageFeaturesV2({ ...input, data: new Proxy(input.data, {}) }).status,
    ).toBe("invalid");
  });

  it("copies typed-array storage without iterators or shadowed length accessors", () => {
    const input = pixels();
    let calls = 0;
    for (const name of ["length", "constructor", Symbol.iterator]) {
      Object.defineProperty(input.data, name, {
        get() {
          calls += 1;
          throw new Error("private");
        },
      });
    }
    expect(extractReferenceImageFeaturesV2(input).status).toBe("ok");
    expect(calls).toBe(0);
  });

  it("accepts a validated null-prototype record without inherited field reliance", () => {
    const input = Object.assign(Object.create(null), pixels());
    expect(extractReferenceImageFeaturesV2(input).status).toBe("ok");
  });

  it("rejects concurrent shared-memory input when the runtime supports it", () => {
    if (typeof SharedArrayBuffer === "undefined") return;
    expect(
      extractReferenceImageFeaturesV2({
        width: 64,
        height: 64,
        data: new Uint8Array(new SharedArrayBuffer(64 * 64 * 3)),
      }).status,
    ).toBe("invalid");
  });
});
