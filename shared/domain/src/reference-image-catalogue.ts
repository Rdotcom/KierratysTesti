import { z } from "zod";
import { GtinSchema } from "./gtin";

/** Metadata intake only: no decoding, pixel hash computation, image storage or
 * verification that a reviewer actually performed the asserted review. */
export const REFERENCE_CATALOGUE_VERSION = "reference-image-catalogue-v1" as const;
const featureVersions = ["pixel-corners-v1", "pixel-scale-corners-v2"] as const;
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const text = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim() === value && !/[\p{Cc}\p{Cf}]/u.test(value));
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
  });
const sourceUrl = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.hash &&
        !url.search &&
        url.href === value &&
        /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/iu.test(url.hostname) &&
        !/\.(?:local|localhost|internal|invalid|test)$/iu.test(url.hostname) &&
        !/[\p{Cc}\p{Cf}]/u.test(value)
      );
    } catch {
      return false;
    }
  });
const review = z.strictObject({
  status: z.enum(["accepted", "pending", "rejected"]),
  reviewerId: token,
  reviewedOn: date,
  evidence: text(1024),
  reconciliation: z.enum(["accepted", "unresolved"]),
});
const identity = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("physical_label"), evidenceId: token, review }),
  z.strictObject({ method: z.literal("source_catalogue"), sourceUrl, review }),
]);
const publicLicences = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC-BY-3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
} as const;
const rights = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("public_source"),
    sourceUrl,
    authorCredit: text(160),
    license: z.enum(["CC0-1.0", "CC-BY-2.0", "CC-BY-3.0", "CC-BY-4.0"]),
    licenseUrl: sourceUrl,
    accessedOn: date,
    review,
  }),
  z.strictObject({
    kind: z.literal("owner_capture"),
    ownerAlias: token,
    license: z.literal("OWNER-PERMISSION"),
    permissionEvidenceId: token,
    review,
  }),
]);
const product = z.strictObject({
  productId: token,
  label: text(160),
  gtin: GtinSchema.optional(),
  identity,
});
const reference = z.strictObject({
  referenceId: token,
  productId: token,
  imageSha256: hash,
  capturedOn: date,
  /** Acquisition lineage, not a product/SKU class or model-predicted family. */
  sourceFamilyId: token,
  captureGroupId: token,
  split: z.enum(["enrollment", "independent_query"]),
  origin: z.enum(["independent_capture", "derived_capture"]),
  parentReferenceId: token.optional(),
  rights,
});
const receipt = z.strictObject({
  referenceId: token,
  imageSha256: hash,
  featureSha256: hash,
  featureVersion: z.enum(featureVersions),
});
const envelope = z.strictObject({
  schemaVersion: z.literal(REFERENCE_CATALOGUE_VERSION),
  catalogueId: token,
  featureVersion: z.enum(featureVersions),
  products: z.array(product).max(16),
  references: z.array(reference).max(32),
  featureReceipts: z.array(receipt).max(32),
  acceptance: review,
});
const policy = z.strictObject({ asOf: date, featureVersion: z.enum(featureVersions) });

export type ReviewedReferenceCatalogue = z.infer<typeof envelope>;
export type ReferenceCatalogueImportPolicy = z.infer<typeof policy>;
export type ReferenceCatalogueIssue = {
  readonly code:
    | "empty_catalogue"
    | "identity_review_incomplete"
    | "rights_review_incomplete"
    | "catalogue_acceptance_incomplete"
    | "insufficient_enrollment_captures"
    | "missing_independent_query";
  readonly productId?: string;
  readonly referenceId?: string;
};
const metadata = {
  readiness: "metadata_only",
  verificationStatus: "reviewer_asserted",
  bindingEvidence: "caller_asserted_sha256",
  integrationAllowed: false,
} as const;
export type ReferenceCatalogueImportResult = typeof metadata &
  (
    | {
        readonly status: "invalid";
        readonly reason: "invalid_input" | "invalid_policy" | "inconsistent_catalogue";
      }
    | {
        readonly status: "incomplete";
        readonly issues: readonly ReferenceCatalogueIssue[];
        readonly catalogue: ReviewedReferenceCatalogue;
      }
    | { readonly status: "ready"; readonly catalogue: ReviewedReferenceCatalogue }
  );

