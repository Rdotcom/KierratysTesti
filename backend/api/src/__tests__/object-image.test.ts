import { encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import {
  objectKinds,
  observationFromScores,
  networkConsentVersion,
  networkRecognitionPath as url,
  networkCapabilitiesPath,
} from "@kierratysappi/contracts/network-recognition";
import type { ObjectImageRecognizer } from "@kierratysappi/data-providers/siglip-recognition";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const jpeg = encodePhotoBase64(
  new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42,
    255, 217,
  ]),
);
const payload = { jpegBase64: jpeg, consentVersion: networkConsentVersion };
const observed = {
  status: "observed" as const,
  observation: observationFromScores(
    objectKinds.map((kind) => ({ kind, similarity: kind === "spoon" ? 0.2 : 0 })),
    "2026-11-17T12:00:00.000Z",
  ),
};
async function make(recognizer?: ObjectImageRecognizer) {
  const app = await buildApp({
    ...(recognizer ? { objectImageRecognizer: recognizer } : {}),
    lookupService: { lookup: async (input) => ({ status: "not_found", gtin: input.gtin }) },
  });
  apps.push(app);
  return app;
}
describe("self-hosted object image API", () => {
  it("cancels in-flight inference when the client disconnects", async () => {
    let cancelled = false;
    const recognize = vi.fn<ObjectImageRecognizer["recognize"]>(
      (_image, signal) =>
        new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              cancelled = true;
              resolve({ status: "unavailable", reason: "cancelled" });
            },
            { once: true },
          );
        }),
    );
    const app = await make({ recognize });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const controller = new AbortController();
    const request = fetch(address + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => undefined);
    await vi.waitFor(() => expect(recognize).toHaveBeenCalledOnce());
    controller.abort();
    await request;
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });
  it("is disabled by default until the own-server recognizer is configured", async () => {
    const app = await make();
    expect((await app.inject({ url: networkCapabilitiesPath })).json()).toMatchObject({
      enabled: false,
      retention: "memory-only",
      execution: "server",
    });
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(503);
  });
  it("rejects missing consent, URLs, malformed or oversized images before inference", async () => {
    const recognize = vi.fn<ObjectImageRecognizer["recognize"]>().mockResolvedValue(observed),
      app = await make({ recognize });
    for (const [index, body] of [
      { jpegBase64: jpeg },
      { ...payload, url: "http://localhost/private" },
      { ...payload, jpegBase64: "badimage" },
    ].entries())
      expect(
        (
          await app.inject({
            method: "POST",
            url,
            payload: body,
            remoteAddress: `192.0.2.${index + 1}`,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload: { ...payload, jpegBase64: "A".repeat(2_001_025) },
        })
      ).statusCode,
    ).toBe(413);
    expect(recognize).not.toHaveBeenCalled();
  });
  it("returns strict uncertain suggestions, no photos or cache", async () => {
    const recognize = vi.fn<ObjectImageRecognizer["recognize"]>().mockResolvedValue(observed),
      app = await make({ recognize });
    const response = await app.inject({ method: "POST", url, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(observed);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).not.toContain(jpeg);
    expect(recognize.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
  });
  it("rejects invalid provider output and thrown errors without exposing details", async () => {
    const app = await make({
      recognize: async () => {
        throw Error("PRIVATE_IMAGE_TEXT");
      },
    });
    const response = await app.inject({ method: "POST", url, payload });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("PRIVATE_IMAGE_TEXT");
    const bad = await make({
      recognize: async () =>
        ({
          ...observed,
          observation: {
            ...observed.observation,
            source: { ...observed.observation.source, confidence: "high" },
          },
        }) as unknown as Awaited<ReturnType<ObjectImageRecognizer["recognize"]>>,
    });
    expect((await bad.inject({ method: "POST", url, payload })).statusCode).toBe(503);
  });
  it("limits requests to four per minute", async () => {
    const recognize = vi.fn<ObjectImageRecognizer["recognize"]>().mockResolvedValue(observed),
      app = await make({ recognize });
    for (let i = 0; i < 4; i++)
      expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(429);
    expect(recognize).toHaveBeenCalledTimes(4);
  });
  it("never runs a second concurrent model request", async () => {
    let finish: ((result: typeof observed) => void) | undefined;
    const recognize = vi.fn<ObjectImageRecognizer["recognize"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const app = await make({ recognize });
    const first = app.inject({ method: "POST", url, payload });
    const running = first.then((response) => response);
    await vi.waitFor(() => expect(recognize).toHaveBeenCalledOnce());
    expect((await app.inject({ method: "POST", url, payload })).json()).toEqual({
      status: "unavailable",
      reason: "busy",
    });
    finish?.(observed);
    expect((await running).statusCode).toBe(200);
    expect(recognize).toHaveBeenCalledOnce();
  });
});
