import { describe, it, expect } from "vitest";
import { GtinSchema } from "@kierratysappi/domain";
import data from "../../../../assets/data/off-finland-barcodes.json";
import { createBarcodeLibraryLookup } from "../barcode-library";
describe("real offline barcode library", () => {
  it("contains199valid independent source identities, not just image-model references", () => {
    const lookup = createBarcodeLibraryLookup(data);
    expect(lookup.count).toBe(199);
    for (const row of data.products) {
      const result = lookup.lookup(GtinSchema.parse(row.gtin), "en");
      expect(result).toMatchObject({
        status: "packaging_missing",
        cache: { hit: true },
        product: { packagingComponents: [] },
      });
    }
  });
  it("supports canonical GTIN aliases and rejects absent/corrupt source", () => {
    const row = data.products[0];
    if (!row) throw Error("fixture");
    const lookup = createBarcodeLibraryLookup(data);
    expect(lookup.lookup(GtinSchema.parse(row.gtin.padStart(14, "0")), "fi")?.status).toBe(
      "packaging_missing",
    );
    expect(lookup.lookup(GtinSchema.parse("6410405196811"), "fi")).toBeNull();
    expect(createBarcodeLibraryLookup({}).count).toBe(0);
  });
});