/** Copy JSON data through own descriptors, not getters/iterators. Array lengths,
 * object keys, depth, strings and total nodes are bounded before schema parsing. */
function boundedData(input: unknown): unknown {
  let nodes = 0;
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > 8192 || depth > 12) throw new Error("data_bound");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.length <= 2048) return value;
    if (typeof value !== "object" || value === null) throw new Error("data_type");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) throw new Error("array_type");
      const lengthDescriptor = descriptors.length;
      const length: unknown =
        lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : -1;
      if (
        typeof length !== "number" ||
        !Number.isInteger(length) ||
        length < 0 ||
        length > 32 ||
        keys.length !== length + 1
      )
        throw new Error("array_bound");
      const copied: unknown[] = [];
      for (let index = 0; index < length; index++) {
        const item = descriptors[String(index)];
        if (!item || !("value" in item)) throw new Error("array_accessor");
        copied.push(visit(item.value, depth + 1));
      }
      return copied;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) || keys.length > 24)
      throw new Error("object_type");
    const copied: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (
        typeof key !== "string" ||
        key.length > 64 ||
        ["__proto__", "constructor", "prototype"].includes(key)
      )
        throw new Error("object_key");
      const item = descriptors[key];
      if (!item || !("value" in item)) throw new Error("object_accessor");
      copied[key] = visit(item.value, depth + 1);
    }
    return copied;
  };
  return visit(input, 0);
}

function freezeData<T>(input: T): T {
  if (input && typeof input === "object") {
    for (const value of Object.values(input)) freezeData(value);
    Object.freeze(input);
  }
  return input;
}
function accepted(value: z.infer<typeof review>): boolean {
  return value.status === "accepted" && value.reconciliation === "accepted";
}
function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
function reviewsAndDates(catalogue: ReviewedReferenceCatalogue, asOf: string): boolean {
  if (catalogue.acceptance.reviewedOn > asOf) return false;
  for (const item of catalogue.products)
    if (
      item.identity.review.reviewedOn > asOf ||
      item.identity.review.reviewedOn > catalogue.acceptance.reviewedOn
    )
      return false;
  for (const item of catalogue.references) {
    if (
      item.capturedOn > asOf ||
      item.rights.review.reviewedOn > asOf ||
      item.rights.review.reviewedOn > catalogue.acceptance.reviewedOn ||
      item.capturedOn > item.rights.review.reviewedOn
    )
      return false;
    if (item.rights.kind === "public_source") {
      if (
        item.rights.accessedOn > asOf ||
        item.rights.accessedOn > item.rights.review.reviewedOn ||
        item.rights.licenseUrl !== publicLicences[item.rights.license]
      )
        return false;
    }
  }
  return true;
}

/** Readiness means complete, internally consistent ASSERTED metadata only.
 * Caller must actually hash decoded bytes/features and organize independent
 * identity/rights/camera review. No boolean here proves those acts occurred. */
