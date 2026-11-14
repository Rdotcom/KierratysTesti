import { z } from "zod";

/** Resource/interface descriptor hashes, not hashes of the iOS executable.
 * A distinct identity intentionally prevents reuse of Mac QA vectors. */
export const referenceNativeIdentity = Object.freeze({
  encoderSha256: "d12ec18cf58e3aed230f565ae9f2c79bd34cc35d347c8970b82209029a8fdfc4",
  preprocessingSha256: "2abfc997802d44d10758eecf5e633638d517b984d8de7a032aea079f2c1326d7",
  decoderPolicy: "imageio-oriented-fit-1024-srgb-rgb-v1",
} as const);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const identity = {
  encoderSha256: z.literal(referenceNativeIdentity.encoderSha256),
  preprocessingSha256: z.literal(referenceNativeIdentity.preprocessingSha256),
};
export const ReferenceNativeCapabilitiesSchema = z.strictObject({
  schemaVersion: z.literal("native-reference-capabilities-v1"),
  evidence: z.literal("integrity_and_interface_only"),
  ...identity,
  decoderPolicy: z.literal(referenceNativeIdentity.decoderPolicy),
  integrationAllowed: z.literal(false),
});
export const ReferenceNativeEmbeddingSchema = z.strictObject({
  imageSha256: hash,
  ...identity,
  vector: z
    .array(z.number().finite())
    .length(512)
    .refine((v) => {
      const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
      return Number.isFinite(norm) && Math.abs(norm - 1) < 0.00001;
    }),
});
export const ReferenceNativeRgbSchema = z.strictObject({
  schemaVersion: z.literal("native-reference-rgb-v1"),
  imageSha256: hash,
  decoderPolicy: z.literal(referenceNativeIdentity.decoderPolicy),
  width: z.number().int().min(1).max(1024),
  height: z.number().int().min(1).max(1024),
  channels: z.literal(3),
  rgbBase64: z.string().min(4).max(4194304),
});

/** Serialized native output only: no getters, prototype objects or coercion. */
export function parseReferenceNativeJson(input: unknown, maximum: number): unknown {
  if (typeof input !== "string" || input.length > maximum) throw new Error("invalid_response");
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("invalid_response");
  }
}

/** Bounded portable RGB bridge codec; no Buffer/native dependency in shared. */
export function decodeReferenceRgbBase64(value: string, expectedBytes: number): Uint8Array {
  if (
    !Number.isInteger(expectedBytes) ||
    expectedBytes < 3 ||
    expectedBytes > 3145728 ||
    value.length !== Math.ceil(expectedBytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  )
    throw new Error("invalid_response");
  const size = (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  if (size !== expectedBytes) throw new Error("invalid_response");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out = new Uint8Array(size);
  for (let i = 0, offset = 0; i < value.length; i += 4) {
    const a = alphabet.indexOf(value.charAt(i)),
      b = alphabet.indexOf(value.charAt(i + 1));
    const c = value.charAt(i + 2) === "=" ? 0 : alphabet.indexOf(value.charAt(i + 2));
    const d = value.charAt(i + 3) === "=" ? 0 : alphabet.indexOf(value.charAt(i + 3));
    if (
      a < 0 ||
      b < 0 ||
      c < 0 ||
      d < 0 ||
      (value.charAt(i + 2) === "=" && (b & 15) !== 0) ||
      (value.charAt(i + 3) === "=" && (c & 3) !== 0)
    )
      throw new Error("invalid_response");
    if (offset < size) out[offset++] = (a << 2) | (b >> 4);
    if (offset < size) out[offset++] = ((b & 15) << 4) | (c >> 2);
    if (offset < size) out[offset++] = ((c & 3) << 6) | d;
  }
  return out;
}
