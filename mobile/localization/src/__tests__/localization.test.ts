import { describe, expect, it } from "vitest";
import { localizedText, messages, translate } from "../index";

describe("localization", () => {
  it("keeps shared recognition controls neutral about execution and translates transport-only details", () => {
    for (const language of ["fi", "en"] as const) {
      for (const key of [
        "recognitionAction",
        "recognitionDetails",
        "recognitionSendTitle",
        "recognitionMarkingManual",
      ] as const)
        expect(translate(language, key)).not.toBe(key);
      const common = [
        "networkTitle",
        "recognitionAction",
        "homeIdentifyDetail",
        "identifyPhotoDetail",
      ] as const;
      expect(common.map((key) => translate(language, key)).join(" ")).not.toMatch(
        /laitteessa|offline|on.device|palvelin|server/iu,
      );
    }
    expect(translate("fi", "recognitionMarkingManual")).toContain("vain erikseen asennetussa");
    expect(translate("en", "recognitionMarkingManual")).toContain(
      "only in the separately installed",
    );
  });
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
      expect(translate(language, "networkCandidateSource")).toContain("SigLIP2");
    }
    expect(translate("fi", "networkConsent")).toContain("muistissa");
    expect(translate("en", "networkConsent")).toContain("memory");
    expect(translate("en", "networkHttpNotice")).toContain("not encrypted");
  });
  it("aligns recognition wording with native while preserving server execution and explicit sending", () => {
    for (const language of ["fi", "en"] as const) {
      expect(translate(language, "localVisionTitle")).toContain(
        translate(language, "networkTitle"),
      );
      expect(translate(language, "networkRetake")).toBe(translate(language, "localVisionAgain"));
      expect(translate(language, "networkIntro")).not.toContain("SigLIP2");
      const executionKeys = [
        "networkTitle",
        "networkIntro",
        "networkSend",
        "networkDetail",
      ] as const;
      const executionCopy = executionKeys.map((key) => translate(language, key)).join(" ");
      expect(executionCopy).not.toMatch(/laitteessa|ilman verkkoyhteyttä|on.device|offline/iu);
    }
    expect(translate("fi", "networkIntro")).toContain("palvelintasi");
    expect(translate("fi", "networkIntro")).toContain("verkkoyhteyden");
    expect(translate("fi", "networkIntro")).toContain("materiaali itse");
    expect(translate("en", "networkIntro")).toContain("your own server");
    expect(translate("en", "networkIntro")).toContain("network connection");
    expect(translate("en", "networkIntro")).toContain("material yourself");
    expect(translate("fi", "networkSend")).toBe("Lähetä kuva ja tunnista");
    expect(translate("en", "networkSend")).toBe("Send photo and identify");
    expect(translate("fi", "networkConsent")).toContain("muistissa");
    expect(translate("en", "networkConsent")).toContain("not saved to a file");
  });
  it("keeps concise recipient and retention copy without the removed camera and server reminders", () => {
    expect(translate("fi", "networkConsent")).toBe(
      "Kuva lähetetään tunnistuspalvelimelle. Se käsitellään muistissa, eikä sitä tallenneta tiedostoon tai välitetä muihin palveluihin.",
    );
    expect(translate("en", "networkConsent")).toBe(
      "Your photo is sent to the recognition server. It is processed in memory, not saved to a file or forwarded to other services.",
    );
  });
  it("uses the owner-selected Home shortcut heading in Finnish and English", () => {
    expect(translate("fi", "homeMaterials")).toBe("Suositut haut");
    expect(translate("en", "homeMaterials")).toBe("Popular searches");
  });

  it("removes retired paid-provider actions and disclosures in both languages", () => {
    for (const language of ["fi", "en"] as const) {
      for (const key of [
        "photoPrivacy",
        "photoQuota",
        "photoSend",
        "localVisionCloud",
        "localVisionCloudHint",
        "localVisionCloudCost",
      ])
        expect(messages[language]).not.toHaveProperty(key);
      expect(Object.values(messages[language]).join(" ")).not.toMatch(/OpenAI/u);
      expect(translate(language, "networkConsent")).toBeTruthy();
      expect(translate(language, "localVisionPrivacy")).toBeTruthy();
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
