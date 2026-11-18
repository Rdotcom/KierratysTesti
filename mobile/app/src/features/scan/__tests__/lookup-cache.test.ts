import { beforeEach, describe, expect, it, vi } from "vitest";
import { GtinSchema } from "@kierratysappi/domain";
import { normalizePublicIdentity } from "../public-identity-lookup";
import { cacheLookup, cachedLookup } from "../lookup-cache";
import { localDataGeneration, invalidateLocalDataWork } from "../../security/local-data-generation";
const store = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  },
}));
const gtin = GtinSchema.parse("3017620422003"),
  now = Date.parse("2026-11-16T20:00:00Z"),
  make = () =>
    normalizePublicIdentity(
      { product: { code: gtin, product_name: "Synthetic fixture" } },
      gtin,
      "en",
      new Date(now).toISOString(),
    );
beforeEach(() => store.clear());
describe("bounded local product cache", () => {
  it("does not resurrect cached product data when a pre-deletion request finishes late", async () => {
    const generation = localDataGeneration();
    invalidateLocalDataWork();
    await cacheLookup(make(), "en", now, generation);
    expect(store.size).toBe(0);
    await cacheLookup(make(), "en", now, localDataGeneration());
    expect(await cachedLookup(gtin, "en", now)).not.toBeNull();
  });
  it("works offline, binds GTIN and language, and does not infer packaging", async () => {
    await cacheLookup(make(), "en", now);
    expect(await cachedLookup(gtin, "en", now + 1)).toMatchObject({
      status: "packaging_missing",
      cache: { hit: true },
      product: { packagingComponents: [] },
    });
    expect(await cachedLookup(gtin, "fi", now + 1)).toBeNull();
    expect(await cachedLookup(GtinSchema.parse("6410405196811"), "en", now + 1)).toBeNull();
  });
  it("expires after30days without refreshing on cache read", async () => {
    await cacheLookup(make(), "en", now);
    expect(await cachedLookup(gtin, "en", now + 31 * 86400000)).toBeNull();
    expect(await cachedLookup(gtin, "en", now - 1)).toBeNull();
  });
  it("does not persist failed lookups and ignores malformed/oversized source", async () => {
    await cacheLookup({ status: "not_found", gtin }, "en", now);
    expect(store.size).toBe(0);
    for (const raw of [
      "{",
      "null",
      "x".repeat(1000001),
      JSON.stringify([{ gtin, language: "en", savedAt: now, result: { status: "fake" } }]),
    ]) {
      store.set("@kierratysappi/offline-lookup-cache/v1", raw);
      expect(await cachedLookup(gtin, "en", now)).toBeNull();
    }
  });
  it("keeps at most100results and evicts the oldest, never the latest", async () => {
    const code = (n: number) => {
      const body = String(900000000000 + n);
      const sum = [...body].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
      return GtinSchema.parse(`${body}${(10 - (sum % 10)) % 10}`);
    };
    for (let n = 0; n < 101; n++) {
      const gtin = code(n);
      await cacheLookup(
        normalizePublicIdentity(
          { product: { code: gtin, product_name: "QA synthetic" } },
          gtin,
          "en",
          new Date(now).toISOString(),
        ),
        "en",
        now + n,
      );
    }
    expect(JSON.parse(store.get("@kierratysappi/offline-lookup-cache/v1") ?? "[]")).toHaveLength(
      100,
    );
    expect(await cachedLookup(code(0), "en", now + 102)).toBeNull();
    expect(await cachedLookup(code(100), "en", now + 102)).toMatchObject({
      status: "packaging_missing",
    });
  });
});
