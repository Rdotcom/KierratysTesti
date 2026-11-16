import { describe, expect, it } from "vitest";
import data from "../data/municipalities-2026.json";
import {
  municipalitySelection,
  resolveSortingMunicipality,
  searchMunicipalities,
} from "../sorting-region";
describe("offline municipal boundary and waste-region selection", () => {
  it("pins all308official2026municipalities and the attributed, quantized dataset", () => {
    expect(data.municipalities).toHaveLength(308);
    expect(data.source.license).toBe("CC-BY-4.0");
    expect(data.source.sourceSha256).toBe(
      "06f01c77e411137447d9ddb13b3b50aebc3e1c21db7163c2ce8f988e68ae27ab",
    );
  });
  it.each([
    [60.24, 24.92, "Helsinki", "hsy"],
    [65.06, 25.52, "Oulu", "kiertokaari"],
    [60.4518, 22.2666, "Turku", "lsjh"],
  ])(
    "resolves actual %s/%s containment rather than nearest collection point",
    (latitude, longitude, name, regionId) => {
      expect(resolveSortingMunicipality({ latitude, longitude, accuracy: 20 })).toMatchObject({
        status: "known",
        selection: { municipalityName: name, regionId },
      });
    },
  );
  it("refuses a narrow municipality's uncertain border instead of guessing HSY", () => {
    expect(
      resolveSortingMunicipality({ latitude: 60.212, longitude: 24.728, accuracy: 30 }).status,
    ).not.toBe("known");
    expect(municipalitySelection("235")).toMatchObject({
      municipalityName: "Kauniainen",
      regionId: "hsy",
    });
  });
  it.each([
    [60.1699, 24.9384, "Helsinki"],
    [65.0121, 25.4651, "Oulu"],
  ])(
    "requires confirmation near coastal geometry, without lowering the1500mguard",
    (latitude, longitude, municipalityName) => {
      expect(resolveSortingMunicipality({ latitude, longitude, accuracy: 20 })).toMatchObject({
        status: "boundary",
        suggestion: { municipalityName },
      });
    },
  );
  it("does not make unsupported Tampere into HSY or LSJH", () => {
    expect(municipalitySelection("837")).toMatchObject({
      municipalityName: "Tampere",
      regionId: "unsupported",
    });
    expect(municipalitySelection("999")).toBeUndefined();
  });
  it.each([
    null,
    {},
    { latitude: 0, longitude: 0, accuracy: 10 },
    { latitude: 60.17, longitude: 24.94, accuracy: null },
    { latitude: NaN, longitude: 24.94, accuracy: 0 },
    { latitude: 60.17, longitude: 24.94, accuracy: 10001 },
  ])("fails safely for unavailable/outside/invalid position %#", (input) =>
    expect(resolveSortingMunicipality(input).status).toBe("unknown"),
  );
  it("supports bounded Finnish/accentless town selection with no coordinate output", () => {
    expect(searchMunicipalities("Helsinki")[0]).toMatchObject({
      municipalityCode: "091",
      regionId: "hsy",
    });
    expect(searchMunicipalities("kemionsaari")[0]?.regionId).toBe("lsjh");
    expect(searchMunicipalities("ou").map((m) => m.municipalityName)).toEqual([
      "Oulainen",
      "Oulu",
      "Outokumpu",
    ]);
    expect(searchMunicipalities("h")).toEqual([]);
    expect(searchMunicipalities("he\u202E")).toEqual([]);
    expect(searchMunicipalities("x".repeat(81))).toEqual([]);
    expect(searchMunicipalities("Oulu")[0]).not.toHaveProperty("coordinates");
  });
});
