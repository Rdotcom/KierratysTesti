import { PhotoEstimateSchema, photoModel } from "@kierratysappi/contracts/photo-recognition";
import { describe, expect, it } from "vitest";
import {
  canUsePhotoCapture,
  canUseLocalPhotoCapture,
  choosePhotoSize,
  sortConfirmedPhotoPart,
} from "../sorting";

const confirmation = (material: "glass" | "paper" = "glass", conditionsConfirmed = true) => ({
  material,
  conditionsConfirmed,
});

function example(shape = "jar", material = "glass") {
  return PhotoEstimateSchema.parse({
    status: "estimated",
    observation: {
      status: "clear",
      confidence: "medium",
      risk: "ordinary_packaging",
      label: { fi: "Esimerkkipurkki", en: "Example jar" },
      parts: [
        {
          label: { fi: "Purkki", en: "Jar" },
          packagingStatus: "packaging",
          material,
          shape,
        },
      ],
    },
    source: {
      id: "openai-vision",
      model: photoModel,
      version: "photo-observation-v1",
      observedAt: "2026-10-15T12:00:00.000Z",
      verificationStatus: "inferred",
    },
  });
}
describe("photo confirmation", () => {
  it("uses installed Android local capability without enabling cloud or Expo Go", () => {
    const runtime = { executionEnvironment: "bare", platform: { android: {} } };
    expect(canUseLocalPhotoCapture("android", runtime, true)).toBe(true);
    expect(canUseLocalPhotoCapture("android", runtime, false)).toBe(false);
    expect(canUsePhotoCapture("android", runtime)).toBe(false);
    for (const executionEnvironment of ["storeClient", "unknown", undefined])
      expect(canUseLocalPhotoCapture("android", { ...runtime, executionEnvironment }, true)).toBe(
        false,
      );
    expect(
      canUseLocalPhotoCapture(
        "ios",
        { executionEnvironment: "bare", platform: { ios: { buildNumber: "20" } } },
        true,
      ),
    ).toBe(true);
    expect(
      canUseLocalPhotoCapture("ios", { executionEnvironment: "bare", platform: { ios: {} } }, true),
    ).toBe(false);
  });
  it("requires a new purpose-matched native build but not a web/native simulator claim", () => {
    expect(canUsePhotoCapture("web", {})).toBe(true);
    for (const buildNumber of ["1", null, undefined, "2.0", "invalid", "9007199254740992"])
      expect(
        canUsePhotoCapture("ios", {
          executionEnvironment: "bare",
          platform: { ios: { buildNumber } },
        }),
      ).toBe(false);
    expect(canUsePhotoCapture("ios", { executionEnvironment: "bare" })).toBe(false);
    for (const executionEnvironment of ["bare", "standalone"])
      expect(
        canUsePhotoCapture("ios", {
          executionEnvironment,
          platform: { ios: { buildNumber: "2" } },
        }),
      ).toBe(true);
    expect(
      canUsePhotoCapture("android", {
        executionEnvironment: "bare",
        platform: { android: { versionCode: 2 } },
      }),
    ).toBe(true);
    for (const executionEnvironment of ["storeClient", undefined, "unknown"])
      expect(
        canUsePhotoCapture("ios", {
          executionEnvironment,
          platform: { ios: { buildNumber: "200" } },
        }),
      ).toBe(false);
  });
  it("uses the current native constants shape, not removed or mutable manifest build fields", () => {
    // Current iOS EXConstantsService exports only platform.ios.buildNumber.
    const runtime = {
      executionEnvironment: "bare",
      platform: { ios: { buildNumber: "2" } },
      expoConfig: { ios: { buildNumber: "1" } },
    };
    expect(canUsePhotoCapture("ios", runtime)).toBe(true);
    const staleBinary = {
      ...runtime,
      platform: { ios: { buildNumber: "1" } },
      expoConfig: { ios: { buildNumber: "2" } },
    };
    expect(canUsePhotoCapture("ios", staleBinary)).toBe(false);
    // The installed Android constants adapter currently exports no versionCode.
    // Do not trust a JS manifest version as evidence of updated native purpose.
    expect(
      canUsePhotoCapture("android", {
        executionEnvironment: "bare",
        platform: { android: {} },
      }),
    ).toBe(false);
  });
  it("accepts patched iOS client 4 only from its installed native build metadata", () => {
    const runtime = {
      executionEnvironment: "bare",
      platform: { ios: { buildNumber: "4" } },
      expoConfig: { ios: { buildNumber: "3" } },
    };
    expect(canUsePhotoCapture("ios", runtime)).toBe(true);
    const missingNativeBuild = {
      ...runtime,
      platform: { ios: {} },
      expoConfig: { ios: { buildNumber: "4" } },
    };
    expect(canUsePhotoCapture("ios", missingNativeBuild)).toBe(false);
  });
  it("does not issue guidance from an unconfirmed or unrelated part", () => {
    const estimate = example();
    const part = estimate.observation.parts[0];
    if (!part) throw new Error("fixture");
    expect(
      sortConfirmedPhotoPart(
        estimate,
        part,
        confirmation("glass", false),
        "fi",
        estimate.source.observedAt,
      ),
    ).toBeUndefined();
    expect(
      sortConfirmedPhotoPart(
        estimate,
        { ...part },
        confirmation(),
        "fi",
        estimate.source.observedAt,
      ),
    ).toBeUndefined();
  });
  it("uses the versioned rule engine after an explicit local confirmation and retains provenance", () => {
    const estimate = example();
    const part = estimate.observation.parts[0];
    if (!part) throw new Error("fixture");
    const result = sortConfirmedPhotoPart(
      estimate,
      part,
      confirmation(),
      "fi",
      estimate.source.observedAt,
    );
    expect(result?.status).toBe("resolved");
    if (result?.status === "resolved") {
      expect(result.destination.id).toBe("glass_packaging");
      expect(result.rule).toMatchObject({ jurisdiction: "FI", verificationStatus: "verified" });
      expect(result.rule.version).toBeTruthy();
      expect(result.rule.checkedAt).toBeTruthy();
      expect(result.confidence.tier).not.toBe("verified");
    }
  });
  it("never infers deposit eligibility for bottles", () => {
    const estimate = example("bottle");
    const part = estimate.observation.parts[0];
    if (!part) throw new Error("fixture");
    expect(
      sortConfirmedPhotoPart(estimate, part, confirmation(), "en", estimate.source.observedAt)
        ?.status,
    ).toBe("ambiguous");
  });
  it("uses the existing carton rule for paper packaging only after explicit confirmation", () => {
    const estimate = example("other", "paper");
    const part = estimate.observation.parts[0];
    if (!part) throw new Error("fixture");
    expect(
      sortConfirmedPhotoPart(
        estimate,
        part,
        confirmation("paper", false),
        "fi",
        estimate.source.observedAt,
      ),
    ).toBeUndefined();
    const result = sortConfirmedPhotoPart(
      estimate,
      part,
      confirmation("paper"),
      "fi",
      estimate.source.observedAt,
    );
    expect(result?.status).toBe("resolved");
    if (result?.status === "resolved") {
      expect(result.destination.id).toBe("carton_packaging");
      expect(result.rule).toMatchObject({
        id: "fi.packaging.carton",
        jurisdiction: "FI",
        verificationStatus: "verified",
        checkedAt: "2026-08-10",
      });
      expect(result.rule.sourceUrl).toContain("rinkiin.fi/");
      expect(result.rule.version).toBeTruthy();
      expect(result.confidence.tier).not.toBe("verified");
      expect(result.explanation.fi).toContain("paperipakkaus");
    }
  });
  it("does not provide ordinary collection guidance for risky or uncertain estimates", () => {
    const estimate = example();
    const part = estimate.observation.parts[0];
    if (!part) throw new Error("fixture");
    for (const changes of [
      { risk: "special_waste" as const },
      { risk: "unknown" as const },
      { confidence: "low" as const },
      { status: "uncertain" as const },
    ])
      expect(
        sortConfirmedPhotoPart(
          { ...estimate, observation: { ...estimate.observation, ...changes } },
          part,
          confirmation(),
          "fi",
          estimate.source.observedAt,
        ),
      ).toBeUndefined();
  });
  it("corrects the recorded Nutella plastic-jar error independently of the inferred identity", () => {
    // Replay the observed wrong material, not a fresh model response or a brand-specific rule.
    const estimate = example("jar", "plastic");
    estimate.observation.label = {
      fi: "Nutella-hasselpähkinälevite",
      en: "Nutella hazelnut spread",
    };
    const part = estimate.observation.parts[0];
    if (!part) throw new Error("fixture");
    part.label = { fi: "muovipurkki", en: "plastic jar" };
    const original = structuredClone(estimate);
    const result = sortConfirmedPhotoPart(
      estimate,
      part,
      confirmation("glass"),
      "fi",
      estimate.source.observedAt,
    );
    expect(result?.status).toBe("resolved");
    if (result?.status === "resolved") {
      expect(result.destination.id).toBe("glass_packaging");
      expect(result.rule).toMatchObject({
        id: "fi.packaging.glass",
        jurisdiction: "FI",
        checkedAt: "2026-08-10",
        verificationStatus: "verified",
      });
      expect(result.confidence.tier).not.toBe("verified");
    }
    expect(estimate).toEqual(original);
    expect(estimate.source.verificationStatus).toBe("inferred");
  });
  it("gives no guidance for an absent, unknown or unsupported independent material choice", () => {
    const estimate = example("jar", "plastic");
    const part = estimate.observation.parts[0];
    if (!part) throw new Error("fixture");
    for (const material of [undefined, "unknown", "wood", "composite", "other", "invalid"])
      expect(
        sortConfirmedPhotoPart(
          estimate,
          part,
          { material, conditionsConfirmed: true } as Parameters<typeof sortConfirmedPhotoPart>[2],
          "fi",
          estimate.source.observedAt,
        ),
      ).toBeUndefined();
  });
  it("a manual material choice cannot bypass unsafe, unknown, low-confidence or non-packaging input", () => {
    for (const material of ["unknown", "composite", "wood", "other"]) {
      const estimate = example("jar", material);
      const part = estimate.observation.parts[0];
      if (!part) throw new Error("fixture");
      expect(
        sortConfirmedPhotoPart(estimate, part, confirmation(), "fi", estimate.source.observedAt),
      ).toBeUndefined();
    }
    for (const packagingStatus of ["non_packaging", "unknown"] as const) {
      const estimate = example();
      const part = estimate.observation.parts[0];
      if (!part) throw new Error("fixture");
      part.packagingStatus = packagingStatus;
      expect(
        sortConfirmedPhotoPart(estimate, part, confirmation(), "fi", estimate.source.observedAt),
      ).toBeUndefined();
    }
  });
  it("chooses a bounded camera size and ignores malformed or excessive sizes", () => {
    expect(choosePhotoSize(["invalid", "4000x3000", "1920x1080", "1280x960", "640x480"])).toBe(
      "1280x960",
    );
    expect(choosePhotoSize(["0x0", "huge", "10000x10000"])).toBeUndefined();
  });
});
