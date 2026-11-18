import { Writable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BuildAppOptions, buildApp, type LookupService } from "../app";

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function create(extra: Partial<BuildAppOptions> = {}) {
  const lookup = vi.fn<LookupService["lookup"]>(async (input) => ({
    status: "not_found" as const,
    gtin: input.gtin,
  }));
  const app = await buildApp({ lookupService: { lookup }, ...extra });
  apps.push(app);
  return { app, lookup };
}
const url = "/v1/recycling/lookup";
const payload = { gtin: "3017620422003", language: "fi" };
describe("adversarial API trust boundaries", () => {
  it("cancels provider work after the uploaded request's client disconnects", async () => {
    let aborted = false;
    const lookup = vi.fn<LookupService["lookup"]>(
      async (input, signal) =>
        new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve({ status: "not_found", gtin: input.gtin });
            },
            { once: true },
          );
        }),
    );
    const { app } = await create({ lookupService: { lookup } });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    const pending = fetch(address + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => undefined);
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledOnce());
    controller.abort();
    await pending;
    await vi.waitFor(() => expect(aborted).toBe(true));
    expect(app.server.maxConnections).toBe(128);
  });
  it("rejects cross-site and null origins before lookup or inference, not just CORS reading", async () => {
    const recognize = vi.fn();
    const { app, lookup } = await create({
      allowedWebOrigins: ["https://app.example.test"],
      objectImageRecognizer: { recognize },
    });
    for (const origin of [
      "https://attacker.example",
      "null",
      "https://app.example.test.attacker.test",
    ]) {
      expect(
        (await app.inject({ method: "POST", url, payload, headers: { origin } })).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/recycling/object-image",
            payload,
            headers: { origin },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload,
          headers: { origin: "https://app.example.test" },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(404);
  });
  it("rejects DNS-rebinding Host names on the local recognition service", async () => {
    const { app, lookup } = await create({ localOnly: true });
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload,
          headers: { host: "attacker.example:3004" },
        })
      ).statusCode,
    ).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload,
          headers: { host: "192.168.1.8:3004", "x-forwarded-host": "attacker.example" },
        })
      ).statusCode,
    ).toBe(404);
  });
  it("keeps body, thrown error text, URL query and spoofed request IDs out of logs", async () => {
    const logs: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        logs.push(String(chunk));
        done();
      },
    });
    const { app } = await create({
      logger: { level: "info", stream },
      lookupService: {
        lookup: async () => {
          throw Error("PRIVATE_ERROR_FIXTURE");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `${url}?private=PRIVATE_QUERY_FIXTURE`,
      payload,
      headers: { "x-request-id": "PRIVATE_ID_FIXTURE" },
    });
    expect(response.statusCode).toBe(500);
    expect(logs.join(" ")).toContain("Unhandled request error");
    expect(logs.join(" ")).not.toMatch(/PRIVATE_|3017620422003|Error:|stack|request.body/u);
    expect(response.body).not.toMatch(/PRIVATE_|3017620422003/u);
  });
  it("rejects prototype/constructor pollution at JSON parsing and leaves globals unchanged", async () => {
    const { app, lookup } = await create();
    for (const field of ["__proto__", "constructor"]) {
      const body = `{"gtin":"3017620422003","${field}":{"polluted":true}}`;
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            headers: { "content-type": "application/json" },
            payload: body,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect({}).not.toHaveProperty("polluted");
  });
  it("does not let untrusted forwarded IPs reset request quotas", async () => {
    const { app } = await create();
    for (let index = 0; index < 20; index++)
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            payload,
            headers: { "x-forwarded-for": `192.0.2.${index}` },
          })
        ).statusCode,
      ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload,
          headers: { "x-forwarded-for": "198.51.100.5" },
        })
      ).statusCode,
    ).toBe(429);
    expect(app.server.requestTimeout).toBe(20_000);
    expect(app.server.keepAliveTimeout).toBe(5_000);
  });
});
