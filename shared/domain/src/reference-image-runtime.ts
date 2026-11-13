import {
  importReferenceCatalogue,
  type ReferenceCatalogueIssue,
  type ReviewedReferenceCatalogue,
} from "./reference-image-catalogue";
import {
  extractReferenceImageFeaturesV2,
  REFERENCE_FEATURE_VERSION_V2,
  type ReferenceImageFeaturesV2,
} from "./reference-image-features-v2";
import {
  matchReferenceImageV2,
  REFERENCE_MATCHER_VERSION_V2,
  type ReferenceCatalogueEntryV2,
  type ReferenceMatchEvidenceV2,
} from "./reference-image-matcher-v2";

export const REFERENCE_RUNTIME_VERSION = "byte-bound-reference-runtime-v1" as const;
/** Fixed ordered JSON of the extracted FEATURES object, not a result wrapper. */
export const REFERENCE_RUNTIME_FEATURE_HASH_POLICY = "reference-v2-features-json-ascii-v1" as const;
export const REFERENCE_RUNTIME_LIMITS = Object.freeze({
  maximumEncodedBytes: 2 * 1024 * 1024,
  maximumTotalReferenceBytes: 16 * 1024 * 1024,
  maximumReferences: 32,
  maximumDimension: 1024,
  maximumPixels: 1048576,
});

/** Trusted platform assumptions: these ports must really compute SHA-256 and
 * decode the supplied bytes within the requested limits. This module cannot
 * prove their implementation, cancel them or guarantee a timeout. No URL or
 * file is accepted. Each call receives a fresh copy, not canonical owned bytes. */
export interface ReferenceRuntimePorts {
  sha256(encoded: Uint8Array): Promise<string>;
  decodeRgb(
    encoded: Uint8Array,
    limits: Readonly<{ maximumDimension: 1024; maximumPixels: 1048576 }>,
  ): Promise<unknown>;
}

type Product = ReviewedReferenceCatalogue["products"][number];
type Reference = ReviewedReferenceCatalogue["references"][number];
type Receipt = ReviewedReferenceCatalogue["featureReceipts"][number];
const runtimeMetadata = Object.freeze({
  runtimeVersion: REFERENCE_RUNTIME_VERSION,
  algorithmVersion: REFERENCE_MATCHER_VERSION_V2,
  featureVersion: REFERENCE_FEATURE_VERSION_V2,
  featureHashPolicy: REFERENCE_RUNTIME_FEATURE_HASH_POLICY,
  verificationStatus: "inferred",
  confidence: "uncalibrated_visual_similarity",
  integrityAssumption: "trusted_sha256_and_decoder_ports",
  integrationAllowed: false,
} as const);
type RuntimeMetadata = typeof runtimeMetadata;

export type ReferenceRuntimeIdentification = RuntimeMetadata &
  (
    | {
        readonly status: "candidate";
        readonly catalogueId: string;
        readonly queryImageSha256: string;
        readonly product: {
          readonly productId: string;
          readonly label: string;
          readonly identity: Product["identity"];
          readonly declaredIdentifier?: {
            readonly kind: "gtin";
            readonly value: string;
            readonly verificationStatus: "reviewer_asserted";
          };
        };
        readonly reference: Reference;
        readonly featureReceipt: Receipt;
        readonly catalogueAcceptance: ReviewedReferenceCatalogue["acceptance"];
        readonly evidence: ReferenceMatchEvidenceV2;
        readonly explanation: string;
      }
    | {
        readonly status: "ambiguous";
        readonly catalogueId: string;
        readonly queryImageSha256: string;
        readonly productIds: readonly string[];
        readonly explanation: string;
      }
    | { readonly status: "unknown"; readonly reason: "low_detail" | "no_geometric_match" }
    | { readonly status: "invalid"; readonly reason: "invalid_encoded_image" }
    | {
        readonly status: "unavailable";
        readonly reason:
          | "busy"
          | "hash_unavailable"
          | "decode_unavailable"
          | "decoder_output_invalid"
          | "unexpected_matcher_result";
      }
  );

/** Opaque closure: no mutable descriptors, query references or encoded source
 * images are exposed. Metadata is reviewer-asserted; names are not verified by
 * visual similarity. This remains experimental regardless of compile success. */
