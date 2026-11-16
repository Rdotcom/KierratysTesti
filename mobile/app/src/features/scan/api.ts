import {
  productLookupPath,
  productLookupMethod,
  type ProductLookupResult,
} from "@kierratysappi/contracts/lookup-schema";
import type { Gtin, Language } from "@kierratysappi/domain";
import { Platform } from "react-native";
import { resolveApiBaseUrl } from "./api-config";
import { parseLookupHttpResponse } from "./lookup-response";

const API_URL = resolveApiBaseUrl({
  platform: Platform.OS,
  appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
  configuredUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});
// A sleeping development Mac must not hold up the public, no-Mac fallback.
const LOOKUP_TIMEOUT_MS = /^http:\/\/(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(API_URL)
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
): Promise<ProductLookupResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${productLookupPath}`, {
        method: productLookupMethod,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ gtin, language }),
        signal: controller.signal,
      });
    } catch {
      throw new LookupNetworkError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { status: "provider_unavailable", gtin, retryable: true };
    }
    return parseLookupHttpResponse(response.status, payload, gtin);
  } catch (error) {
    if (error instanceof LookupNetworkError) throw error;
    throw new LookupNetworkError();
  } finally {
    clearTimeout(timeout);
  }
}
