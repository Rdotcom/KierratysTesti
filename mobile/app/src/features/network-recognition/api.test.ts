import {
  networkConsentVersion,
  networkModelId,
  networkSuggestionMediaType,
  objectKinds,
  suggestionObservationFromScores,
} from "@kierratysappi/contracts/network-recognition";
import { encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import { describe, expect, it, vi } from "vitest";
import { createNetworkRecognitionClient, type NetworkFetch, networkOrigin } from "./api";

const jpeg = encodePhotoBase64(
  new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42,
    255, 217,
  ]),
);
const result = {
  status: "observed",
  observation: suggestionObservationFromScores(
    objectKinds.map((kind) => ({ kind, similarity: kind === "spoon" ? 0.2 : 0 })),
    "2026-11-17T12:00:00.000Z",
  ),
};
const signal = () => new AbortController().signal;
describe("Expo Go explicit own-server transport", () => {
  it("allows only credential-free origins and production HTTPS", () => {
    for (const value of [
      "http://user:password@host",
      "https://host/path",
      "https://host?key=secret",
      "https://host#secret",
      "file:///tmp/test",
      "garbage",
    ])
      expect(networkOrigin(value, true)).toBeUndefined();
    expect(networkOrigin("http://localhost:3004", false)).toBeUndefined();
    expect(networkOrigin("http://localhost:3004", true)).toBe("http://localhost:3004");
    expect(networkOrigin("https://example.com", false)).toBe("https://example.com");
  });
  it("never sends without explicit consent, origin, valid image or after cancellation", async () => {
    const fetcher = vi.fn<NetworkFetch>();
    const client = createNetworkRecognitionClient("http://localhost:3004", fetcher);
    expect(await client.recognize(jpeg, false, signal())).toMatchObject({ reason: "cancelled" });
    expect(await client.recognize("invalid", true, signal())).toMatchObject({
      reason: "invalid_image",
    });
    const controller = new AbortController();
    controller.abort();
    expect(await client.recognize(jpeg, true, controller.signal)).toMatchObject({
      reason: "cancelled",
    });
    expect(
      await createNetworkRecognitionClient(undefined, fetcher).recognize(jpeg, true, signal()),
    ).toMatchObject({ reason: "disabled" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only sanitized JPEG and versioned consent, accepts server provenance", async () => {
    const fetcher = vi.fn<NetworkFetch>().mockResolvedValue(Response.json(result)),
      client = createNetworkRecognitionClient("http://localhost:3004", fetcher);
    expect(await client.recognize(jpeg, true, signal())).toEqual(result);
    const [url, options] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:3004/v1/recycling/object-image");
    expect(options?.headers).toMatchObject({ Accept: networkSuggestionMediaType });
    expect(JSON.parse(String(options?.body))).toEqual({
      jpegBase64: jpeg,
      consentVersion: networkConsentVersion,
    });
    expect(result.observation.source.modelId).toBe(networkModelId);
  });
  it.each([
    Response.json({ ...result, secret: "unexpected" }),
    new Response("x".repeat(8193)),
    new Response("not JSON"),
  ])("fails closed on malformed or oversized responses", async (response) => {
    const client = createNetworkRecognitionClient(
      "http://localhost:3004",
      vi.fn<NetworkFetch>().mockResolvedValue(response),
    );
    expect(await client.recognize(jpeg, true, signal())).toMatchObject({
      reason: "invalid_response",
    });
  });
  it("maps offline/rate/invalid-image errors with no retry or paid fallback", async () => {
    for (const [status, reason] of [
      [429, "rate_limited"],
      [400, "invalid_image"],
      [413, "invalid_image"],
    ] as const) {
      const fetcher = vi.fn<NetworkFetch>().mockResolvedValue(new Response("", { status }));
      expect(
        await createNetworkRecognitionClient("http://localhost:3004", fetcher).recognize(
          jpeg,
          true,
          signal(),
        ),
      ).toMatchObject({ reason });
      expect(fetcher).toHaveBeenCalledOnce();
    }
    const fetcher = vi.fn<NetworkFetch>().mockRejectedValue(Error("network"));
    expect(
      await createNetworkRecognitionClient("http://localhost:3004", fetcher).recognize(
        jpeg,
        true,
        signal(),
      ),
    ).toMatchObject({ reason: "offline" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not invent a confident suggestion from a legacy response without display metadata", async () => {
    const legacy = {
      ...result,
      observation: {
        focus: result.observation.focus,
        candidates: result.observation.candidates.slice(0, 3),
        source: result.observation.source,
      },
    };
    const fetcher = vi.fn<NetworkFetch>().mockResolvedValue(Response.json(legacy));
    expect(
      await createNetworkRecognitionClient("http://localhost:3004", fetcher).recognize(
        jpeg,
        true,
        signal(),
      ),
    ).toMatchObject({ reason: "invalid_response" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
