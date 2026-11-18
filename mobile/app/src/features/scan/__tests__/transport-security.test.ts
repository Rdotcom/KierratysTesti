import { afterEach, describe, expect, it, vi } from "vitest";
import { GtinSchema } from "@kierratysappi/domain";
const fetcher = vi.hoisted(() => vi.fn<typeof fetch>());
vi.mock("expo/fetch", () => ({ fetch: fetcher }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
const gtin = GtinSchema.parse("3017620422003");
afterEach(() => {
  vi.unstubAllEnvs();
  fetcher.mockReset();
  vi.resetModules();
});
async function client() {
  vi.stubEnv("EXPO_PUBLIC_APP_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "http://127.0.0.1:3000");
  return import("../api");
}
describe("product transport security", () => {
  it("rejects redirects/ambient cookies and preserves validated GTIN binding", async () => {
    const api = await client();
    fetcher.mockResolvedValue(Response.json({ status: "not_found", gtin }, { status: 404 }));
    expect(await api.requestProductLookup(gtin, "fi")).toEqual({ status: "not_found", gtin });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit", redirect: "error" });
  });
  it("fails closed before reading a declared overlarge response", async () => {
    const api = await client();
    fetcher.mockResolvedValue(new Response("{}", { headers: { "content-length": "1000001" } }));
    expect(await api.requestProductLookup(gtin, "fi")).toMatchObject({
      status: "provider_unavailable",
    });
  });
  it("propagates cancellation and makes no request for an already cancelled call", async () => {
    const api = await client(),
      controller = new AbortController();
    fetcher.mockImplementation(
      async (_url, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener("abort", () => reject(Error("cancelled")), {
            once: true,
          }),
        ),
    );
    const pending = api.requestProductLookup(gtin, "fi", controller.signal);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(api.LookupNetworkError);
    fetcher.mockClear();
    await expect(api.requestProductLookup(gtin, "fi", controller.signal)).rejects.toBeInstanceOf(
      api.LookupNetworkError,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("has no silent loopback HTTP fallback in an unconfigured production bundle", async () => {
    vi.stubEnv("EXPO_PUBLIC_APP_ENV", "production");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "");
    const api = await import("../api");
    await expect(api.requestProductLookup(gtin, "fi")).rejects.toBeInstanceOf(
      api.LookupNetworkError,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
