import { describe, it, expect } from "vitest";
import { GuideLibrarySchema, searchGuideLibrary } from "../guide-library";
const translation = {
  title: "Synthetic item",
  aliases: ["test object"],
  instructions: "Source fixture",
  wasteTypes: [],
  receivers: [],
};
const library = GuideLibrarySchema.parse({
  schema: "hsy-offline-guide-v1",
  version: "fixture",
  checkedAt: "2026-11-16",
  jurisdiction: "FI-HSY",
  source: {
    name: "HSY",
    url: "https://www.hsy.fi/jateopas",
    apiVersion: "1.0.4",
    licence: "CC-BY-4.0",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  },
  items: [{ id: "1", fi: translation, en: translation }],
});
describe("offline guide contract/search", () => {
  it("selects exact named source or explicit bounded partial choices, never guesses a bin", () => {
    expect(searchGuideLibrary(library, "test object")).toMatchObject({
      exact: true,
      items: [{ id: "1" }],
    });
    expect(searchGuideLibrary(library, "synthetic").exact).toBe(false);
    expect(searchGuideLibrary(library, "xyz").items).toEqual([]);
  });
  it.each([null, "x".repeat(81), "test\u202e", "<script>"])(
    "safe unknown for untrusted input %#",
    (q) => expect(searchGuideLibrary(library, q).items).toEqual([]),
  );
  it("does not accept unsafe URLs or a false national jurisdiction", () => {
    expect(GuideLibrarySchema.safeParse({ ...library, jurisdiction: "FI" }).success).toBe(false);
    expect(
      GuideLibrarySchema.safeParse({
        ...library,
        items: [
          {
            id: "x",
            fi: {
              ...translation,
              receivers: [
                { id: "1", title: "Fixture", description: "Text", url: "javascript:alert(1)" },
              ],
            },
            en: translation,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
