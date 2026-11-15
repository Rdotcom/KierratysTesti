import { z } from "zod";
import { GtinSchema, parseGtin } from "./gtin";
import { parseReferenceNetQuantity } from "./reference-text-evidence";

export const offlineEncoder = {
  encoderSha256: "d12ec18cf58e3aed230f565ae9f2c79bd34cc35d347c8970b82209029a8fdfc4",
  preprocessingSha256: "2abfc997802d44d10758eecf5e633638d517b984d8de7a032aea079f2c1326d7",
} as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}]+$/u);
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
const url = text(2048).refine((s) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
});
export const OfflineVectorSchema = z
  .array(z.number().finite())
  .length(512)
  .refine((v) => Math.abs(Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) - 1) < 0.00001);
const source = z.strictObject({
  publisher: text(200),
  url,
  checkedOn: date,
  snapshotSha256: hash,
  licence: text(200),
  verificationStatus: z.literal("source_asserted"),
});
const product = z.strictObject({
  id: token,
  gtins: z.array(GtinSchema).min(1).max(8),
  name: text(160),
  brands: text(240),
  quantity: text(64).nullable(),
  manufacturer: text(240).nullable(),
  variant: text(160).nullable(),
  category: text(160).nullable(),
  packaging: text(160).nullable(),
  market: text(80).nullable(),
  packagingVersion: text(80).nullable(),
  createdOn: date,
  updatedOn: date,
  source,
});
export const OfflineCatalogueSchema = z
  .strictObject({
    schemaVersion: z.literal("offline-catalogue-v1"),
    version: token,
    encoderSha256: z.literal(offlineEncoder.encoderSha256),
    preprocessingSha256: z.literal(offlineEncoder.preprocessingSha256),
    products: z.array(product).min(1).max(1000),
    references: z
      .array(
        z.strictObject({
          id: token,
          productId: token,
          imageSha256: hash,
          vector: OfflineVectorSchema,
          source,
          familyId: token,
        }),
      )
      .max(10000),
  })
  .superRefine((c, ctx) => {
    const ids = new Set<string>(),
      codes = new Set<string>(),
      refs = new Set<string>();
    for (const p of c.products) {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: "duplicate_product" });
      ids.add(p.id);
      for (const g of p.gtins) {
        const canonical = g.padStart(14, "0");
        if (codes.has(canonical)) ctx.addIssue({ code: "custom", message: "conflicting_gtin" });
        codes.add(canonical);
      }
    }
    for (const r of c.references) {
      if (refs.has(r.id) || !ids.has(r.productId))
        ctx.addIssue({ code: "custom", message: "invalid_reference" });
      refs.add(r.id);
    }
  });
export type OfflineCatalogue = z.infer<typeof OfflineCatalogueSchema>;
export type OfflineProduct = z.infer<typeof product>;
export type OfflineProductResult =
  | {
      status: "catalogue_match";
      product: OfflineProduct;
      gtin: string;
      catalogueVersion: string;
      evidence: "barcode" | "manual";
    }
  | { status: "product_not_in_catalogue"; gtin: string }
  | { status: "invalid_barcode" | "ambiguous_barcode" | "unknown" | "unavailable" }
  | {
      status: "confirmation_required";
      products: OfflineProduct[];
      catalogueVersion: string;
      evidence: "image_text";
    };

/** Immutable bundled catalogue is a deployment asset, not a remote mutable cache.
 * No network/storage ports here. Source GTIN mapping is not manufacturer verification. */
