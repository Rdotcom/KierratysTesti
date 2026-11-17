import { afterEach, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { parseSiglipWebOrigins } from "../siglip-config";
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it("admits exact loopback web origins, never wildcard or embedded credentials", () => {
  expect(parseSiglipWebOrigins(undefined)).toEqual([
    "http://localhost:8097",
    "http://127.0.0.1:8097",
  ]);
  for (const input of [
    "*",
    "https://*.example.com",
    "https://name:secret@example.com",
    "https://example.com/path",
    "https://example.com?private=value",
    "https://example.com#fragment",
    "",
  ])
    expect(() => parseSiglipWebOrigins(input)).toThrow();
});
it("CORS permits actual browser JSON preflight without opening arbitrary web origins", async () => {
  const app = await buildApp({
    allowedWebOrigins: parseSiglipWebOrigins(undefined),
    lookupService: { lookup: async (input) => ({ status: "not_found", gtin: input.gtin }) },
  });
  apps.push(app);
  for (const origin of [
    "http://localhost:8097",
    "http://127.0.0.1:8097",
    "https://attacker.invalid",
  ]) {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/recycling/object-image",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(response.headers["access-control-allow-origin"]).toBe(
      origin.includes("attacker") ? undefined : origin,
    );
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  }
});
