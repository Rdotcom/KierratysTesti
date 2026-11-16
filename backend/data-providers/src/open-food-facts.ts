import {
  GtinSchema,
  ProductObservationSchema,
  type FieldProvenance,
  type Gtin,
  type MaterialFamily,
  type ObservedField,
  type PackagingComponentObservation,
  type PackagingShape,
  type ProviderProductResult,
  type SourceLicense,
} from "@kierratysappi/domain";
import { z } from "zod";
import type { ProductDataProvider, ProviderRequestContext } from "./contracts";

const SOURCES = [
  {
    type: "food",
    id: "open-food-facts",
    name: "Open Food Facts",
    origin: "https://world.openfoodfacts.org",
  },
  {
    type: "beauty",
    id: "open-beauty-facts",
    name: "Open Beauty Facts",
    origin: "https://world.openbeautyfacts.org",
  },
  {
    type: "petfood",
    id: "open-pet-food-facts",
    name: "Open Pet Food Facts",
    origin: "https://world.openpetfoodfacts.org",
  },
  {
    type: "product",
    id: "open-products-facts",
    name: "Open Products Facts",
    origin: "https://world.openproductsfacts.org",
  },
] as const;
type FactsSource = (typeof SOURCES)[number];
const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 4_500;
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 12;
const RATE_WINDOW_MS = 60_000;

const DATABASE_LICENSE: SourceLicense = {
  id: "open-food-facts-odbl-1.0-dbcl-1.0",
  name: "ODbL 1.0 database / DbCL 1.0 contents",
  url: "https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/",
  attributionText: "Open Food Facts contributors",
  shareAlike: true,
};

const IMAGE_LICENSE: SourceLicense = {
  id: "cc-by-sa-3.0",
  name: "Creative Commons Attribution-ShareAlike 3.0",
  url: "https://creativecommons.org/licenses/by-sa/3.0/",
  attributionText: "Open Food Facts contributors",
  shareAlike: true,
};

const ResponseSchema = z.object({
  product: z.object({ code: z.string() }).catchall(z.unknown()),
});

type FetchLike = typeof fetch;

export type OpenFoodFactsProviderOptions = {
  readonly productScope?: "food" | "all";
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  readonly userAgent?: string;
  readonly maxRequestsPerMinute?: number;
};

export class OpenFoodFactsProvider implements ProductDataProvider {
  readonly id: string;
  readonly displayName: string;

  readonly #productScope: "food" | "all";
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #now: () => Date;
  readonly #userAgent: string;
  readonly #maxRequestsPerMinute: number;
  readonly #requestTimestamps: number[] = [];

