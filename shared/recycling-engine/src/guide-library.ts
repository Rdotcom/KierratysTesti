import { z } from "zod";
const plain = z
  .string()
  .min(1)
  .max(24000)
  .refine((v) => !/(?![\n\t])[\p{Cc}\p{Cf}]/u.test(v));
const link = z
  .url()
  .max(1500)
  .refine((v) => {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "hsy.fi" || u.hostname.endsWith(".hsy.fi"))
    );
  });
export const GuideTranslationSchema = z
  .object({
    translationIncomplete: z.boolean().optional(),
    title: plain.max(240),
    aliases: z.array(plain.max(240)).max(100),
    instructions: z.string().max(24000),
    wasteTypes: z
      .array(
        z.object({
          id: z.string().max(100),
          title: plain.max(240),
          description: z.string().max(12000),
          url: link.optional(),
        }),
      )
      .max(20),
    receivers: z
      .array(
        z.object({
          id: z.string().max(100),
          title: plain.max(240),
          description: z.string().max(12000),
          url: link.optional(),
          isFree: z.boolean().optional(),
        }),
      )
      .max(30),
  })
  .strict();
export const GuideLibrarySchema = z
  .object({
    schema: z.literal("hsy-offline-guide-v1"),
    version: z.string().min(1).max(80),
    checkedAt: z.iso.date(),
    jurisdiction: z.literal("FI-HSY"),
    source: z
      .object({
        name: z.literal("HSY"),
        url: z.literal("https://www.hsy.fi/jateopas"),
        apiVersion: z.literal("1.0.4"),
        licence: z.literal("CC-BY-4.0"),
        licenceUrl: z.literal("https://creativecommons.org/licenses/by/4.0/"),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            fi: GuideTranslationSchema,
            en: GuideTranslationSchema,
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();
export type GuideTranslation = z.infer<typeof GuideTranslationSchema>;
export type GuideLibrary = z.infer<typeof GuideLibrarySchema>;
export type GuideLibraryItem = GuideLibrary["items"][number];
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fi-FI")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function searchGuideLibrary(
  library: GuideLibrary,
  query: unknown,
): { items: GuideLibraryItem[]; exact: boolean } {
  if (typeof query !== "string" || query.length > 80 || /[\p{Cc}\p{Cf}]/u.test(query))
    return { items: [], exact: false };
  const q = normalize(query);
  if (!q) return { items: [], exact: false };
  const names = (i: GuideLibraryItem) =>
    [i.fi.title, ...i.fi.aliases, i.en.title, ...i.en.aliases].map(normalize);
  const exact = library.items.filter((i) => names(i).includes(q));
  if (exact.length) return { items: exact.slice(0, 8), exact: exact.length === 1 };
  return {
    items:
      q.length < 3
        ? []
        : library.items.filter((i) => names(i).some((n) => n.includes(q))).slice(0, 8),
    exact: false,
  };
}