export function importReferenceCatalogue(
  input: unknown,
  policyInput: unknown,
): ReferenceCatalogueImportResult {
  let checkedPolicy: ReferenceCatalogueImportPolicy;
  try {
    const result = policy.safeParse(boundedData(policyInput));
    if (!result.success) return { ...metadata, status: "invalid", reason: "invalid_policy" };
    checkedPolicy = result.data;
  } catch {
    return { ...metadata, status: "invalid", reason: "invalid_policy" };
  }
  let catalogue: ReviewedReferenceCatalogue;
  try {
    const result = envelope.safeParse(boundedData(input));
    if (!result.success) return { ...metadata, status: "invalid", reason: "invalid_input" };
    catalogue = result.data;
  } catch {
    return { ...metadata, status: "invalid", reason: "invalid_input" };
  }
  const invalid = (): ReferenceCatalogueImportResult => ({
    ...metadata,
    status: "invalid",
    reason: "inconsistent_catalogue",
  });
  if (
    catalogue.featureVersion !== checkedPolicy.featureVersion ||
    !reviewsAndDates(catalogue, checkedPolicy.asOf)
  )
    return invalid();
  if (
    !unique(catalogue.products.map((item) => item.productId)) ||
    !unique(
      catalogue.products.flatMap((item) => (item.gtin ? [item.gtin.padStart(14, "0")] : [])),
    ) ||
    !unique(catalogue.references.map((item) => item.referenceId)) ||
    !unique(catalogue.references.map((item) => item.imageSha256)) ||
    !unique(catalogue.featureReceipts.map((item) => item.referenceId)) ||
    catalogue.references.length !== catalogue.featureReceipts.length
  )
    return invalid();
  const products = new Set(catalogue.products.map((item) => item.productId));
  const references = new Map(catalogue.references.map((item) => [item.referenceId, item]));
  const receipts = new Map(catalogue.featureReceipts.map((item) => [item.referenceId, item]));
  const issues: ReferenceCatalogueIssue[] = [];
  if (!catalogue.products.length || !catalogue.references.length)
    issues.push({ code: "empty_catalogue" });
  if (!accepted(catalogue.acceptance)) issues.push({ code: "catalogue_acceptance_incomplete" });
  for (const item of catalogue.references) {
    const bound = receipts.get(item.referenceId);
    if (
      !products.has(item.productId) ||
      !bound ||
      bound.imageSha256 !== item.imageSha256 ||
      bound.featureVersion !== checkedPolicy.featureVersion
    )
      return invalid();
    if (item.origin === "independent_capture") {
      if (item.parentReferenceId !== undefined) return invalid();
    } else {
      const parent = item.parentReferenceId ? references.get(item.parentReferenceId) : undefined;
      if (
        !parent ||
        parent.referenceId === item.referenceId ||
        parent.origin !== "independent_capture" ||
        parent.productId !== item.productId ||
        parent.captureGroupId !== item.captureGroupId ||
        parent.sourceFamilyId !== item.sourceFamilyId ||
        parent.capturedOn !== item.capturedOn ||
        item.split !== "enrollment" ||
        parent.split !== "enrollment"
      )
        return invalid();
    }
    if (!accepted(item.rights.review))
      issues.push({ code: "rights_review_incomplete", referenceId: item.referenceId });
  }
  // Capture lineage cannot be relabelled across the enrollment/evaluation split
  // or assigned to two product identities to hide label or family leakage.
  for (let index = 0; index < catalogue.references.length; index++) {
    const a = catalogue.references[index];
    if (!a) return invalid();
    for (let next = index + 1; next < catalogue.references.length; next++) {
      const b = catalogue.references[next];
      if (!b) return invalid();
      const sameCapture = a.captureGroupId === b.captureGroupId;
      const sameFamily = a.sourceFamilyId === b.sourceFamilyId;
      if ((sameCapture || sameFamily) && (a.split !== b.split || a.productId !== b.productId))
        return invalid();
      if (sameCapture && (a.sourceFamilyId !== b.sourceFamilyId || a.capturedOn !== b.capturedOn))
        return invalid();
    }
  }
  for (const item of catalogue.products) {
    if (!accepted(item.identity.review))
      issues.push({ code: "identity_review_incomplete", productId: item.productId });
    const eligible = catalogue.references.filter(
      (entry) =>
        entry.productId === item.productId &&
        entry.origin === "independent_capture" &&
        accepted(entry.rights.review),
    );
    const enrollment = new Set(
      eligible.filter((entry) => entry.split === "enrollment").map((entry) => entry.captureGroupId),
    );
    if (enrollment.size < 2)
      issues.push({ code: "insufficient_enrollment_captures", productId: item.productId });
    if (!eligible.some((entry) => entry.split === "independent_query"))
      issues.push({ code: "missing_independent_query", productId: item.productId });
  }
  freezeData(catalogue);
  return issues.length
    ? { ...metadata, status: "incomplete", issues: freezeData(issues), catalogue }
    : { ...metadata, status: "ready", catalogue };
}
