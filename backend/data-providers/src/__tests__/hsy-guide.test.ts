import { describe, it, expect } from "vitest";
import { hsyPlainText, normalizeHsyPage } from "../hsy-guide";
describe("HSY untrusted content boundary", () => {
  it("removes executable markup and control/bidi characters, keeps original text", () => {
    expect(
      hsyPlainText("<p>Hello&nbsp;&amp; safe</p><script>bad()</script><p>Line&#32;two\u202e</p>"),
    ).toBe("Hello & safe\nLine two");
  });
  it("rejects oversized/schema-invalid content", () => {
    expect(() => normalizeHsyPage({ hits: [{ id: "x" }], totalCount: 1 })).toThrow();
    expect(() => normalizeHsyPage({ hits: [], totalCount: 2001 })).toThrow();
  });
  it("does not invent translated names or follow untrusted receiver links", () => {
    const r = normalizeHsyPage({
      totalCount: 1,
      hits: [
        {
          id: "1",
          title: "Fixture",
          notes: null,
          wasteTypes: [{ id: "w", title: null }],
          recyclingMethods: [
            {
              id: "r",
              title: "Collection",
              infoPageUrl: "https://evil.example/test",
              description: "Text",
            },
          ],
        },
      ],
    });
    expect(r.items[0]).toMatchObject({
      translationIncomplete: true,
      wasteTypes: [],
      receivers: [{ title: "Collection" }],
    });
    expect(r.items[0]?.receivers[0]).not.toHaveProperty("url");
  });
});
