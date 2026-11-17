import { GtinSchema } from "@kierratysappi/domain";
import { describe, expect, it, vi } from "vitest";
import { offlineCatalogue } from "../../local-vision/catalogue";
import { createRuntimeBarcodeLookup } from "../runtime-lookup";

const gtin = GtinSchema.parse("6410405196811");
const notFound = { status: "not_found" as const, gtin };
describe("runtime-specific barcode lookup", () => {
  it("Expo Go uses public identity directly, preserving language and no Mac request", async () => {
    const backend = vi.fn(async () => notFound),
      publicIdentity = vi.fn(async () => notFound);
    expect(
      await createRuntimeBarcodeLookup(null, "storeClient", backend, publicIdentity)(gtin, "en"),
    ).toEqual(notFound);
    expect(backend).not.toHaveBeenCalled();
    expect(publicIdentity).toHaveBeenCalledExactlyOnceWith(gtin, "en");
  });
  it("Expo Go does not repeat a failed public call or try a private backend", async () => {
    const error = Error("controlled_offline"),
      backend = vi.fn(async () => notFound),
      publicIdentity = vi.fn(async () => {
        throw error;
      });
    await expect(
      createRuntimeBarcodeLookup(null, "storeClient", backend, publicIdentity)(gtin, "fi"),
    ).rejects.toBe(error);
    expect(backend).not.toHaveBeenCalled();
    expect(publicIdentity).toHaveBeenCalledTimes(1);
  });
  it("preserves the bundled catalogue without network in Expo Go", async () => {
    const backend = vi.fn(async () => notFound),
      publicIdentity = vi.fn(async () => notFound);
    const result = await createRuntimeBarcodeLookup(
      offlineCatalogue,
      "storeClient",
      backend,
      publicIdentity,
    )(GtinSchema.parse("3017620422003"), "fi");
    expect(result.status).toBe("packaging_missing");
    expect(backend).not.toHaveBeenCalled();
    expect(publicIdentity).not.toHaveBeenCalled();
  });
  it.each(["bare", "standalone", undefined])(
    "preserves backend semantics in %s",
    async (runtime) => {
      const backend = vi.fn(async () => notFound),
        publicIdentity = vi.fn(async () => notFound);
      expect(
        await createRuntimeBarcodeLookup(null, runtime, backend, publicIdentity)(gtin, "fi"),
      ).toEqual(notFound);
      expect(backend).toHaveBeenCalledExactlyOnceWith(gtin, "fi");
      expect(publicIdentity).not.toHaveBeenCalled();
    },
  );
  it("normal native transport failure retains the public fallback", async () => {
    const backend = vi.fn(async () => {
        throw Error("controlled_transport");
      }),
      publicIdentity = vi.fn(async () => notFound);
    expect(
      await createRuntimeBarcodeLookup(null, "bare", backend, publicIdentity)(gtin, "en"),
    ).toEqual(notFound);
    expect(publicIdentity).toHaveBeenCalledExactlyOnceWith(gtin, "en");
  });
});
