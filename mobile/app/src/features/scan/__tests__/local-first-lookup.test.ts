import { describe, expect, it, vi } from "vitest";
import { GtinSchema } from "@kierratysappi/domain";
import { ProductLookupResultSchema } from "@kierratysappi/contracts/lookup-schema";
import { offlineCatalogue } from "../../local-vision/catalogue";
import { bundledBarcodeLookup, createLocalFirstLookup } from "../local-first-lookup";
const gtin = GtinSchema.parse("3017620422003"),
  missing = GtinSchema.parse("6410405196811");
describe("local-first standalone barcode flow", () => {
  it("uses the existing five-product catalogue without network or image-model work", async () => {
    const online = vi.fn(async () => {
      throw Error("offline");
    });
    const result = await createLocalFirstLookup(offlineCatalogue, online)(gtin, "fi");
    expect(online).not.toHaveBeenCalled();
    expect(result.status).toBe("packaging_missing");
    expect(ProductLookupResultSchema.safeParse(result).success).toBe(true);
    if (result.status !== "packaging_missing") throw Error("result");
    expect(result.product.name?.value).toBe("Nutella");
    expect(result.product.packagingComponents).toEqual([]);
    expect(result.product.name?.provenance.verificationStatus).toBe("community");
  });
  it("preserves canonical aliases and does not invent an absent code", () => {
    expect(bundledBarcodeLookup(offlineCatalogue, GtinSchema.parse("03017620422003"))?.status).toBe(
      "packaging_missing",
    );
    expect(bundledBarcodeLookup(offlineCatalogue, missing)).toBeNull();
    expect(bundledBarcodeLookup(null, gtin)).toBeNull();
  });
  it("calls online for an absent code and keeps its genuine404", async () => {
    const online = vi.fn(async () => ({ status: "not_found" as const, gtin: missing }));
    const fallback = vi.fn();
    expect(
      await createLocalFirstLookup(offlineCatalogue, online, fallback)(missing, "en"),
    ).toMatchObject({ status: "not_found" });
    expect(online).toHaveBeenCalledWith(missing, "en");
    expect(fallback).not.toHaveBeenCalled();
  });
  it("tries the public reader only for transport failure and preserves pending recovery if both fail", async () => {
    const error = new Error("controlled_transport");
    const online = vi.fn(async () => {
      throw error;
    });
    const fallback = vi.fn(async () => ({ status: "not_found" as const, gtin: missing }));
    expect(
      await createLocalFirstLookup(offlineCatalogue, online, fallback)(missing, "fi"),
    ).toMatchObject({ status: "not_found" });
    expect(fallback).toHaveBeenCalledOnce();
    await expect(
      createLocalFirstLookup(null, online, async () => {
        throw Error("offline");
      })(missing, "fi"),
    ).rejects.toBe(error);
  });
});
