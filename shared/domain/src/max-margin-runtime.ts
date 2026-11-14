import { z } from "zod";
import {
  extractReferenceImageFeaturesV2,
  type ReferenceImageFeaturesV2,
} from "./reference-image-features-v2";
import { fuseMonotoneReferenceIdentityEvidence } from "./reference-image-fusion-v2";
import { deriveReferenceIdentityGuard } from "./reference-image-identity-guard";
import {
  matchReferenceImageV2,
  type ReferenceCatalogueEntryV2,
} from "./reference-image-matcher-v2";
import { createMaxMarginReferenceIndex } from "./reference-image-max-margin";

export const MAX_MARGIN_RUNTIME_VERSION = "byte-bound-max-margin-runtime-v1" as const;
export const MAX_MARGIN_RUNTIME_LIMITS = Object.freeze({
  maximumImages: 104,
  maximumImageBytes: 1500000,
  maximumTotalBytes: 32 * 1024 * 1024,
  compileDeadlineMs: 120000,
  queryDeadlineMs: 15000,
});
const hash = z.string().regex(/^[a-f0-9]{64}$/u),
  token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const text = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^\p{Cc}\p{Cf}]+$/u);
const source = z.strictObject({
  publisher: text,
  url: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        const u = new URL(value);
        return (
          u.protocol === "https:" && !u.username && !u.password && !/[\p{Cc}\p{Cf}]/u.test(value)
        );
      } catch {
        return false;
      }
    }),
  licence: text,
  checkedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }),
  snapshotSha256: hash,
  reviewStatus: z.literal("source_asserted_pending_review"),
});
const imageCommon = {
  imageId: token,
  imageSha256: hash,
  expectedVectorSha256: hash.optional(),
  source,
};
const manifestSchema = z.strictObject({
  schemaVersion: z.literal("max-margin-runtime-manifest-v1"),
  catalogueId: token,
  encoderSha256: hash,
  preprocessingSha256: hash,
  products: z
    .array(z.strictObject({ productId: token, label: text }))
    .min(1)
    .max(16),
  images: z
    .array(
      z.discriminatedUnion("role", [
        z.strictObject({ ...imageCommon, role: z.literal("reference"), productId: token }),
        z.strictObject({ ...imageCommon, role: z.literal("calibration_negative") }),
      ]),
    )
    .min(3)
    .max(104),
});
const encodedSchema = z.strictObject({
  imageSha256: hash,
  encoderSha256: hash,
  preprocessingSha256: hash,
  vector: z.array(z.number().finite()).length(512),
});
type Manifest = z.infer<typeof manifestSchema>;
export interface MaxMarginRuntimePorts {
  /** Trusted OFFLINE ports must actually hash supplied bytes, verify encoder
   * resource/preprocessing identity and bound decode. This module cannot prove
   * their implementation, cancel foreign work or guarantee real-time deadlines. */
  sha256(bytes: Uint8Array): Promise<string>;
  encode(bytes: Uint8Array, signal?: AbortSignal): Promise<unknown>;
  decodeRgb(
    bytes: Uint8Array,
    limits: Readonly<{ maximumDimension: 1024; maximumPixels: 1048576 }>,
  ): Promise<unknown>;
}
const metadata = {
  runtimeVersion: MAX_MARGIN_RUNTIME_VERSION,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
  integrationAllowed: false,
  integrityAssumption: "trusted_offline_sha256_encoder_decoder_ports",
} as const;
type Metadata = typeof metadata;
type Failure = Metadata & { status: "invalid" | "unavailable"; reason: string };
export type MaxMarginRuntimeIdentification =
  | Failure
  | (Metadata & {
      status: "candidate" | "ambiguous" | "unknown";
      queryImageSha256: string;
      catalogueSha256: string;
      encoderSha256: string;
      preprocessingSha256: string;
      vectorSha256: string;
      productIds: readonly string[];
      products: readonly {
        productId: string;
        label: string;
        sourceStatus: "source_asserted_pending_review";
      }[];
      sources: readonly Manifest["images"][number]["source"][];
      explanation: string;
    });
