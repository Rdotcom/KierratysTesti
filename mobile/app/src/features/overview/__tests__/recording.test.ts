import { parseMaterialIdentificationCode } from "@kierratysappi/domain";
import { describe, expect, it } from "vitest";
import { sortRecognizedMaterialCode } from "../../material-code/sorting";
import { recordableMaterial, recordingMaterialFromAnswer, recyclingIntent } from "../recording";

function guidance(code: string) {
  const recognition = parseMaterialIdentificationCode(code);
  if (recognition.status !== "recognized") throw new Error("unrecognized fixture code");
  return {
    recognition,
    sorting: sortRecognizedMaterialCode({
      recognition,
      language: "en",
      observedAt: "2026-10-30T12:00:00.000Z",
    }),
  };
}

describe("recording a confirmed packaging part", () => {
  it("uses only an explicit supported material answer, never a destination or object guess", () => {
    expect(recordingMaterialFromAnswer("material", "metal")).toBe("metal");
    expect(recordingMaterialFromAnswer("material", "ceramic")).toBeUndefined();
    expect(recordingMaterialFromAnswer("use", "metal")).toBeUndefined();
    expect(recordingMaterialFromAnswer("region", "hsy")).toBeUndefined();
    expect(recordingMaterialFromAnswer("material", "spoon")).toBeUndefined();
  });
  it("preserves paper as a material even when its sorting destination collects carton", () => {
    const { recognition, sorting } = guidance("PAP 22");
    expect(sorting).toMatchObject({ status: "resolved", destination: { id: "carton_packaging" } });
    expect(recognition.materialFamily).toBe("paper");
    expect(recordableMaterial(sorting, recognition.materialFamily)).toBe("paper");
  });

  it("keeps ambiguous or unsupported results and missing materials out of result recording", () => {
    const glass = guidance("GL 70");
    const composite = guidance("C/PAP 84");
    const plastic = guidance("PP 5");
    expect(glass.sorting.status).toBe("ambiguous");
    expect(composite.sorting.status).toBe("unknown");
    expect(recordableMaterial(glass.sorting, "glass")).toBeUndefined();
    expect(recordableMaterial(composite.sorting, "composite")).toBeUndefined();
    expect(recordableMaterial(plastic.sorting, undefined)).toBeUndefined();
    expect(recordableMaterial(plastic.sorting, "unknown")).toBeUndefined();
    expect(recordableMaterial(plastic.sorting, "plastic")).toBe("plastic");
  });

  it("keeps retries and route revisits idempotent but permits another lookup of the same product", () => {
    const firstLookup = { gtin: "3017620422003" };
    const secondLookup = { gtin: "3017620422003" };
    const firstPart = recyclingIntent(firstLookup, "jar");
    expect(recyclingIntent(firstLookup, "jar")).toBe(firstPart);
    expect(recyclingIntent(firstLookup, "lid")).not.toBe(firstPart);
    expect(recyclingIntent(secondLookup, "jar")).not.toBe(firstPart);
  });

  it("does not create a new recording intent when a photo part's material is corrected", () => {
    const estimate = {};
    const id = recyclingIntent(estimate, "0");
    expect(recyclingIntent(estimate, "0")).toBe(id);
    expect(recyclingIntent({}, "0")).not.toBe(id);
  });
});
