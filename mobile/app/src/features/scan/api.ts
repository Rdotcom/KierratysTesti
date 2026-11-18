import {
  type ProductLookupResult,
  productLookupMethod,
  productLookupPath,
} from "@kierratysappi/contracts/lookup-schema";
import type { Gtin, Language } from "@kierratysappi/domain";
import { fetch as streamingFetch } from "expo/fetch";
import { Platform } from "react-native";
import { readBoundedJson } from "../security/bounded-json";
import { resolveApiBaseUrl } from "./api-config";
import { parseLookupHttpResponse } from "./lookup-response";

const environment =
  process.env.EXPO_PUBLIC_APP_ENV ??
  (process.env.NODE_ENV === "development" ? "development" : "production");
const API_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || environment === "development"
    ? resolveApiBaseUrl({
        platform: Platform.OS,
        appEnvironment: environment,
        configuredUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      })
    : undefined;
// A sleeping development Mac must not hold up the public, no-Mac fallback.
const LOOKUP_TIMEOUT_MS = /^http:\/\/(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(
  API_URL ?? "",
)
  ? 1_500
  : 8_000;

export class LookupNetworkError extends Error {
  constructor() {
    super("lookup_network_error");
    this.name = "LookupNetworkError";
  }
}

export async function requestProductLookup(
  gtin: Gtin,
  language: Language,
  signal?: AbortSignal,
): Promise<ProductLookupResult> {
  if (!API_URL || signal?.aborted) throw new LookupNetworkError();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await streamingFetch(`${API_URL}${productLookupPath}`, {
        method: productLookupMethod,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ gtin, language }),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
      });
    } catch {
      throw new LookupNetworkError();
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(response, 1_000_000);
    } catch {
      return { status: "provider_unavailable", gtin, retryable: true };
    }
    return parseLookupHttpResponse(response.status, payload, gtin);
  } catch (error) {
    if (error instanceof LookupNetworkError) throw error;
    throw new LookupNetworkError();
  } finally {
    signal?.removeEventListener("abort", abort);
    clearTimeout(timeout);
  }
}