export function createOfflineCatalogue(input: unknown) {
  const parsed = OfflineCatalogueSchema.safeParse(input);
  if (!parsed.success) return null;
  const catalogue = parsed.data;
  const byGtin = new Map(
    catalogue.products.flatMap((p) => p.gtins.map((g) => [g.padStart(14, "0"), p] as const)),
  );
  const copy = (p: OfflineProduct): OfflineProduct => ({
    ...p,
    gtins: [...p.gtins],
    source: { ...p.source },
  });
  return {
    version: catalogue.version,
    count: catalogue.products.length,
    lookup(
      values: readonly string[],
      evidence: "barcode" | "manual" = "barcode",
    ): OfflineProductResult {
      if (!Array.isArray(values) || !values.length || values.length > 8)
        return { status: "invalid_barcode" };
      const codes = new Map<string, string>();
      for (const value of values) {
        if (
          typeof value !== "string" ||
          value.length > 64 ||
          (evidence === "barcode" && !/^\d+$/u.test(value))
        )
          return { status: "invalid_barcode" };
        const parsed = parseGtin(value);
        if (!parsed.ok) return { status: "invalid_barcode" };
        codes.set(parsed.value.padStart(14, "0"), parsed.value);
      }
      if (codes.size !== 1) return { status: "ambiguous_barcode" };
      const pair = codes.entries().next().value;
      if (!pair) return { status: "invalid_barcode" };
      const found = byGtin.get(pair[0]);
      return found
        ? {
            status: "catalogue_match",
            product: copy(found),
            gtin: pair[1],
            catalogueVersion: catalogue.version,
            evidence,
          }
        : { status: "product_not_in_catalogue", gtin: pair[1] };
    },
    /** Exact cosine search with per-SKU max aggregation. Rank is NOT confidence
     * or an acceptance threshold; no candidate is automatically identified. */
    rank(vector: readonly number[], encoderSha256: string, preprocessingSha256: string) {
      const checked = OfflineVectorSchema.safeParse(vector);
      if (
        !checked.success ||
        encoderSha256 !== catalogue.encoderSha256 ||
        preprocessingSha256 !== catalogue.preprocessingSha256
      )
        return null;
      const best = new Map<string, number>();
      for (const r of catalogue.references) {
        const score = r.vector.reduce((s, x, i) => s + x * (checked.data[i] ?? 0), 0);
        best.set(r.productId, Math.max(best.get(r.productId) ?? -Infinity, score));
      }
      return [...best]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([productId, cosine]) => ({ productId, cosine }));
    },
    /** New confirmation-only UX, not activation of the experimental exact-SKU
     * gate. Full name AND exact quantity AND visual retrieval support required.
     * ROI can corroborate, never erase full-image contradictions or truncation. */
    suggest(
      full: readonly string[],
      detail: readonly string[],
      rankedIds: readonly string[],
    ): OfflineProductResult {
      if (full.length > 48 || detail.length > 48) return { status: "unknown" };
      const normalize = (s: string) =>
        s
          .normalize("NFKD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/gu, " ")
          .trim();
      const words = new Set(full.flatMap((s) => normalize(s).split(" ")));
      const amounts = [...full, ...detail].map(parseReferenceNetQuantity).filter((q) => q !== null);
      const amountKeys = new Set(amounts.map((q) => `${q.dimension}:${q.amount}`));
      if (amountKeys.size !== 1) return { status: "unknown" };
      const matches = catalogue.products.filter((p) => {
        const name = normalize(p.name).split(" "),
          quantity = parseReferenceNetQuantity(p.quantity);
        return (
          rankedIds.includes(p.id) &&
          name.some((w) => w.length >= 4) &&
          name.every((w) => words.has(w)) &&
          quantity &&
          amountKeys.has(`${quantity.dimension}:${quantity.amount}`)
        );
      });
      // Critical extra variant words veto a suggestion, never fuzzy-corrected.
      const critical = [
        "zero",
        "light",
        "diet",
        "original",
        "sugarfree",
        "vanilla",
        "cherry",
        "lemon",
        "lime",
        "orange",
      ];
      const contradictory = matches.some((p) =>
        critical.some(
          (w) =>
            words.has(w) &&
            !normalize(`${p.name} ${p.variant ?? ""}`)
              .split(" ")
              .includes(w),
        ),
      );
      return matches.length && !contradictory
        ? {
            status: "confirmation_required",
            products: matches.map(copy),
            catalogueVersion: catalogue.version,
            evidence: "image_text",
          }
        : { status: "unknown" };
    },
  };
}
export type OfflineCatalogueRuntime = NonNullable<ReturnType<typeof createOfflineCatalogue>>;