export interface ReferenceImageRuntime {
  readonly identify: (encoded: unknown) => Promise<ReferenceRuntimeIdentification>;
}
export type ReferenceRuntimeCompilation = RuntimeMetadata &
  (
    | {
        readonly status: "ready";
        readonly catalogueId: string;
        readonly enrollmentReferences: number;
        readonly boundIndependentQueries: number;
        readonly runtime: ReferenceImageRuntime;
      }
    | { readonly status: "incomplete"; readonly issues: readonly ReferenceCatalogueIssue[] }
    | {
        readonly status: "invalid";
        readonly reason:
          | "invalid_metadata"
          | "invalid_reference_bytes"
          | "image_hash_mismatch"
          | "feature_hash_mismatch";
      }
    | {
        readonly status: "unavailable";
        readonly reason:
          | "busy"
          | "invalid_ports"
          | "hash_unavailable"
          | "decode_unavailable"
          | "decoder_output_invalid"
          | "reference_low_detail";
      }
  );

const hashPattern = /^[a-f0-9]{64}$/u;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "length")?.get;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")?.get;
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")?.get;
const decoderLimits = Object.freeze({ maximumDimension: 1024, maximumPixels: 1048576 } as const);
let workActive = false;

function ownRecord(input: unknown, fields: readonly string[]): Record<string, unknown> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key))
  )
    return null;
  const result: Record<string, unknown> = Object.create(null);
  for (const name of fields) {
    const descriptor = descriptors[name];
    if (!descriptor || !("value" in descriptor)) return null;
    result[name] = descriptor.value;
  }
  return result;
}
function encodedLength(input: unknown): number | null {
  if (
    !(input instanceof Uint8Array) ||
    Object.getPrototypeOf(input) !== Uint8Array.prototype ||
    !typedArrayLength ||
    !typedArrayBuffer ||
    !arrayBufferLength
  )
    return null;
  const length: unknown = typedArrayLength.call(input);
  arrayBufferLength.call(typedArrayBuffer.call(input)); // Shared/proxied buffers reject.
  return typeof length === "number" &&
    length > 0 &&
    length <= REFERENCE_RUNTIME_LIMITS.maximumEncodedBytes
    ? length
    : null;
}
function copyBytes(input: Uint8Array, length: number): Uint8Array {
  const result = new Uint8Array(length);
  Uint8Array.prototype.set.call(result, input);
  return result;
}
function snapshotEncoded(input: unknown): Uint8Array | null {
  const length = encodedLength(input);
  return length === null ? null : copyBytes(input as Uint8Array, length);
}
function clear(bytes: Uint8Array): void {
  Uint8Array.prototype.fill.call(bytes, 0);
}
function readPorts(input: unknown): ReferenceRuntimePorts | null {
  const value = ownRecord(input, ["sha256", "decodeRgb"]);
  if (!value || typeof value.sha256 !== "function" || typeof value.decodeRgb !== "function")
    return null;
  return {
    sha256: value.sha256 as ReferenceRuntimePorts["sha256"],
    decodeRgb: value.decodeRgb as ReferenceRuntimePorts["decodeRgb"],
  };
}
interface Snapshot {
  referenceId: string;
  bytes: Uint8Array;
}
function snapshots(input: unknown, catalogue: ReviewedReferenceCatalogue): Snapshot[] | null {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
  const count: unknown =
    lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : -1;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count !== catalogue.references.length ||
    count > REFERENCE_RUNTIME_LIMITS.maximumReferences
  )
    return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== count + 1) return null;
  const expected = new Set(catalogue.references.map((reference) => reference.referenceId));
  const prepared: { referenceId: string; raw: Uint8Array; length: number }[] = [];
  let total = 0;
  for (let index = 0; index < count; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) return null;
    const value = ownRecord(descriptor.value, ["referenceId", "encoded"]);
    if (!value || typeof value.referenceId !== "string" || !expected.delete(value.referenceId))
      return null;
    const length = encodedLength(value.encoded);
    if (length === null) return null;
    total += length;
    if (total > REFERENCE_RUNTIME_LIMITS.maximumTotalReferenceBytes) return null;
    prepared.push({ referenceId: value.referenceId, raw: value.encoded as Uint8Array, length });
  }
  if (expected.size) return null;
  const owned: Snapshot[] = [];
  try {
    for (const value of prepared)
      owned.push({ referenceId: value.referenceId, bytes: copyBytes(value.raw, value.length) });
    return owned;
  } catch {
    for (const value of owned) clear(value.bytes);
    return null;
  }
}