  constructor(options: OpenFoodFactsProviderOptions = {}) {
    this.#productScope = options.productScope ?? "food";
    this.id = this.#productScope === "all" ? "open-facts" : "open-food-facts";
    this.displayName = this.#productScope === "all" ? "Open Facts" : "Open Food Facts";
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#now = options.now ?? (() => new Date());
    this.#userAgent = options.userAgent ?? "KierratysAppi/0.1 (contact: app-owner@example.invalid)";
    this.#maxRequestsPerMinute = options.maxRequestsPerMinute ?? DEFAULT_MAX_REQUESTS_PER_MINUTE;
    if (!Number.isSafeInteger(this.#maxRequestsPerMinute) || this.#maxRequestsPerMinute < 1) {
      throw new Error("maxRequestsPerMinute must be a positive safe integer");
    }
  }

  async findByGtin(gtin: Gtin, context: ProviderRequestContext): Promise<ProviderProductResult> {
    const canonicalGtin = GtinSchema.parse(gtin);
    const requestedAt = this.#now();
    if (context.signal?.aborted) return { status: "error", code: "unavailable", retryable: true };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    const abortFromCaller = () => controller.abort();
    context.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      let source: FactsSource = SOURCES[0];
      // One upstream lookup may route to a sister database. Never follow arbitrary URLs,
      // fan out to every database, reset the deadline, or spend an uncounted quota token.
      for (let hop = 0; hop < 2; hop++) {
        if (!this.#reserveProviderRequest(this.#now().getTime())) {
          return { status: "error", code: "rate_limited", retryable: true };
        }
        const url: URL = new URL(`/api/v3/product/${canonicalGtin}`, source.origin);
        url.searchParams.set(
          "fields",
          [
            "code",
            "product_type",
            "product_name",
            "product_name_fi",
            "product_name_en",
            "brands",
            "packagings",
            "image_front_url",
          ].join(","),
        );
        url.searchParams.set("lc", context.language);
        url.searchParams.set("cc", "fi");
        url.searchParams.set("product_type", hop === 0 ? this.#productScope : source.type);

        const response: Response = await this.#fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": this.#userAgent,
          },
          redirect: "manual",
          signal: controller.signal,
        });

        if ([301, 302, 307, 308].includes(response.status)) {
          const next: FactsSource | undefined =
            this.#productScope === "all" && hop === 0
              ? redirectSource(response.headers.get("location"), canonicalGtin)
              : undefined;
          await response.body?.cancel();
          if (!next) return { status: "error", code: "invalid_response", retryable: false };
          source = next;
          continue;
        }
        if (response.status === 404) {
          return { status: "not_found" };
        }
        if (response.status === 429) {
          return { status: "error", code: "rate_limited", retryable: true };
        }
        if (response.status >= 500) {
          return { status: "error", code: "unavailable", retryable: true };
        }
        if (response.status >= 300 || !response.ok) {
          return { status: "error", code: "invalid_response", retryable: false };
        }

        const payload = await readLimitedJson(response);
        const parsed = ResponseSchema.safeParse(payload);
        if (!parsed.success) {
          return { status: "error", code: "invalid_response", retryable: false };
        }
        const returnedGtin = GtinSchema.safeParse(parsed.data.product.code);
        if (
          !returnedGtin.success ||
          returnedGtin.data.padStart(14, "0") !== canonicalGtin.padStart(14, "0")
        ) {
          return { status: "error", code: "invalid_response", retryable: false };
        }
        if (
          parsed.data.product.product_type !== undefined &&
          parsed.data.product.product_type !== source.type
        ) {
          return { status: "error", code: "invalid_response", retryable: false };
        }

        const product = normalizeProduct(
          canonicalGtin,
          parsed.data.product,
          requestedAt,
          source,
          context.language,
        );
        return { status: "found", product };
      }
      return { status: "error", code: "invalid_response", retryable: false };
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return { status: "error", code: "unavailable", retryable: true };
      }
      return { status: "error", code: "invalid_response", retryable: false };
    } finally {
      clearTimeout(timeout);
      context.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  #reserveProviderRequest(nowMs: number): boolean {
    while (
      this.#requestTimestamps.length > 0 &&
      (this.#requestTimestamps[0] ?? nowMs) <= nowMs - RATE_WINDOW_MS
    ) {
      this.#requestTimestamps.shift();
    }
    if (this.#requestTimestamps.length >= this.#maxRequestsPerMinute) return false;
    this.#requestTimestamps.push(nowMs);
    return true;
  }
}

function redirectSource(location: string | null, gtin: Gtin): FactsSource | undefined {
  if (!location) return undefined;
  try {
    const url = new URL(location);
    if (url.username || url.password || url.hash || url.port) return undefined;
    if (
      url.pathname !== `/api/v3/product/${gtin}` &&
      url.pathname !== `/api/v3/product/${gtin}.json`
    )
      return undefined;
    return SOURCES.find(
      (source) =>
        source.type !== "food" &&
        [
          source.origin,
          source.origin.replace("://world.", "://fi."),
          source.origin.replace("://world.", "://en."),
        ].includes(url.origin),
    );
  } catch {
    return undefined;
  }
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Provider response is too large");
  }

  if (!response.body) {
    throw new Error("Provider response has no body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel("Provider response is too large");
      throw new Error("Provider response is too large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function normalizeProduct(
  gtin: Gtin,
  input: Record<string, unknown>,
  retrievedAt: Date,
  source: FactsSource,
  language: "fi" | "en",
) {
  const sourceUrl = `${source.origin}/product/${gtin}`;
  const databaseLicense: SourceLicense =
    source.type === "food"
      ? DATABASE_LICENSE
      : {
          id: `${source.id}-odbl-1.0`,
          name: "Open Database License 1.0",
          url: "https://opendatacommons.org/licenses/odbl/1-0/",
          attributionText: `${source.name} contributors`,
          shareAlike: true,
        };
  const provenance = (confidence: number, license = databaseLicense): FieldProvenance => ({
    sourceId: source.id,
    sourceName: source.name,
    sourceRecordId: gtin,
    sourceUrl,
    retrievedAt: retrievedAt.toISOString(),
    confidence,
    verificationStatus: "community",
    license,
  });

  const productName = firstString(
    input[`product_name_${language}`],
    input.product_name,
    input.product_name_en,
  );
  const brands = stringList(input.brands);
  // Sister-database image rights have not been separately reviewed; don't reuse them.
  const imageUrl = source.type === "food" ? safeHttpsUrl(input.image_front_url) : undefined;
  const components = normalizePackaging(input.packagings, provenance);

  return ProductObservationSchema.parse({
    gtin,
    ...(productName ? { name: observed(productName, provenance(0.65)) } : {}),
    ...(brands.length > 0 ? { brands: observed(brands, provenance(0.6)) } : {}),
    ...(imageUrl ? { imageUrl: observed(imageUrl, provenance(0.55, IMAGE_LICENSE)) } : {}),
    packagingCompleteness: observed(components.length > 0 ? "partial" : "unknown", provenance(0.5)),
    packagingComponents: components,
  });
}

function normalizePackaging(
  input: unknown,
  provenance: (confidence: number) => FieldProvenance,
): PackagingComponentObservation[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((candidate, index) => {
    if (!isRecord(candidate)) {
      return [];
    }

    const rawMaterial = taxonomyValue(candidate.material);
    const rawShape = taxonomyValue(candidate.shape);
    const material = mapMaterial(rawMaterial);
    const shape = mapShape(rawShape);
    const displayName = taxonomyText(candidate.shape) ?? taxonomyText(candidate.material);

    return [
      {
        id: `off-component-${index + 1}`,
        ...(displayName ? { displayName: observed(displayName, provenance(0.55)) } : {}),
        packagingStatus: observed("packaging", provenance(0.6)),
        ...(material ? { materialFamily: observed(material, provenance(0.55)) } : {}),
        ...(rawMaterial ? { materialCode: observed(rawMaterial, provenance(0.55)) } : {}),
        ...(shape ? { shape: observed(shape, provenance(0.55)) } : {}),
        ...(shape === "bottle" || shape === "can"
          ? { depositReturnStatus: observed("unknown", provenance(0.2)) }
          : {}),
        conditions: {
          hazardousResidue: "unknown",
          pressurized: "unknown",
          emptied: "unknown",
        },
      },
    ];
  });
}

function observed<T>(value: T, provenance: FieldProvenance): ObservedField<T> {
  return { value, provenance };
}

function taxonomyValue(input: unknown): string | undefined {
  if (typeof input === "string") {
    return cleanString(input);
  }
  if (isRecord(input)) {
    return firstString(input.id, input.text);
  }
  return undefined;
}

function taxonomyText(input: unknown): string | undefined {
  if (isRecord(input)) {
    return firstString(input.text);
  }
  return undefined;
}

function mapMaterial(value: string | undefined): MaterialFamily | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return MATERIAL_TAXONOMY.get(normalized);
}

function mapShape(value: string | undefined): PackagingShape | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return SHAPE_TAXONOMY.get(normalized);
}

const MATERIAL_TAXONOMY = new Map<string, MaterialFamily>([
  ["plastic", "plastic"],
  ["en:plastic", "plastic"],
  ["paperboard", "carton"],
  ["en:paperboard", "carton"],
  ["cardboard", "carton"],
  ["en:cardboard", "carton"],
  ["carton", "carton"],
  ["en:carton", "carton"],
  ["paper", "paper"],
  ["en:paper", "paper"],
  ["glass", "glass"],
  ["en:glass", "glass"],
  ["metal", "metal"],
  ["en:metal", "metal"],
  ["steel", "metal"],
  ["en:steel", "metal"],
  ["aluminium", "metal"],
  ["en:aluminium", "metal"],
  ["aluminum", "metal"],
  ["en:aluminum", "metal"],
  ["wood", "wood"],
  ["en:wood", "wood"],
  ["cork", "wood"],
  ["en:cork", "wood"],
  ["composite", "composite"],
  ["en:composite", "composite"],
]);

const SHAPE_TAXONOMY = new Map<string, PackagingShape>([
  ["bottle", "bottle"],
  ["en:bottle", "bottle"],
  ["can", "can"],
  ["en:can", "can"],
  ["jar", "jar"],
  ["en:jar", "jar"],
  ["box", "box"],
  ["en:box", "box"],
  ["carton", "carton"],
  ["en:carton", "carton"],
  ["bag", "bag"],
  ["en:bag", "bag"],
  ["wrapper", "wrap"],
  ["en:wrapper", "wrap"],
  ["wrap", "wrap"],
  ["en:wrap", "wrap"],
  ["tray", "tray"],
  ["en:tray", "tray"],
  ["cup", "cup"],
  ["en:cup", "cup"],
  ["cap", "cap"],
  ["en:cap", "cap"],
  ["lid", "lid"],
  ["en:lid", "lid"],
  ["pump", "pump"],
  ["en:pump", "pump"],
  ["tube", "tube"],
  ["en:tube", "tube"],
]);

function stringList(input: unknown): string[] {
  if (typeof input !== "string") return [];
  return [
    ...new Set(
      input
        .split(",")
        .map(cleanString)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const cleaned = cleanString(value);
      if (cleaned) return cleaned;
    }
  }
  return undefined;
}

function cleanString(value: string): string | undefined {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 && cleaned.length <= 500 ? cleaned : undefined;
}

function safeHttpsUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
