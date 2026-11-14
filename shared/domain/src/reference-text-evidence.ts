import { z } from "zod";

export const REFERENCE_TEXT_EVIDENCE_VERSION = "source-attribute-text-fusion-v1" as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u);
const sourceSchema = z.strictObject({
  publisher: text(200),
  url: z
    .string()
    .max(2048)
    .refine((s) => {
      try {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password && !/[\p{Cc}\p{Cf}]/u.test(s);
      } catch {
        return false;
      }
    }),
  licence: text(200),
  checkedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }),
  snapshotSha256: hash,
  reviewStatus: z.literal("source_asserted_pending_review"),
});
const productSchema = z.strictObject({
  productId: token,
  name: text(160),
  brands: text(240),
  quantity: text(64),
  source: sourceSchema,
});
const schema = z.strictObject({
  catalogueSha256: hash,
  products: z.array(productSchema).min(1).max(16),
  visual: z.strictObject({
    imageSha256: hash,
    status: z.enum(["candidate", "ambiguous", "unknown", "invalid", "unavailable"]),
    productIds: z.array(token).max(16),
  }),
  ocr: z.strictObject({
    imageSha256: hash,
    status: z.enum(["observed", "unavailable"]),
    textLines: z.array(text(64)).max(24),
  }),
});
type Source = z.infer<typeof sourceSchema>;
export interface CanonicalQuantity {
  readonly dimension: "mass_mg" | "volume_ul";
  readonly amount: number;
}

/** Exact isolated net amount only. No per-serving/per100g arithmetic, multipack
 * inference, fuzzy digits, optical correction, unreported units or guessed size. */
export function parseReferenceNetQuantity(input: unknown): CanonicalQuantity | null {
  if (typeof input !== "string" || input.length > 64 || /[\p{Cc}\p{Cf}]/u.test(input)) return null;
  const match =
    /^(?:(?:net\s*(?:weight|content|contents)|netto|poids\s+net)\s*:?\s*)?(\d{1,5})(?:[.,](\d{1,3}))?\s*(kg|mg|g|ml|cl|dl|l)\s*[e℮]?$/iu.exec(
      input.trim(),
    );
  if (!match) return null;
  const unit = match[3]?.toLowerCase();
  const scales: Record<string, number> = {
    mg: 1,
    g: 1000,
    kg: 1000000,
    ml: 1000,
    cl: 10000,
    dl: 100000,
    l: 1000000,
  };
  if (!unit || !scales[unit] || !match[1]) return null;
  const thousandths = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  const amount = (thousandths * scales[unit]) / 1000;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) return null;
  return { dimension: ["mg", "g", "kg"].includes(unit) ? "mass_mg" : "volume_ul", amount };
}
const quantityKey = (q: CanonicalQuantity) => `${q.dimension}:${q.amount}`;
const ignored = new Set([
  "as",
  "sa",
  "nv",
  "services",
  "norge",
  "norway",
  "oy",
  "ab",
  "ltd",
  "inc",
  "co",
  "the",
  "and",
  "with",
  "for",
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "au",
  "aux",
  "gout",
  "flavour",
  "flavor",
  "g",
  "kg",
  "ml",
  "cl",
  "dl",
  "l",
  "e",
]);
/** Ordinal markers and diacritics only; never repair numeric OCR lookalikes. */
function words(value: string): string[] {
  return [
    ...new Set(
      value
        .replace(/\bn\s*[º°.]?\s*(\d{1,3})\b/giu, "n$1")
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .match(/[a-z0-9]+/gu) ?? [],
    ),
  ].filter((w) => !ignored.has(w) && (/[a-z]{2}/u.test(w) || /^[a-z]\d{1,3}$/u.test(w)));
}
const metadata = {
  algorithmVersion: REFERENCE_TEXT_EVIDENCE_VERSION,
  verificationStatus: "inferred",
  confidence: "uncalibrated_multimodal_evidence",
  integrationAllowed: false,
  integrityAssumption: "trusted_same_image_ocr_visual_and_catalogue_binding",
} as const;
export type ReferenceTextDecision = typeof metadata & {
  queryImageSha256?: string;
  catalogueSha256?: string;
  status: "invalid" | "unavailable" | "candidate" | "ambiguous" | "unknown";
  productIds: readonly string[];
  hints: readonly { productId: string; label: string }[];
  sources: readonly Source[];
  reason:
    | "invalid_evidence"
    | "required_evidence_failed"
    | "no_sufficient_evidence"
    | "visual_preserved"
    | "same_family_quantity"
    | "name_and_quantity"
    | "conflicting_evidence";
};

/** Original bounded matching/fusion code, not a learned language model. OCR is
 * untrusted text, never instructions. Outputs are SOURCE candidates, not verified
 * identity/GTIN/material or a sorting rule. Byte binding belongs to the wrapper. */
