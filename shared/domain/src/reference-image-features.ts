/** Original, deterministic pixel arithmetic; no learned model or image decoder.
 * This experimental descriptor is for reference-image retrieval, not semantic
 * identity, material, safety or sorting inference. Its scores are not accuracy.
 */
export const REFERENCE_FEATURE_VERSION = "pixel-corners-v1" as const;

export interface ReferenceKeypoint {
  readonly x: number;
  readonly y: number;
  readonly descriptor: readonly number[];
}

export interface ReferenceImageFeatures {
  readonly version: typeof REFERENCE_FEATURE_VERSION;
  readonly width: number;
  readonly height: number;
  readonly keypoints: readonly ReferenceKeypoint[];
}

export type ReferenceFeatureResult =
  | { readonly status: "ok"; readonly features: ReferenceImageFeatures }
  | { readonly status: "invalid"; readonly reason: string }
  | { readonly status: "low_detail"; readonly reason: string };

interface Plane {
  readonly width: number;
  readonly height: number;
  readonly values: Float64Array;
}

interface Corner {
  readonly x: number;
  readonly y: number;
  readonly response: number;
}

const maximumInputEdge = 1_024;
const maximumInputPixels = 1_048_576;
const maximumOutputEdge = 256;
const patchRadius = 10;
const border = patchRadius + 2;
const minimumKeypoints = 8;
const maximumLevelKeypoints = 64;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")?.get;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")?.get;

function ownValue(value: object, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property && "value" in property ? property.value : undefined;
}

function inputPlane(input: unknown): Plane | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  if (Reflect.ownKeys(input).some((key) => !["width", "height", "data"].includes(String(key)))) {
    return undefined;
  }
  const width = ownValue(input, "width");
  const height = ownValue(input, "height");
  const raw = ownValue(input, "data");
  if (
    typeof width !== "number" ||
    !Number.isInteger(width) ||
    width < 32 ||
    width > maximumInputEdge ||
    typeof height !== "number" ||
    !Number.isInteger(height) ||
    height < 32 ||
    height > maximumInputEdge ||
    width * height > maximumInputPixels ||
    !(raw instanceof Uint8Array) ||
    Object.getPrototypeOf(raw) !== Uint8Array.prototype ||
    !typedArrayLength ||
    !typedArrayBuffer ||
    !arrayBufferLength
  )
    return undefined;
  // Native getters reject typed-array proxies; the ArrayBuffer getter rejects
  // shared buffers. Copy pixels before arithmetic, without invoking iterators,
  // constructor/species hooks or externally supplied accessors.
  if (typedArrayLength.call(raw) !== width * height * 3) return undefined;
  const buffer: unknown = typedArrayBuffer.call(raw);
  arrayBufferLength.call(buffer);
  const bytes = new Uint8Array(width * height * 3);
  Uint8Array.prototype.set.call(bytes, raw);
  const values = new Float64Array(width * height);
  for (let i = 0; i < values.length; i += 1) {
    const offset = i * 3;
    values[i] =
      ((bytes[offset] ?? 0) * 77 + (bytes[offset + 1] ?? 0) * 150 + (bytes[offset + 2] ?? 0) * 29) /
      (256 * 255);
  }
  return { width, height, values };
}

function sample(plane: Plane, x: number, y: number): number {
  const safeX = Math.max(0, Math.min(plane.width - 1, x));
  const safeY = Math.max(0, Math.min(plane.height - 1, y));
  const left = Math.floor(safeX);
  const top = Math.floor(safeY);
  const right = Math.min(plane.width - 1, left + 1);
  const bottom = Math.min(plane.height - 1, top + 1);
  const dx = safeX - left;
  const dy = safeY - top;
  const a = plane.values[top * plane.width + left] ?? 0;
  const b = plane.values[top * plane.width + right] ?? 0;
  const c = plane.values[bottom * plane.width + left] ?? 0;
  const d = plane.values[bottom * plane.width + right] ?? 0;
  return (a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy;
}

function resize(plane: Plane, width: number, height: number): Plane {
  if (width === plane.width && height === plane.height) return plane;
  const values = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[y * width + x] = sample(
        plane,
        ((x + 0.5) * plane.width) / width - 0.5,
        ((y + 0.5) * plane.height) / height - 0.5,
      );
    }
  }
  return { width, height, values };
}

function smooth(plane: Plane): Plane {
  const values = new Float64Array(plane.values.length);
  // Separable binomial [1, 2, 1] kernel; fixed smoothing reduces sensor noise.
  for (let y = 0; y < plane.height; y += 1) {
    for (let x = 0; x < plane.width; x += 1) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          sum += sample(plane, x + dx, y + dy) * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
        }
      }
      values[y * plane.width + x] = sum / 16;
    }
  }
  return { ...plane, values };
}

function integral(values: Float64Array, width: number, height: number): Float64Array {
  const result = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += values[y * width + x] ?? 0;
      result[(y + 1) * (width + 1) + x + 1] = row + (result[y * (width + 1) + x + 1] ?? 0);
    }
  }
  return result;
}

function windowSum(values: Float64Array, stride: number, x: number, y: number): number {
  const x0 = x - 2;
  const y0 = y - 2;
  const x1 = x + 3;
  const y1 = y + 3;
  return (
    (values[y1 * stride + x1] ?? 0) -
    (values[y0 * stride + x1] ?? 0) -
    (values[y1 * stride + x0] ?? 0) +
    (values[y0 * stride + x0] ?? 0)
  );
}

