import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import {
  NetworkCapabilitiesSchema,
  NetworkResultSchema,
  type NetworkResult,
  networkConsentVersion,
  networkRecognitionPath,
  networkCapabilitiesPath,
} from "@kierratysappi/contracts/network-recognition";

export function networkOrigin(value: unknown, development: boolean): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.hash || url.search || url.pathname !== "/")
      return undefined;
    if (url.protocol !== "https:" && !(development && url.protocol === "http:")) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body || Number(response.headers.get("content-length")) > 8192)
    throw Error("invalid_response");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 8192) throw Error("response_bound");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const all = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    all.set(chunk, position);
    position += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
export type NetworkFetch = (url: string, options?: RequestInit) => Promise<Response>;
export function createNetworkRecognitionClient(origin: string | undefined, fetcher: NetworkFetch) {
  const fail = (
    reason: Extract<NetworkResult, { status: "unavailable" }>["reason"],
  ): NetworkResult => ({ status: "unavailable", reason });
  return {
    async available(signal: AbortSignal): Promise<boolean> {
      if (!origin || signal.aborted) return false;
      try {
        const response = await fetcher(origin + networkCapabilitiesPath, {
          credentials: "omit",
          redirect: "error",
          signal,
          headers: { Accept: "application/json" },
        });
        return response.ok && NetworkCapabilitiesSchema.parse(await boundedJson(response)).enabled;
      } catch {
        return false;
      }
    },
    async recognize(jpeg: string, consented: boolean, signal: AbortSignal): Promise<NetworkResult> {
      if (!consented || signal.aborted) return fail("cancelled");
      if (!origin) return fail("disabled");
      let clean: string;
      try {
        clean = preparePhotoBase64(jpeg);
      } catch {
        return fail("invalid_image");
      }
      try {
        const response = await fetcher(origin + networkRecognitionPath, {
          credentials: "omit",
          redirect: "error",
          method: "POST",
          signal,
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ jpegBase64: clean, consentVersion: networkConsentVersion }),
        });
        if (response.status === 429) return fail("rate_limited");
        if (response.status === 400 || response.status === 413) return fail("invalid_image");
        let raw: unknown;
        try {
          raw = await boundedJson(response);
        } catch {
          return fail(signal.aborted ? "cancelled" : "invalid_response");
        }
        const parsed = NetworkResultSchema.safeParse(raw);
        if (!parsed.success || (parsed.data.status === "observed" && response.status !== 200))
          return fail("invalid_response");
        return parsed.data;
      } catch {
        return fail(signal.aborted ? "cancelled" : "offline");
      }
    },
  };
}
