import { z } from "zod";
// Provider-only normalization. Mobile never consumes HSY response shapes.
const text = z.string().max(48000).nullable().optional();
const receiver = z.object({
  id: z.string().min(1).max(100),
  title: text,
  description: text,
  infoPageUrl: text,
  informationPageUrl: text,
  isFree: z.boolean().optional(),
});
export const HsyPageSchema = z.object({
  hits: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        title: z.string().min(1).max(500),
        synonyms: z.array(z.string().max(500)).max(100).nullable().optional(),
        notes: text,
        additionalInfo: text,
        wasteTypes: z.array(receiver).max(20),
        recyclingMethods: z.array(receiver).max(30),
      }),
    )
    .max(100),
  totalCount: z.number().int().min(0).max(2000),
});
export function hsyPlainText(value: string | null | undefined): string {
  if (!value) return "";
  let out = value
    .replace(
      /&(?:nbsp|amp|quot|apos|lt|gt);/g,
      (v) =>
        ({ "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" })[
          v
        ] ?? "",
    )
    .replace(/&#(x[\da-f]+|\d+);/gi, (_all, n: string) => {
      const point = n[0]?.toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return Number.isSafeInteger(point) && point >= 32 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : " ";
    });
  let plainText = "";
  let hiddenElement: "script" | "style" | null = null;
  for (let index = 0; index < out.length; ) {
    const tagStart = out.indexOf("<", index);
    if (tagStart < 0) {
      if (!hiddenElement) plainText += out.slice(index);
      break;
    }
    if (!hiddenElement) plainText += out.slice(index, tagStart);
    const tagEnd = out.indexOf(">", tagStart + 1);
    if (tagEnd < 0) break;
    const tag = out.slice(tagStart + 1, tagEnd).trim();
    if (tag.startsWith("!--")) {
      const commentEnd = out.indexOf("-->", tagStart + 1);
      index = commentEnd >= 0 ? commentEnd + 3 : out.length;
      continue;
    }
    const closingMatch = /^\/\s*([a-z][\w:-]*)/i.exec(tag);
    const openingMatch = !closingMatch ? /^([a-z][\w:-]*)/i.exec(tag) : null;
    const tagName = (closingMatch?.[1] ?? openingMatch?.[1])?.toLowerCase();
    if (hiddenElement) {
      if (closingMatch && tagName === hiddenElement) hiddenElement = null;
    } else if (tagName === "script" || tagName === "style") {
      if (!closingMatch) hiddenElement = tagName;
    } else if (
      tagName === "br" ||
      (closingMatch &&
        (tagName === "p" ||
          tagName === "li" ||
          tagName === "div" ||
          (tagName !== undefined && /^h[1-6]$/.test(tagName))))
    ) {
      plainText += "\n";
    }
    index = tagEnd + 1;
  }
  return plainText
    .replace(/[<>]/g, "")
    .replace(/(?![\n\t])[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function sourceUrl(value: string | null | undefined) {
  try {
    if (!value) return undefined;
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "hsy.fi" || u.hostname.endsWith(".hsy.fi"))
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function normalizeHsyPage(raw: unknown) {
  const page = HsyPageSchema.parse(raw);
  return {
    totalCount: page.totalCount,
    items: page.hits.map((row) => ({
      id: row.id,
      title: hsyPlainText(row.title),
      aliases: (row.synonyms ?? []).map(hsyPlainText).filter(Boolean),
      instructions: [hsyPlainText(row.notes), hsyPlainText(row.additionalInfo)]
        .filter(Boolean)
        .join("\n\n"),
      translationIncomplete: [...row.wasteTypes, ...row.recyclingMethods].some(
        (r) => !hsyPlainText(r.title),
      ),
      wasteTypes: row.wasteTypes
        .filter((r) => hsyPlainText(r.title))
        .map((r) => ({
          id: r.id,
          title: hsyPlainText(r.title),
          description: hsyPlainText(r.description),
          ...(sourceUrl(r.informationPageUrl ?? r.infoPageUrl)
            ? { url: sourceUrl(r.informationPageUrl ?? r.infoPageUrl) }
            : {}),
        })),
      receivers: row.recyclingMethods
        .filter((r) => hsyPlainText(r.title))
        .map((r) => ({
          id: r.id,
          title: hsyPlainText(r.title),
          description: hsyPlainText(r.description),
          ...(sourceUrl(r.infoPageUrl) ? { url: sourceUrl(r.infoPageUrl) } : {}),
          ...(r.isFree !== undefined ? { isFree: r.isFree } : {}),
        })),
    })),
  };
}