function corners(plane: Plane): Corner[] {
  const xx = new Float64Array(plane.values.length);
  const xy = new Float64Array(plane.values.length);
  const yy = new Float64Array(plane.values.length);
  for (let y = 1; y < plane.height - 1; y += 1) {
    for (let x = 1; x < plane.width - 1; x += 1) {
      const gx = (sample(plane, x + 1, y) - sample(plane, x - 1, y)) / 2;
      const gy = (sample(plane, x, y + 1) - sample(plane, x, y - 1)) / 2;
      const i = y * plane.width + x;
      xx[i] = gx * gx;
      xy[i] = gx * gy;
      yy[i] = gy * gy;
    }
  }
  const sumXX = integral(xx, plane.width, plane.height);
  const sumXY = integral(xy, plane.width, plane.height);
  const sumYY = integral(yy, plane.width, plane.height);
  const candidates: Corner[] = [];
  let maximumResponse = 0;
  for (let y = border; y < plane.height - border; y += 1) {
    for (let x = border; x < plane.width - border; x += 1) {
      const a = windowSum(sumXX, plane.width + 1, x, y) / 25;
      const b = windowSum(sumXY, plane.width + 1, x, y) / 25;
      const c = windowSum(sumYY, plane.width + 1, x, y) / 25;
      const response = a * c - b * b - 0.04 * (a + c) ** 2;
      // Fixed engineering contrast floor, not a calibrated blur/accuracy score.
      if (response > 0.000001) {
        maximumResponse = Math.max(maximumResponse, response);
        candidates.push({ x, y, response });
      }
    }
  }
  candidates.sort((a, b) => b.response - a.response || a.y - b.y || a.x - b.x);
  const selected: Corner[] = [];
  for (const candidate of candidates) {
    if (candidate.response < maximumResponse * 0.01) continue;
    if (selected.some((point) => (point.x - candidate.x) ** 2 + (point.y - candidate.y) ** 2 < 36))
      continue;
    selected.push(candidate);
    if (selected.length === maximumLevelKeypoints) break;
  }
  return selected;
}

function makePattern(): readonly (readonly [number, number, number, number])[] {
  // A fixed own-generated integer pattern, not a trained or downloaded asset.
  let state = 0x6b696731;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 15) - 7;
  };
  return Array.from({ length: 256 }, () => {
    const ax = next();
    const ay = next();
    let bx = next();
    let by = next();
    if (ax === bx && ay === by) {
      bx = ax === 7 ? 6 : ax + 1;
      by = ay;
    }
    return Object.freeze([ax, ay, bx, by] as const);
  });
}

const pattern = makePattern();

function descriptor(plane: Plane, corner: Corner): readonly number[] | undefined {
  let momentX = 0;
  let momentY = 0;
  let minimum = 1;
  let maximum = 0;
  for (let dy = -7; dy <= 7; dy += 1) {
    for (let dx = -7; dx <= 7; dx += 1) {
      if (dx * dx + dy * dy > 49) continue;
      const value = sample(plane, corner.x + dx, corner.y + dy);
      momentX += dx * value;
      momentY += dy * value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  if (maximum - minimum < 0.08) return undefined;
  const angle = Math.atan2(momentY, momentX);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const words = new Array<number>(8).fill(0);
  let ones = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const pair = pattern[i];
    if (!pair) return undefined;
    const [ax, ay, bx, by] = pair;
    const a = sample(plane, corner.x + ax * cosine - ay * sine, corner.y + ax * sine + ay * cosine);
    const b = sample(plane, corner.x + bx * cosine - by * sine, corner.y + bx * sine + by * cosine);
    if (a < b) {
      const word = Math.floor(i / 32);
      words[word] = ((words[word] ?? 0) | (1 << (i % 32))) >>> 0;
      ones += 1;
    }
  }
  return ones >= 38 && ones <= 218 ? Object.freeze(words) : undefined;
}

export function extractReferenceImageFeatures(input: unknown): ReferenceFeatureResult {
  try {
    const source = inputPlane(input);
    if (!source) return { status: "invalid", reason: "invalid_rgb_input" };
    const scale = Math.min(1, maximumOutputEdge / Math.max(source.width, source.height));
    const base = resize(
      source,
      Math.max(1, Math.round(source.width * scale)),
      Math.max(1, Math.round(source.height * scale)),
    );
    if (Math.min(base.width, base.height) < 32)
      return { status: "low_detail", reason: "narrow_image" };
    const secondWidth = Math.round(base.width * 0.75);
    const secondHeight = Math.round(base.height * 0.75);
    const levels = [base];
    if (Math.min(secondWidth, secondHeight) >= 32)
      levels.push(resize(base, secondWidth, secondHeight));
    const keypoints: ReferenceKeypoint[] = [];
    for (const rawLevel of levels) {
      const level = smooth(rawLevel);
      for (const corner of corners(level)) {
        const x = corner.x / (level.width - 1);
        const y = corner.y / (level.height - 1);
        if (
          keypoints.some(
            (point) => ((point.x - x) * base.width) ** 2 + ((point.y - y) * base.height) ** 2 < 16,
          )
        )
          continue;
        const words = descriptor(level, corner);
        if (words) keypoints.push(Object.freeze({ x, y, descriptor: words }));
      }
    }
    if (keypoints.length < minimumKeypoints)
      return { status: "low_detail", reason: "insufficient_corners" };
    return {
      status: "ok",
      features: Object.freeze({
        version: REFERENCE_FEATURE_VERSION,
        width: base.width,
        height: base.height,
        keypoints: Object.freeze(keypoints),
      }),
    };
  } catch {
    return { status: "invalid", reason: "invalid_rgb_input" };
  }
}
