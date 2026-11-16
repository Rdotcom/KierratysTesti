import {
  ProductLookupResultSchema,
  type ProductLookupResult,
} from "@kierratysappi/contracts/lookup-schema";
import type { Gtin, Language } from "@kierratysappi/domain";
import type { OfflineCatalogueRuntime } from "@kierratysappi/domain/offline-product";

/** Known bundled identities work without server/network. No material is inferred
 * from a product name and no new image-model work is performed here. */
export function bundledBarcodeLookup(
  catalogue: OfflineCatalogueRuntime | null,
  gtin: Gtin,
): ProductLookupResult | null {
  const found = catalogue?.lookup([gtin]);
  if (found?.status !== "catalogue_match") return null;
  const { product } = found;
  const checked = `${product.source.checkedOn}T00:00:00.000Z`;
  const provenance = {
    sourceId: "offline-open-food-facts",
    sourceName: product.source.publisher,
    sourceRecordId: product.id,
    sourceUrl: product.source.url,
    retrievedAt: checked,
    confidence: 0.6,
    verificationStatus: "community",
    license: {
      id: "odbl-1.0-dbcl-1.0",
      name: product.source.licence,
      url: "https://opendatacommons.org/licenses/odbl/1-0/",
      attributionText: product.source.publisher,
      shareAlike: true,
    },
  };
  return ProductLookupResultSchema.parse({
    status: "packaging_missing",
    gtin,
    product: {
      gtin,
      name: { value: product.name, provenance },
      brands: { value: [product.brands], provenance },
      packagingCompleteness: { value: "unknown", provenance },
      packagingComponents: [],
    },
    missingFields: ["packagingComponents"],
    provider: { id: "bundled-open-food-facts", name: "Open Food Facts · offline" },
    // Immutable source snapshot date, not a fabricated live retrieval/expiry.
    cache: { hit: true, storedAt: checked, expiresAt: checked },
  });
}
export function createLocalFirstLookup(
  catalogue: OfflineCatalogueRuntime | null,
  online: (gtin: Gtin, language: Language) => Promise<ProductLookupResult>,
  publicFallback?: (gtin: Gtin, language: Language) => Promise<ProductLookupResult>,
) {
  return async (gtin: Gtin, language: Language): Promise<ProductLookupResult> => {
    const local = bundledBarcodeLookup(catalogue, gtin);
    if (local) return local;
    try {
      return await online(gtin, language);
    } catch (error) {
      if (publicFallback) {
        try {
          return await publicFallback(gtin, language);
        } catch {
          /* Preserve original typed transport failure and pending recovery. */
        }
      }
      throw error;
    }
  };
}