export interface MaxMarginImageRuntime {
  identify(encoded: unknown, signal?: AbortSignal): Promise<MaxMarginRuntimeIdentification>;
}
export type MaxMarginRuntimeCompilation =
  | Failure
  | (Metadata & {
      status: "ready";
      catalogueSha256: string;
      referenceCount: number;
      calibrationCount: number;
      runtime: MaxMarginImageRuntime;
    });
const fail = (status: "invalid" | "unavailable", reason: string): Failure => ({
  ...metadata,
  status,
  reason,
});
const parse = (value: unknown, maximum: number): unknown => {
  if (typeof value !== "string" || value.length > maximum) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};
const copy = (value: Uint8Array) => {
  const out = new Uint8Array(value.byteLength);
  Uint8Array.prototype.set.call(out, value);
  return out;
};
const clear = (value: Uint8Array) => Uint8Array.prototype.fill.call(value, 0);
const nativeArray = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(nativeArray, "buffer")?.get;
const lengthGetter = Object.getOwnPropertyDescriptor(nativeArray, "byteLength")?.get;
const resizableGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
function byteSnapshot(value: unknown): Uint8Array | null {
  try {
    if (
      !value ||
      Object.getPrototypeOf(value) !== Uint8Array.prototype ||
      !bufferGetter ||
      !lengthGetter
    )
      return null;
    const buffer: unknown = bufferGetter.call(value),
      length: unknown = lengthGetter.call(value);
    if (
      !buffer ||
      Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
      resizableGetter?.call(buffer) ||
      typeof length !== "number" ||
      length < 12 ||
      length > MAX_MARGIN_RUNTIME_LIMITS.maximumImageBytes
    )
      return null;
    const bytes = new Uint8Array(length);
    Uint8Array.prototype.set.call(bytes, value as Uint8Array);
    if (
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes[length - 2] !== 255 ||
      bytes[length - 1] !== 217
    ) {
      clear(bytes);
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return null;
  const descriptors = Object.getOwnPropertyDescriptors(value),
    names = Reflect.ownKeys(descriptors);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== "string" || !keys.includes(key))
  )
    return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !("value" in d)) return null;
    out[key] = d.value;
  }
  return out;
}
function assetsSnapshot(value: unknown, manifest: Manifest): Map<string, Uint8Array> | null {
  const out = new Map<string, Uint8Array>();
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const count = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (
      count !== manifest.images.length ||
      count > 104 ||
      Reflect.ownKeys(value).length !== count + 1
    )
      return null;
    const expected = new Set(manifest.images.map((row) => row.imageId));
    let total = 0;
    for (let i = 0; i < count; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      const row =
        descriptor && "value" in descriptor
          ? record(descriptor.value, ["imageId", "encoded"])
          : null;
      if (!row || typeof row.imageId !== "string" || !expected.delete(row.imageId))
        throw Error("asset_shape");
      const bytes = byteSnapshot(row.encoded);
      if (!bytes) throw Error("asset_bytes");
      out.set(row.imageId, bytes);
      total += bytes.byteLength;
      if (total > MAX_MARGIN_RUNTIME_LIMITS.maximumTotalBytes) throw Error("asset_total");
    }
    return out;
  } catch {
    for (const bytes of out.values()) clear(bytes);
    return null;
  }
}
function readPorts(value: unknown): MaxMarginRuntimePorts | null {
  const r = record(value, ["sha256", "encode", "decodeRgb"]);
  if (
    !r ||
    typeof r.sha256 !== "function" ||
    typeof r.encode !== "function" ||
    typeof r.decodeRgb !== "function"
  )
    return null;
  return {
    sha256: r.sha256 as MaxMarginRuntimePorts["sha256"],
    encode: r.encode as MaxMarginRuntimePorts["encode"],
    decodeRgb: r.decodeRgb as MaxMarginRuntimePorts["decodeRgb"],
  };
}
class RuntimeFailure extends Error {
  constructor(
    readonly status: "invalid" | "unavailable",
    readonly reason: string,
  ) {
    super(reason);
  }
}
let active = false;
/** Retain ownership until actual foreign work settles, not merely race timeout. */
async function owned<T>(
  work: (check: () => void) => Promise<T>,
  deadline: number,
  signal?: AbortSignal,
): Promise<T | Failure> {
  if (signal?.aborted) return fail("unavailable", "cancelled");
  if (active) return fail("unavailable", "busy");
  active = true;
  let stopped: string | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    abort = () => {};
  const check = () => {
    if (stopped || signal?.aborted) throw new RuntimeFailure("unavailable", stopped ?? "cancelled");
  };
  const stop = new Promise<Failure>((resolve) => {
    const stopWith = (reason: string) => {
      stopped ??= reason;
      resolve(fail("unavailable", stopped));
    };
    abort = () => stopWith("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => stopWith("timeout"), deadline);
    if (signal?.aborted) abort();
  });
  const operation = Promise.resolve()
    .then(() => {
      check();
      return work(check);
    })
    .catch((error: unknown) =>
      error instanceof RuntimeFailure
        ? fail(error.status, error.reason)
        : fail("unavailable", "runtime_failed"),
    )
    .finally(() => {
      active = false;
    });
  try {
    return await Promise.race([operation, stop]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
async function hashing(
  bytes: Uint8Array,
  ports: MaxMarginRuntimePorts,
  check: () => void,
): Promise<string> {
  check();
  const fresh = copy(bytes);
  try {
    const result: unknown = await ports.sha256(fresh);
    check();
    if (typeof result !== "string" || !/^[a-f0-9]{64}$/u.test(result))
      throw new RuntimeFailure("unavailable", "hash_output_invalid");
    return result;
  } catch (e) {
    if (e instanceof RuntimeFailure) throw e;
    throw new RuntimeFailure("unavailable", "hash_unavailable");
  } finally {
    clear(fresh);
  }
}
async function encoding(
  bytes: Uint8Array,
  imageSha256: string,
  manifest: Manifest,
  ports: MaxMarginRuntimePorts,
  check: () => void,
  signal?: AbortSignal,
) {
  check();
  const fresh = copy(bytes);
  let raw: unknown;
  try {
    raw = await ports.encode(fresh, signal);
    check();
  } catch (e) {
    if (e instanceof RuntimeFailure) throw e;
    throw new RuntimeFailure("unavailable", "encoding_unavailable");
  } finally {
    clear(fresh);
  }
  const parsed = encodedSchema.safeParse(parse(raw, 32768));
  if (!parsed.success || !parsed.data.vector.some((v) => v !== 0))
    throw new RuntimeFailure("unavailable", "encoding_output_invalid");
  const value = parsed.data;
  if (
    value.imageSha256 !== imageSha256 ||
    value.encoderSha256 !== manifest.encoderSha256 ||
    value.preprocessingSha256 !== manifest.preprocessingSha256
  )
    throw new RuntimeFailure("invalid", "encoding_identity_mismatch");
  const vectorSha256 = await hashing(
    new TextEncoder().encode(JSON.stringify(value.vector)),
    ports,
    check,
  );
  return { vector: value.vector, vectorSha256 };
}
async function pixels(
  bytes: Uint8Array,
  ports: MaxMarginRuntimePorts,
  check: () => void,
): Promise<ReferenceImageFeaturesV2 | null> {
  check();
  const fresh = copy(bytes);
  let raw: unknown;
  try {
    raw = await ports.decodeRgb(fresh, { maximumDimension: 1024, maximumPixels: 1048576 });
    check();
  } catch (e) {
    if (e instanceof RuntimeFailure) throw e;
    throw new RuntimeFailure("unavailable", "decode_unavailable");
  } finally {
    clear(fresh);
  }
  const result = extractReferenceImageFeaturesV2(raw);
  if (result.status === "invalid")
    throw new RuntimeFailure("unavailable", "decoder_output_invalid");
  return result.status === "ok" ? result.features : null;
}
const lane = (value: { status: string; productId?: string; productIds?: readonly string[] }) =>
  value.status === "candidate"
    ? { status: "candidate", productId: value.productId }
    : value.status === "ambiguous"
      ? { status: "ambiguous", productIds: value.productIds }
      : { status: value.status === "unknown" ? "unknown" : "unavailable" };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Computational readiness only. Source identity/rights stays pending; there is
 * no production catalogue, human approval, material/bin or automatic lookup. */
export async function compileMaxMarginImageRuntime(
  serialized: unknown,
  assets: unknown,
  portInput: unknown,
  signal?: AbortSignal,
): Promise<MaxMarginRuntimeCompilation> {
  if (signal?.aborted) return fail("unavailable", "cancelled");
  if (active) return fail("unavailable", "busy");
  let manifest: Manifest, ownedAssets: Map<string, Uint8Array>, ports: MaxMarginRuntimePorts;
  try {
    const parsed = manifestSchema.safeParse(parse(serialized, 2_097_152));
    if (!parsed.success) return fail("invalid", "invalid_manifest");
    manifest = parsed.data;
    const references = manifest.images.filter((row) => row.role === "reference"),
      negatives = manifest.images.filter((row) => row.role === "calibration_negative");
    const products = new Set(manifest.products.map((row) => row.productId));
    if (
      products.size !== manifest.products.length ||
      references.length < 2 ||
      references.length > 32 ||
      negatives.length < 1 ||
      negatives.length > 72 ||
      new Set(manifest.images.map((row) => row.imageId)).size !== manifest.images.length ||
      new Set(manifest.images.map((row) => row.imageSha256)).size !== manifest.images.length ||
      references.some((row) => !products.has(row.productId)) ||
      [...products].some((id) => references.filter((row) => row.productId === id).length < 2)
    )
      return fail("invalid", "invalid_membership");
    const p = readPorts(portInput);
    if (!p) return fail("unavailable", "invalid_ports");
    ports = p;
    const snapshot = assetsSnapshot(assets, manifest);
    if (!snapshot) return fail("invalid", "invalid_assets");
    ownedAssets = snapshot;
  } catch {
    return fail("invalid", "invalid_input");
  }
  let started = false;
  const result = await owned(
    async (check) => {
      started = true;
      try {
        const catalogueSha256 = await hashing(
          new TextEncoder().encode(serialized as string),
          ports,
          check,
        );
        const references: {
            productId: string;
            referenceId: string;
            imageSha256: string;
            vector: number[];
          }[] = [],
          negatives: { imageSha256: string; vector: number[] }[] = [],
          pixelGallery: ReferenceCatalogueEntryV2[] = [];
        for (const row of manifest.images) {
          check();
          const bytes = ownedAssets.get(row.imageId);
          if (!bytes) throw new RuntimeFailure("invalid", "missing_asset");
          const imageSha256 = await hashing(bytes, ports, check);
          if (imageSha256 !== row.imageSha256)
            throw new RuntimeFailure("invalid", "image_hash_mismatch");
          const encoded = await encoding(bytes, imageSha256, manifest, ports, check, signal);
          if (row.expectedVectorSha256 && row.expectedVectorSha256 !== encoded.vectorSha256)
            throw new RuntimeFailure("invalid", "vector_hash_mismatch");
          if (row.role === "reference") {
            const features = await pixels(bytes, ports, check);
            if (!features) throw new RuntimeFailure("unavailable", "reference_low_detail");
            references.push({
              productId: row.productId,
              referenceId: row.imageId,
              imageSha256,
              vector: encoded.vector,
            });
            pixelGallery.push({
              productId: row.productId,
              referenceId: row.imageId,
              imageSha256,
              features,
            });
          } else negatives.push({ imageSha256, vector: encoded.vector });
        }
        const index = createMaxMarginReferenceIndex(
          JSON.stringify({
            encoderSha256: manifest.encoderSha256,
            preprocessingSha256: manifest.preprocessingSha256,
            catalogueSha256,
            references,
            negatives,
          }),
        );
        if (index.status !== "ready") throw new RuntimeFailure("invalid", "invalid_calibration");
        const observations = pixelGallery.map((row) => {
          const match = matchReferenceImageV2(row.features, pixelGallery);
          if (match.status === "invalid")
            throw new RuntimeFailure("unavailable", "invalid_self_observation");
          return {
            referenceId: row.referenceId,
            productId: row.productId,
            possibleProductIds:
              match.status === "candidate"
                ? [match.productId]
                : match.status === "ambiguous"
                  ? match.productIds
                  : [],
          };
        });
        const derived = deriveReferenceIdentityGuard(
          JSON.stringify({
            inventory: pixelGallery.map((row) => ({
              referenceId: row.referenceId,
              productId: row.productId,
            })),
            observations,
          }),
        );
        if (derived.status !== "ready") throw new RuntimeFailure("invalid", "invalid_self_guard");
        check();
        const runtime: MaxMarginImageRuntime = {
          async identify(input, querySignal) {
            if (querySignal?.aborted) return fail("unavailable", "cancelled");
            if (active) return fail("unavailable", "busy");
            let bytes: Uint8Array | null;
            try {
              bytes = byteSnapshot(input);
            } catch {
              bytes = null;
            }
            if (!bytes) return fail("invalid", "invalid_encoded_image");
            const answer = await owned(
              async (queryCheck) => {
                const imageSha256 = await hashing(bytes, ports, queryCheck);
                if (manifest.images.some((row) => row.imageSha256 === imageSha256))
                  return fail("invalid", "training_image");
                const encoded = await encoding(
                  bytes,
                  imageSha256,
                  manifest,
                  ports,
                  queryCheck,
                  querySignal,
                );
                const features = await pixels(bytes, ports, queryCheck);
                const pixel = features
                  ? matchReferenceImageV2(features, pixelGallery)
                  : { status: "unknown" };
                const embedding = index.compare(
                  JSON.stringify({
                    encoderSha256: manifest.encoderSha256,
                    preprocessingSha256: manifest.preprocessingSha256,
                    catalogueSha256,
                    imageSha256,
                    vector: encoded.vector,
                  }),
                );
                const fused = fuseMonotoneReferenceIdentityEvidence(
                  JSON.stringify({
                    pixelImageSha256: imageSha256,
                    embeddingImageSha256: imageSha256,
                    pixel: lane(pixel),
                    embedding: lane(embedding),
                    enrolledProductIds: manifest.products.map((row) => row.productId),
                    quarantineGroups: derived.guard.groups.map((row) => row.productIds),
                  }),
                );
                queryCheck();
                if (fused.status === "invalid" || fused.status === "unavailable")
                  return fail("unavailable", "invalid_engine_result");
                const productIds =
                  fused.status === "candidate"
                    ? [fused.productId]
                    : fused.status === "ambiguous"
                      ? [...fused.productIds]
                      : [];
                return {
                  ...metadata,
                  status: fused.status,
                  queryImageSha256: imageSha256,
                  catalogueSha256,
                  encoderSha256: manifest.encoderSha256,
                  preprocessingSha256: manifest.preprocessingSha256,
                  vectorSha256: encoded.vectorSha256,
                  productIds,
                  products: manifest.products
                    .filter((row) => productIds.includes(row.productId))
                    .map((row) => ({
                      ...row,
                      sourceStatus: "source_asserted_pending_review" as const,
                    })),
                  sources: clone(
                    manifest.images
                      .filter(
                        (row) => row.role === "reference" && productIds.includes(row.productId),
                      )
                      .map((row) => row.source),
                  ),
                  explanation:
                    "Visual identity is inferred; check the physical variant or barcode. No sorting rule or verified material was applied.",
                };
              },
              MAX_MARGIN_RUNTIME_LIMITS.queryDeadlineMs,
              querySignal,
            );
            clear(bytes);
            return answer;
          },
        };
        return {
          ...metadata,
          status: "ready" as const,
          catalogueSha256,
          referenceCount: references.length,
          calibrationCount: negatives.length,
          runtime,
        };
      } finally {
        for (const bytes of ownedAssets.values()) clear(bytes);
        ownedAssets.clear();
      }
    },
    MAX_MARGIN_RUNTIME_LIMITS.compileDeadlineMs,
    signal,
  );
  // A pre-start abort/busy result never enters the work's finally block.
  if (!started) {
    for (const bytes of ownedAssets.values()) clear(bytes);
    ownedAssets.clear();
  }
  return result;
}
