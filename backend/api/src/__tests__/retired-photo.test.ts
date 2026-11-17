import type { ObjectImageRecognizer } from "@kierratysappi/data-providers/siglip-recognition";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { parseEnvironment } from "../config";

describe("retired paid image recognition", () => {
  it("cannot be enabled through stale development configuration", () => {
    const config = parseEnvironment({
      NODE_ENV: "development",
      PHOTO_AI_ENABLED: "true",
      OPENAI_API_KEY: "fixture-not-a-real-key",
    });
    expect(config).not.toHaveProperty("PHOTO_AI_ENABLED");
    expect(config).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("removes both legacy endpoints without invoking a recognizer or product lookup", async () => {
    const recognize = vi.fn<ObjectImageRecognizer["recognize"]>();
    const lookup = vi.fn().mockResolvedValue({ status: "not_found", gtin: "3017620422003" });
    const app = await buildApp({ lookupService: { lookup }, objectImageRecognizer: { recognize } });
    try {
      for (const url of ["/v1/recycling/photo", "/v1/recycling/photo-capabilities"]) {
        expect((await app.inject({ url })).statusCode).toBe(404);
        expect(
          (await app.inject({ method: "POST", url, payload: { jpegBase64: "not-an-upload" } }))
            .statusCode,
        ).toBe(404);
      }
      expect(recognize).not.toHaveBeenCalled();
      expect(lookup).not.toHaveBeenCalled();
      const capabilities = await app.inject({ url: "/v1/recycling/object-image-capabilities" });
      expect(capabilities.json()).toMatchObject({
        enabled: true,
        execution: "server",
        retention: "memory-only",
      });
      const openapi = (await app.inject({ url: "/v1/openapi.json" })).json();
      expect(Object.keys(openapi.paths)).not.toContain("/v1/recycling/photo");
      expect(Object.keys(openapi.paths)).not.toContain("/v1/recycling/photo-capabilities");
    } finally {
      await app.close();
    }
  });
});
