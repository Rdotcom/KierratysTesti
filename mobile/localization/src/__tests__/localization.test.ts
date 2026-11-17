import { describe, expect, it } from "vitest";
import { localizedText, messages, translate } from "../index";

describe("localization", () => {
  it("keeps own-server consent and uncertain suggestions explicit in both languages", () => {
    for (const language of ["fi", "en"] as const) {
      for (const key of [
        "networkTitle",
        "networkConsent",
        "networkHttpNotice",
        "networkSend",
        "networkUnavailable",
        "networkCandidateSource",
      ] as const)
        expect(translate(language, key)).not.toBe(key);
      expect(translate(language, "networkIntro")).toContain("SigLIP2");
    }
    expect(translate("fi", "networkConsent")).toContain("muistissa");
    expect(translate("en", "networkConsent")).toContain("memory");
    expect(translate("en", "networkHttpNotice")).toContain("not encrypted");
  });
  it("uses the owner-selected Home shortcut heading in Finnish and English", () => {
    expect(translate("fi", "homeMaterials")).toBe("Suositut haut");
    expect(translate("en", "homeMaterials")).toBe("Popular searches");
  });

  it("makes photo recipients, retention, inference and exhausted-credit recovery explicit in both languages", () => {
    for (const language of ["fi", "en"] as const) {
      expect(translate(language, "photoPrivacy")).toContain("OpenAI");
      expect(translate(language, "photoPrivacy")).toContain("30");
      expect(translate(language, "photoEstimate")).toBeTruthy();
      expect(translate(language, "photoQuota")).toBeTruthy();
      expect(translate(language, "photoConfirmBody")).toBeTruthy();
    }
  });
  it("keeps Finnish and English key sets in parity", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fi).sort());
  });

  it("contains no empty interface messages", () => {
    for (const language of ["fi", "en"] as const) {
      for (const value of Object.values(messages[language])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("uses KeepItGreen consistently in both languages and privacy/deletion copy", () => {
    for (const language of ["fi", "en"] as const) {
      expect(translate(language, "appName")).toBe("KeepItGreen");
      for (const key of [
        "privacyInformation",
        "deleteLocalDataBody",
        "localDataDeleted",
      ] as const) {
        expect(translate(language, key)).toContain("KeepItGreen");
      }
      expect(Object.values(messages[language]).join(" ")).not.toContain("KierrätysAppi");
    }
  });

  it("selects typed interface and domain text", () => {
    expect(translate("fi", "cameraAction")).toBe("Avaa kamera");
    expect(localizedText("en", { fi: "Lasi", en: "Glass" })).toBe("Glass");
  });

  it("uses explicit local-history and unsent-feedback action copy in both languages", () => {
    expect(translate("fi", "disableHistory")).toBe("Lopeta tallennus ja tyhjennä historia");
    expect(translate("en", "disableHistory")).toBe("Stop saving and clear history");
    expect(translate("fi", "draftNotSent")).toBe("Palautetta ei ole lähetetty.");
    expect(translate("en", "draftNotSent")).toBe("Feedback has not been sent.");
  });

  it("removes blanket reassurance while retaining contextual disclosures and uncertainty", () => {
    for (const language of ["fi", "en"] as const) {
      expect(messages[language]).not.toHaveProperty("privacySummary");
      expect(messages[language]).not.toHaveProperty("loadingDetail");
      expect(translate(language, "cameraPurpose")).toContain("Open Facts");
      expect(translate(language, "nearbyPrivacy")).toContain("OpenStreetMap");
      expect(translate(language, "privacyInformation")).toContain("Open Food Facts");
      expect(messages[language]).not.toHaveProperty("legalReview");
      expect(messages[language]).not.toHaveProperty("termsDraft");
      expect(translate(language, "privacyInformation")).not.toMatch(/JURIDISTA|LEGAL REVIEW/);
    }
    expect(translate("fi", "materialCodeRecognizedBody")).toContain("pelkkä koodi ei kerro");
    expect(translate("en", "materialCodeRecognizedBody")).toContain("code alone does not tell");
  });
});
