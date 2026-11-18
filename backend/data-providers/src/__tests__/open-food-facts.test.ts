import { GtinSchema } from "@kierratysappi/domain";
import { describe, expect, it, vi } from "vitest";
import { OpenFoodFactsProvider } from "../open-food-facts";

const gtin = GtinSchema.parse("3017620422003");
const context = { country: "FI" as const, language: "fi" as const };

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("OpenFoodFactsProvider", () => {
  it("bounds packaging/brand amplification and omits third-party tracking images", async () => {
    const provider = new OpenFoodFactsProvider({
      fetch: async () =>
        jsonResponse({
          product: {
            code: gtin,
            product_name: "Fixture",
            packagings: Array.from({ length: 5000 }, () => ({ material: "en:plastic" })),
            brands: "x,".repeat(999),
            image_front_url: "https://attacker.example/track.jpg",
          },
        }),
    });
    const result = await provider.findByGtin(gtin, context);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.product.packagingComponents).toHaveLength(32);
    expect(result.product.brands?.value.length).toBeLessThanOrEqual(20);
    expect(result.product.imageUrl).toBeUndefined();
    expect(JSON.stringify(result).length).toBeLessThan(100000);
  });
  it("prefers the requested English identity instead of the Finnish name", async () => {
    const provider = new OpenFoodFactsProvider({
      fetch: async () =>
        jsonResponse({
          product: {
            code: gtin,
            product_name_fi: "Pähkinälevite",
            product_name_en: "Hazelnut spread",
          },
        }),
    });
    const result = await provider.findByGtin(gtin, { country: "FI", language: "en" });
    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.product.name?.value).toBe("Hazelnut spread");
  });
  it("requests only the fixed OFF endpoint and normalizes packaging observations", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetchMock: typeof fetch = vi.fn(async (input, init) => {
      requestedUrl = input.toString();
      requestedInit = init;
      return jsonResponse({
        product: {
          code: gtin,
          product_name_fi: "  Hasselpähkinälevite  ",
          brands: "Nutella, Ferrero, Nutella",
          image_front_url: "https://images.openfoodfacts.org/example.jpg",
          packagings: [
            {
              material: { id: "en:glass", text: "Glass" },
              shape: { id: "en:jar", text: "Purkki" },
            },
            {
              material: { id: "en:plastic", text: "Plastic" },
              shape: { id: "en:lid", text: "Kansi" },
            },
          ],
        },
      });
    });

    const provider = new OpenFoodFactsProvider({
      fetch: fetchMock,
      now: () => new Date("2026-08-10T12:00:00.000Z"),
      userAgent: "KierratysAppi/0.1 (contact: test@example.com)",
    });
    const result = await provider.findByGtin(gtin, context);

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.product.name?.value).toBe("Hasselpähkinälevite");
    expect(result.product.brands?.value).toEqual(["Nutella", "Ferrero"]);
    expect(result.product.packagingCompleteness.value).toBe("partial");
    expect(result.product.packagingComponents).toHaveLength(2);
    expect(result.product.packagingComponents[0]?.materialFamily?.value).toBe("glass");
    expect(result.product.packagingComponents[0]?.shape?.value).toBe("jar");
    expect(result.product.packagingComponents[1]?.materialFamily?.value).toBe("plastic");
    expect(result.product.packagingComponents[1]?.shape?.value).toBe("lid");
    expect(result.product.name?.provenance.verificationStatus).toBe("community");
    expect(result.product.name?.provenance.license).toMatchObject({
      id: "open-food-facts-odbl-1.0-dbcl-1.0",
      shareAlike: true,
    });
    expect(result.product.name?.provenance.license.name).toContain("DbCL 1.0");
    expect(result.product.imageUrl?.provenance.license.id).toBe("cc-by-sa-3.0");

    const parsedUrl = new URL(requestedUrl);
    expect(parsedUrl.origin).toBe("https://world.openfoodfacts.org");
    expect(parsedUrl.pathname).toBe(`/api/v3/product/${gtin}`);
    expect(parsedUrl.searchParams.get("cc")).toBe("fi");
    expect(parsedUrl.searchParams.get("lc")).toBe("fi");
    expect(parsedUrl.searchParams.get("product_type")).toBe("food");
    expect(new Headers(requestedInit?.headers).get("User-Agent")).toContain("KierratysAppi");
    expect(requestedInit?.redirect).toBe("manual");
  });

  it("does not invent deposit status for a bottle", async () => {
    const provider = new OpenFoodFactsProvider({
      fetch: async () =>
        jsonResponse({
          product: {
            code: gtin,
            packagings: [{ material: "en:plastic", shape: "en:bottle" }],
          },
        }),
    });

    const result = await provider.findByGtin(gtin, context);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.product.packagingComponents[0]?.depositReturnStatus?.value).toBe("unknown");
    expect(result.product.packagingComponents[0]?.depositReturnStatus?.provenance.confidence).toBe(
      0.2,
    );
  });

  it.each([
    [404, "not_found", undefined],
    [429, "error", "rate_limited"],
    [503, "error", "unavailable"],
    [302, "error", "invalid_response"],
  ] as const)("maps HTTP %i without throwing", async (status, expectedStatus, expectedCode) => {
    const provider = new OpenFoodFactsProvider({
      fetch: async () => new Response(null, { status }),
    });
    const result = await provider.findByGtin(gtin, context);
    expect(result.status).toBe(expectedStatus);
    if (result.status === "error") {
      expect(result.code).toBe(expectedCode);
    }
  });

  it("rejects malformed and oversized responses", async () => {
    const malformed = new OpenFoodFactsProvider({
      fetch: async () => jsonResponse({ unexpected: true }),
    });
    const oversized = new OpenFoodFactsProvider({
      fetch: async () => jsonResponse({}, 200, { "content-length": "1000001" }),
    });

    await expect(malformed.findByGtin(gtin, context)).resolves.toMatchObject({
      status: "error",
      code: "invalid_response",
    });
    await expect(oversized.findByGtin(gtin, context)).resolves.toMatchObject({
      status: "error",
      code: "invalid_response",
    });
  });

  it("rejects a product whose returned GTIN does not match the request", async () => {
    const provider = new OpenFoodFactsProvider({
      fetch: async () => jsonResponse({ product: { code: "6410405196811" } }),
    });

    await expect(provider.findByGtin(gtin, context)).resolves.toEqual({
      status: "error",
      code: "invalid_response",
      retryable: false,
    });
  });

  it("rate-limits upstream calls below the provider per-IP ceiling", async () => {
    const fetchMock: typeof fetch = vi.fn(async () =>
      jsonResponse({ product: { code: gtin, packagings: [] } }),
    );
    const provider = new OpenFoodFactsProvider({
      fetch: fetchMock,
      maxRequestsPerMinute: 1,
      now: () => new Date("2026-08-10T12:00:00.000Z"),
    });

    await expect(provider.findByGtin(gtin, context)).resolves.toMatchObject({ status: "found" });
    await expect(provider.findByGtin(gtin, context)).resolves.toEqual({
      status: "error",
      code: "rate_limited",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a retryable unavailable result after timeout", async () => {
    const provider = new OpenFoodFactsProvider({
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    });

    await expect(provider.findByGtin(gtin, context)).resolves.toEqual({
      status: "error",
      code: "unavailable",
      retryable: true,
    });
  });

  it("ignores unsafe image URLs and invalid packaging rows", async () => {
    const provider = new OpenFoodFactsProvider({
      fetch: async () =>
        jsonResponse({
          product: {
            code: gtin,
            image_front_url: "http://example.com/image.jpg",
            packagings: [null, "bad-row", { material: "en:unknown-material" }],
          },
        }),
    });

    const result = await provider.findByGtin(gtin, context);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.product.imageUrl).toBeUndefined();
    expect(result.product.packagingComponents).toHaveLength(1);
    expect(result.product.packagingComponents[0]?.materialFamily).toBeUndefined();
  });

  it("does not infer materials or shapes from misleading taxonomy substrings", async () => {
    const provider = new OpenFoodFactsProvider({
      fetch: async () =>
        jsonResponse({
          product: {
            code: gtin,
            packagings: [{ material: "en:non-plastic", shape: "en:not-a-bottle" }],
          },
        }),
    });

    const result = await provider.findByGtin(gtin, context);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.product.packagingComponents[0]?.materialFamily).toBeUndefined();
    expect(result.product.packagingComponents[0]?.shape).toBeUndefined();
  });
});
