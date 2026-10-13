import { describe, expect, it, vi } from "vitest";
import {
  geocodeNearbyInput,
  NEARBY_GEOCODE_INPUT_MAX_LENGTH,
  NearbyGeocodeIssue,
  prepareNearbyGeocodeQuery,
} from "../geocode-query";

describe("nearby geocoding query", () => {
  it("classifies exactly five digits as a Finnish postal code", () => {
    const query = prepareNearbyGeocodeQuery(" 00100 ");
    expect(query.kind).toBe("postal-code");
    expect(query.params.get("postalcode")).toBe("00100");
    expect(query.params.get("q")).toBeNull();
  });

  it("classifies other valid input as address", () => {
    const query = prepareNearbyGeocodeQuery("Esimerkkikatu 22");
    expect(query.kind).toBe("address");
    expect(query.params.get("q")).toBe("Esimerkkikatu 22");
    expect(query.params.get("postalcode")).toBeNull();
  });

  it("rejects empty and overlong input", () => {
    expect(() => prepareNearbyGeocodeQuery("   ")).toThrowError(NearbyGeocodeIssue);
    expect(() =>
      prepareNearbyGeocodeQuery("1".repeat(NEARBY_GEOCODE_INPUT_MAX_LENGTH + 1)),
    ).toThrow(/invalid-input/u);
  });

  it("builds expected Nominatim params and Finnish Accept-Language header", async () => {
    const fetcher = vi.fn(
      async (_input: string, _init: RequestInit) =>
        new Response(JSON.stringify([{ lat: "60.1", lon: "24.9" }])),
    );
    const result = await geocodeNearbyInput("Esimtie 22", {
      signal: new AbortController().signal,
      fetcher,
    });

    expect(result.kind).toBe("address");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("Expected a fetch call");
    const url = call[0];
    const init = call[1];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("countrycodes")).toBe("fi");
    expect(parsed.searchParams.get("format")).toBe("jsonv2");
    expect(parsed.searchParams.get("limit")).toBe("1");
    expect(parsed.searchParams.get("q")).toBe("Esimtie 22");
    expect(init).toBeDefined();
    expect(init?.headers).toMatchObject({ "Accept-Language": "fi-FI,fi" });
  });

  it("encodes non-ASCII address queries", async () => {
    const fetcher = vi.fn(
      async (_input: string, _init: RequestInit) =>
        new Response(JSON.stringify([{ lat: "60.2", lon: "24.8" }])),
    );
    await geocodeNearbyInput("Äänekoskentie 3", { signal: new AbortController().signal, fetcher });
    const call = fetcher.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("Expected a fetch call");
    const url = call[0];
    expect(url).toContain("%C3%84%C3%A4nekoskentie+3");
  });

  it("fails as no-result when provider returns an empty array", async () => {
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => new Response("[]"));
    await expect(
      geocodeNearbyInput("00100", { signal: new AbortController().signal, fetcher }),
    ).rejects.toMatchObject({ reason: "no-result" });
  });

  it("fails as service-failure on malformed payload and invalid coordinates", async () => {
    const malformed = vi.fn(async (_input: string, _init: RequestInit) => new Response("{}"));
    await expect(
      geocodeNearbyInput("Esimtie 22", {
        signal: new AbortController().signal,
        fetcher: malformed,
      }),
    ).rejects.toMatchObject({ reason: "service-failure" });

    const invalidCoordinates = vi.fn(
      async (_input: string, _init: RequestInit) =>
        new Response(JSON.stringify([{ lat: "1000", lon: "20" }])),
    );
    await expect(
      geocodeNearbyInput("Esimtie 22", {
        signal: new AbortController().signal,
        fetcher: invalidCoordinates,
      }),
    ).rejects.toMatchObject({ reason: "service-failure" });
  });

  it("fails as service-failure on HTTP errors", async () => {
    const fetcher = vi.fn(
      async (_input: string, _init: RequestInit) => new Response("[]", { status: 503 }),
    );
    await expect(
      geocodeNearbyInput("00100", { signal: new AbortController().signal, fetcher }),
    ).rejects.toMatchObject({ reason: "service-failure" });
  });

  it("returns cancelled when request is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => new Response("[]"));
    await expect(
      geocodeNearbyInput("00100", { signal: controller.signal, fetcher }),
    ).rejects.toMatchObject({ reason: "cancelled" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps fetch abort errors to cancelled", async () => {
    const fetcher = vi.fn(async (_input: string, _init: RequestInit) => {
      throw { name: "AbortError" };
    });
    await expect(
      geocodeNearbyInput("00100", { signal: new AbortController().signal, fetcher }),
    ).rejects.toMatchObject({ reason: "cancelled" });
  });
});