export function fuseReferenceTextEvidence(serialized: unknown): ReferenceTextDecision {
  const invalid = (): ReferenceTextDecision => ({
    ...metadata,
    status: "invalid",
    productIds: [],
    hints: [],
    sources: [],
    reason: "invalid_evidence",
  });
  if (typeof serialized !== "string" || serialized.length > 65536) return invalid();
  try {
    const parsed = schema.safeParse(JSON.parse(serialized));
    if (!parsed.success) return invalid();
    const { products, visual, ocr } = parsed.data,
      ids = new Set(products.map((p) => p.productId));
    if (
      ids.size !== products.length ||
      visual.imageSha256 !== ocr.imageSha256 ||
      new Set(visual.productIds).size !== visual.productIds.length ||
      visual.productIds.some((id) => !ids.has(id))
    )
      return invalid();
    if (
      (visual.status === "candidate" && visual.productIds.length !== 1) ||
      (visual.status === "ambiguous" && visual.productIds.length < 2) ||
      (["unknown", "invalid", "unavailable"].includes(visual.status) && visual.productIds.length) ||
      (ocr.status === "unavailable" && ocr.textLines.length)
    )
      return invalid();
    if (["invalid", "unavailable"].includes(visual.status) || ocr.status === "unavailable")
      return {
        ...metadata,
        status: "unavailable",
        productIds: [],
        hints: [],
        sources: [],
        reason: "required_evidence_failed",
      };
    const observedWords = new Set(ocr.textLines.flatMap(words));
    const quantities = [
      ...new Map(
        ocr.textLines
          .map(parseReferenceNetQuantity)
          .filter((q): q is CanonicalQuantity => q !== null)
          .map((q) => [quantityKey(q), q]),
      ).values(),
    ];
    const entries = products.map((p) => ({
      ...p,
      nameWords: words(p.name),
      brandWords: words(p.brands),
      amount: parseReferenceNetQuantity(p.quantity),
    }));
    // Source quantities outside supported syntax remain unusable, never invented.
    const hints = entries
      .filter((p) => p.nameWords.some((w) => w.length >= 4 && observedWords.has(w)))
      .map((p) => ({ productId: p.productId, label: p.name }));
    const make = (
      status: ReferenceTextDecision["status"],
      productIds: string[],
      reason: ReferenceTextDecision["reason"],
    ): ReferenceTextDecision => ({
      ...metadata,
      queryImageSha256: visual.imageSha256,
      catalogueSha256: parsed.data.catalogueSha256,
      status,
      productIds: [...new Set(productIds)].sort(),
      hints,
      sources: products.filter((p) => productIds.includes(p.productId)).map((p) => p.source),
      reason,
    });
    const sameAmount = (p: (typeof entries)[number]) =>
      quantities.length === 1 &&
      p.amount !== null &&
      quantityKey(p.amount) === quantityKey(quantities[0] as CanonicalQuantity);
    // Full meaningful source-name tokens plus at least two DISTINCT text anchors;
    // being the sole catalogue entry or a brand alone is never enough.
    const strong = entries.filter(
      (p) =>
        p.nameWords.length > 0 &&
        p.nameWords.every((w) => observedWords.has(w)) &&
        new Set([...p.nameWords, ...p.brandWords.filter((w) => observedWords.has(w))]).size >= 2 &&
        sameAmount(p),
    );
    if (visual.status === "candidate") {
      if (strong.some((p) => !visual.productIds.includes(p.productId)))
        return make(
          "ambiguous",
          [...visual.productIds, ...strong.map((p) => p.productId)],
          "conflicting_evidence",
        );
      const p = entries.find((p) => visual.productIds.includes(p.productId));
      if (
        p &&
        quantities.length &&
        p.nameWords.some((w) => observedWords.has(w)) &&
        (quantities.length !== 1 || (p.amount && !sameAmount(p)))
      )
        return make("unknown", [], "conflicting_evidence");
      return make("candidate", [...visual.productIds], "visual_preserved");
    }
    if (visual.status === "ambiguous") {
      const candidates = entries.filter((p) => visual.productIds.includes(p.productId));
      const sharedName =
        candidates[0]?.nameWords.filter(
          (w) => w.length >= 4 && candidates.every((p) => p.nameWords.includes(w)),
        ) ?? [];
      const matching = candidates.filter(sameAmount);
      if (
        quantities.length === 1 &&
        sharedName.some((w) => observedWords.has(w)) &&
        matching.length === 1 &&
        !strong.some((p) => !visual.productIds.includes(p.productId))
      )
        return make(
          "candidate",
          matching.map((p) => p.productId),
          "same_family_quantity",
        );
      return make(
        "ambiguous",
        [...new Set([...visual.productIds, ...strong.map((p) => p.productId)])],
        quantities.length > 1 || strong.some((p) => !visual.productIds.includes(p.productId))
          ? "conflicting_evidence"
          : "no_sufficient_evidence",
      );
    }
    if (strong.length === 1)
      return make(
        "candidate",
        strong.map((p) => p.productId),
        "name_and_quantity",
      );
    if (strong.length > 1)
      return make(
        "ambiguous",
        strong.map((p) => p.productId),
        "conflicting_evidence",
      );
    return make("unknown", [], "no_sufficient_evidence");
  } catch {
    return invalid();
  }
}
