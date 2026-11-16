import {
  BarcodeLibrarySchema,
  type BarcodeLibrary,
} from "@kierratysappi/contracts/barcode-library";
import type { Gtin, Language } from "@kierratysappi/domain";
import { normalizePublicIdentity } from "./public-identity-lookup";
export function createBarcodeLibraryLookup(raw: unknown) {
  const parsed = BarcodeLibrarySchema.safeParse(raw),
    library: BarcodeLibrary | undefined = parsed.success ? parsed.data : undefined;
  const index = new Map(library?.products.map((p) => [p.gtin.padStart(14, "0"), p]));
  return {
    count: index.size,
    lookup(gtin: Gtin, language: Language) {
      const p = index.get(gtin.padStart(14, "0"));
      if (!p || !library) return null;
      const result = normalizePublicIdentity(
        {
          product: {
            code: gtin,
            product_name: p.names[language] ?? p.name,
            brands: p.brands,
            product_type: "food",
          },
        },
        gtin,
        language,
        `${library.checkedAt}T00:00:00.000Z`,
      );
      if (result.status === "packaging_missing")
        return {
          ...result,
          cache: { ...result.cache, hit: true },
          provider: { id: "bundled-open-food-facts", name: "Open Food Facts · offline" },
        };
      return null;
    },
  };
}
