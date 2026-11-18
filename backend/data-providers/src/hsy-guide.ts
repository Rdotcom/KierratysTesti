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
    .replace(/<\s*(?:br\s*\/?|\/p|\/li|\/div|\/h[1-6])\s*>/gi, "\n")
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

  let prev: string;
  do {
    prev = out;
    out = out
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<[^>]{0,2000}>/g, "");
  } while (out !== prev);

  return out
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