function featureBytes(features: ReferenceImageFeaturesV2): Uint8Array {
  const ordered = {
    version: features.version,
    width: features.width,
    height: features.height,
    keypoints: features.keypoints.map((point) => ({
      x: point.x,
      y: point.y,
      scale: point.scale,
      descriptor: Array.from(point.descriptor),
    })),
  };
  const json = JSON.stringify(ordered);
  const result = new Uint8Array(json.length);
  for (let index = 0; index < json.length; index++) {
    const code = json.charCodeAt(index);
    if (code > 127) throw new Error("non_ascii_feature_encoding");
    result[index] = code;
  }
  return result;
}
async function hashBytes(bytes: Uint8Array, ports: ReferenceRuntimePorts): Promise<string | null> {
  const copy = copyBytes(bytes, bytes.length);
  try {
    const result: unknown = await ports.sha256(copy);
    return typeof result === "string" && hashPattern.test(result) ? result : null;
  } catch {
    return null;
  } finally {
    clear(copy);
  }
}
type Extracted =
  | { status: "ok"; features: ReferenceImageFeaturesV2 }
  | { status: "low_detail" | "decode_unavailable" | "decoder_output_invalid" };
async function extract(bytes: Uint8Array, ports: ReferenceRuntimePorts): Promise<Extracted> {
  const copy = copyBytes(bytes, bytes.length);
  let decoded: unknown;
  try {
    decoded = await ports.decodeRgb(copy, decoderLimits);
  } catch {
    return { status: "decode_unavailable" };
  } finally {
    clear(copy);
  }
  const result = extractReferenceImageFeaturesV2(decoded);
  decoded = undefined;
  if (result.status === "invalid") return { status: "decoder_output_invalid" };
  if (result.status === "low_detail") return { status: "low_detail" };
  return result;
}

function createRuntime(
  catalogue: ReviewedReferenceCatalogue,
  enrollment: ReferenceCatalogueEntryV2[],
  ports: ReferenceRuntimePorts,
): ReferenceImageRuntime {
  const products = new Map(catalogue.products.map((product) => [product.productId, product]));
  const references = new Map(
    catalogue.references
      .filter((reference) => reference.split === "enrollment")
      .map((reference) => [reference.referenceId, reference]),
  );
  const receipts = new Map(
    catalogue.featureReceipts.map((receipt) => [receipt.referenceId, receipt]),
  );
  return Object.freeze({
    async identify(input: unknown): Promise<ReferenceRuntimeIdentification> {
      if (workActive) return { ...runtimeMetadata, status: "unavailable", reason: "busy" };
      workActive = true;
      let owned: Uint8Array | null = null;
      try {
        owned = snapshotEncoded(input);
        if (!owned)
          return { ...runtimeMetadata, status: "invalid", reason: "invalid_encoded_image" };
        const queryImageSha256 = await hashBytes(owned, ports);
        if (!queryImageSha256)
          return { ...runtimeMetadata, status: "unavailable", reason: "hash_unavailable" };
        const extracted = await extract(owned, ports);
        if (extracted.status === "low_detail")
          return { ...runtimeMetadata, status: "unknown", reason: "low_detail" };
        if (extracted.status !== "ok")
          return { ...runtimeMetadata, status: "unavailable", reason: extracted.status };
        const result = matchReferenceImageV2(extracted.features, enrollment);
        if (result.status === "unknown")
          return {
            ...runtimeMetadata,
            status: "unknown",
            reason: result.reason === "low_detail" ? "low_detail" : "no_geometric_match",
          };
        if (result.status === "ambiguous")
          return Object.freeze({
            ...runtimeMetadata,
            status: "ambiguous",
            catalogueId: catalogue.catalogueId,
            queryImageSha256,
            productIds: Object.freeze(result.productIds),
            explanation:
              "More than one enrolled identity has similar visual features; no identity is selected.",
          });
        if (result.status !== "candidate")
          return { ...runtimeMetadata, status: "unavailable", reason: "unexpected_matcher_result" };
        const product = products.get(result.productId);
        const reference = references.get(result.evidence.referenceId);
        const featureReceipt = receipts.get(result.evidence.referenceId);
        if (!product || !reference || !featureReceipt || reference.productId !== product.productId)
          return { ...runtimeMetadata, status: "unavailable", reason: "unexpected_matcher_result" };
        const namedProduct = Object.freeze({
          productId: product.productId,
          label: product.label,
          identity: product.identity,
          ...(product.gtin
            ? {
                declaredIdentifier: Object.freeze({
                  kind: "gtin" as const,
                  value: product.gtin,
                  verificationStatus: "reviewer_asserted" as const,
                }),
              }
            : {}),
        });
        return Object.freeze({
          ...runtimeMetadata,
          status: "candidate",
          catalogueId: catalogue.catalogueId,
          queryImageSha256,
          product: namedProduct,
          reference,
          featureReceipt,
          catalogueAcceptance: catalogue.acceptance,
          evidence: Object.freeze(result.evidence),
          explanation:
            "Visual features match an enrolled reference. The catalogue identity is reviewer-asserted, not verified by this image match.",
        });
      } catch {
        return { ...runtimeMetadata, status: "invalid", reason: "invalid_encoded_image" };
      } finally {
        if (owned) clear(owned);
        workActive = false;
      }
    },
  });
}

