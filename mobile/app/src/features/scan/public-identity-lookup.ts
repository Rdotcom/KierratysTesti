import {
  ProductLookupResultSchema,
  type ProductLookupResult,
} from "@kierratysappi/contracts/lookup-schema";
import { GtinSchema, type Gtin, type Language } from "@kierratysappi/domain";
type FetchPort = (url: string, init: RequestInit) => Promise<Response>;
const maxBytes = 65536;
const safeText = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\p{Cc}\p{Cf}]/u.test(v)
    ? v.trim()
    : undefined;
const record = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
const unavailable = (gtin: Gtin): ProductLookupResult => ({
  status: "provider_unavailable",
  gtin,
  retryable: true,
});
export function normalizePublicIdentity(
  payload: unknown,
  gtin: Gtin,
  language: Language,
  now: string,
): ProductLookupResult {
  const product = record(record(payload)?.product),
    code = GtinSchema.safeParse(product?.code);
  if (
    !product ||
    !code.success ||
    code.data.padStart(14, "0") !== gtin.padStart(14, "0") ||
    (product.product_type !== undefined && product.product_type !== "food")
  )
    return unavailable(gtin);
  const name =
    safeText(product[`product_name_${language}`], 160) ?? safeText(product.product_name, 160);
  const brand = safeText(product.brands, 240);
  const provenance = {
    sourceId: "open-food-facts",
    sourceName: "Open Food Facts contributors",
    sourceRecordId: gtin,
    sourceUrl: `https://world.openfoodfacts.org/product/${gtin}`,
    retrievedAt: now,
    confidence: 0.6,
    verificationStatus: "community",
    license: {
      id: "odbl-1.0-dbcl-1.0",
      name: "ODbL-1.0 database / DbCL-1.0 contents",
      url: "https://opendatacommons.org/licenses/odbl/1-0/",
      attributionText: "Open Food Facts contributors",
      shareAlike: true,
    },
  };
  return ProductLookupResultSchema.parse({
    status: "packaging_missing",
    gtin,
    product: {
      gtin,
      ...(name ? { name: { value: name, provenance } } : {}),
      ...(brand ? { brands: { value: [brand], provenance } } : {}),
      packagingCompleteness: { value: "unknown", provenance },
      packagingComponents: [],
    },
    missingFields: ["packagingComponents"],
    provider: { id: "open-food-facts", name: "Open Food Facts" },
    cache: { hit: false, storedAt: now, expiresAt: now },
  });
}
export function createPublicIdentityLookup(fetcher: FetchPort, now = Date.now) {
  const requests: number[] = [];
  return async (
    gtin: Gtin,
    language: Language,
    signal?: AbortSignal,
  ): Promise<ProductLookupResult> => {
    if (signal?.aborted) throw Error("lookup_cancelled");
    if (!GtinSchema.safeParse(gtin).success) throw Error("invalid_gtin");
    const at = now();
    while (requests.length && (requests[0] ?? at) <= at - 60000) requests.shift();
    if (requests.length >= 4) return unavailable(gtin);
    requests.push(at);
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 6000);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const url = new URL(`https://world.openfoodfacts.org/api/v3/product/${gtin}`);
      url.searchParams.set(
        "fields",
        "code,product_type,product_name,product_name_fi,product_name_en,brands",
      );
      url.searchParams.set("lc", language);
      url.searchParams.set("cc", "fi");
      const response = await fetcher(url.href, {
        signal: controller.signal,
        redirect: "error",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "User-Agent": "KeepItGreen/0.1 (https://github.com/roopeaal/KierratysAppi)",
        },
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return { status: "not_found", gtin };
      }
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get("content-type")?.includes("json") ||
        Number(response.headers.get("content-length")) > maxBytes
      ) {
        await response.body?.cancel();
        return unavailable(gtin);
      }
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          length += next.value.byteLength;
          if (length > maxBytes) {
            await reader.cancel();
            return unavailable(gtin);
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        return normalizePublicIdentity(
          JSON.parse(new TextDecoder().decode(bytes)),
          gtin,
          language,
          new Date(at).toISOString(),
        );
      } catch {
        return unavailable(gtin);
      }
    } catch {
      throw Error("public_product_transport_unavailable");
    } finally {
      signal?.removeEventListener("abort", abort);
      clearTimeout(timer);
    }
  };
}