/** Compiles only complete reviewer-asserted V2 metadata, binding every supplied
 * encoded image and actual locally extracted feature serialization to receipts.
 * Query-split references are checked but NEVER enrolled in the matcher. */
export async function compileReferenceImageRuntime(
  catalogueInput: unknown,
  policyInput: unknown,
  referenceBytesInput: unknown,
  portsInput: unknown,
): Promise<ReferenceRuntimeCompilation> {
  let imported: ReturnType<typeof importReferenceCatalogue>;
  try {
    imported = importReferenceCatalogue(catalogueInput, policyInput);
  } catch {
    return { ...runtimeMetadata, status: "invalid", reason: "invalid_metadata" };
  }
  if (imported.status === "invalid")
    return { ...runtimeMetadata, status: "invalid", reason: "invalid_metadata" };
  if (imported.status === "incomplete")
    return { ...runtimeMetadata, status: "incomplete", issues: imported.issues };
  const catalogue = imported.catalogue;
  if (catalogue.featureVersion !== REFERENCE_FEATURE_VERSION_V2)
    return { ...runtimeMetadata, status: "invalid", reason: "invalid_metadata" };
  if (workActive) return { ...runtimeMetadata, status: "unavailable", reason: "busy" };
  workActive = true;
  let owned: Snapshot[] | null = null;
  try {
    const ports = readPorts(portsInput);
    if (!ports) return { ...runtimeMetadata, status: "unavailable", reason: "invalid_ports" };
    owned = snapshots(referenceBytesInput, catalogue);
    if (!owned) return { ...runtimeMetadata, status: "invalid", reason: "invalid_reference_bytes" };
    const bytes = new Map(owned.map((value) => [value.referenceId, value.bytes]));
    const receipts = new Map(
      catalogue.featureReceipts.map((receipt) => [receipt.referenceId, receipt]),
    );
    const enrollment: ReferenceCatalogueEntryV2[] = [];
    for (const reference of catalogue.references) {
      const encoded = bytes.get(reference.referenceId);
      const receipt = receipts.get(reference.referenceId);
      if (!encoded || !receipt)
        return { ...runtimeMetadata, status: "invalid", reason: "invalid_reference_bytes" };
      const imageSha256 = await hashBytes(encoded, ports);
      if (!imageSha256)
        return { ...runtimeMetadata, status: "unavailable", reason: "hash_unavailable" };
      if (imageSha256 !== reference.imageSha256)
        return { ...runtimeMetadata, status: "invalid", reason: "image_hash_mismatch" };
      const extracted = await extract(encoded, ports);
      if (extracted.status === "low_detail")
        return { ...runtimeMetadata, status: "unavailable", reason: "reference_low_detail" };
      if (extracted.status !== "ok")
        return { ...runtimeMetadata, status: "unavailable", reason: extracted.status };
      const canonical = featureBytes(extracted.features);
      let actualFeatureSha256: string | null;
      try {
        actualFeatureSha256 = await hashBytes(canonical, ports);
      } finally {
        clear(canonical);
      }
      if (!actualFeatureSha256)
        return { ...runtimeMetadata, status: "unavailable", reason: "hash_unavailable" };
      if (actualFeatureSha256 !== receipt.featureSha256)
        return { ...runtimeMetadata, status: "invalid", reason: "feature_hash_mismatch" };
      if (reference.split === "enrollment")
        enrollment.push({
          productId: reference.productId,
          referenceId: reference.referenceId,
          imageSha256,
          features: extracted.features,
        });
      clear(encoded);
    }
    const runtime = createRuntime(catalogue, enrollment, ports);
    return Object.freeze({
      ...runtimeMetadata,
      status: "ready",
      catalogueId: catalogue.catalogueId,
      enrollmentReferences: enrollment.length,
      boundIndependentQueries: catalogue.references.length - enrollment.length,
      runtime,
    });
  } catch {
    return { ...runtimeMetadata, status: "invalid", reason: "invalid_reference_bytes" };
  } finally {
    if (owned) for (const value of owned) clear(value.bytes);
    workActive = false;
  }
}
