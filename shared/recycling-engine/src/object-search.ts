import type { LocalizedText } from "@kierratysappi/domain";
import type { SortableObjectKind } from "./object-sorting";
export type GuideItem = {
  id: string;
  label: LocalizedText;
  kind: SortableObjectKind;
  aliases: readonly string[];
};
const item = (
  id: string,
  kind: SortableObjectKind,
  fi: string,
  en: string,
  aliases: readonly string[] = [],
): GuideItem => ({
  id,
  kind,
  label: { fi, en },
  aliases: [fi, en, ...aliases],
});
// Editorial, bounded search index to sourced policy, not an invented universal database.
export const guideItems: readonly GuideItem[] = [
  item("remote", "remote", "Kaukosäädin", "Remote control", ["kaukosaadin", "remote"]),
  item("phone", "phone", "Puhelin", "Phone", [
    "älypuhelin",
    "matkapuhelin",
    "kännykkä",
    "smartphone",
  ]),
  item("computer", "electronics", "Tietokone", "Computer", [
    "läppäri",
    "kannettava tietokone",
    "laptop",
  ]),
  item("charger", "electronics", "Laturi", "Charger", ["puhelimen laturi", "adapteri", "adapter"]),
  item("toaster", "electronics", "Leivänpaahdin", "Toaster"),
  item("coffee-maker", "electronics", "Kahvinkeitin", "Coffee maker"),
  item("hairdryer", "electronics", "Hiustenkuivain", "Hair dryer", ["fööni"]),
  item("electric-toothbrush", "electronics", "Sähköhammasharja", "Electric toothbrush"),
  item("television", "electronics", "Televisio", "Television", ["tv", "telkkari"]),
  item("headphones", "electronics", "Kuulokkeet", "Headphones", ["nappikuulokkeet", "earphones"]),
  item("kettle", "electronics", "Vedenkeitin", "Electric kettle"),
  item("vacuum", "electronics", "Pölynimuri", "Vacuum cleaner", ["imuri"]),
  item("battery", "battery", "Paristo tai akku", "Battery", [
    "paristo",
    "akku",
    "nappiparisto",
    "pienakku",
    "paristot",
    "akut",
  ]),
  item("spoon", "spoon", "Lusikka", "Spoon", ["teelusikka", "ruokalusikka"]),
  item("fork", "fork", "Haarukka", "Fork"),
  item("knife", "knife", "Veitsi", "Knife", ["ruokailuveitsi"]),
  item("cup", "cup", "Muki tai kuppi", "Mug or cup", [
    "muki",
    "kuppi",
    "kahvikuppi",
    "juomalasi",
    "keraaminen muki",
    "mug",
    "cup",
    "drinking glass",
  ]),
  item("bottle", "bottle", "Pullo", "Bottle", ["muovipullo", "lasipullo", "juomapullo"]),
  item("jar", "jar", "Purkki", "Jar", ["lasipurkki", "säilykepurkki"]),
  item("can", "can", "Tölkki", "Can", ["juomatölkki", "säilyketölkki"]),
  item("carton", "carton", "Kartonkipakkaus", "Carton", [
    "pahvi",
    "kartonki",
    "pahvilaatikko",
    "maitopurkki",
    "paperipussi",
    "cardboard",
  ]),
  item("bag", "bag", "Pussi tai kassi", "Bag", ["muovipussi", "muovikassi", "kangaskassi"]),
  item("textile", "textile", "Vaate tai kodintekstiili", "Clothing or household textile", [
    "tekstiili",
    "tekstiilit",
    "vaatteet",
    "vaate",
    "paita",
    "housut",
    "lakana",
    "pyyhe",
    "textile",
    "clothes",
  ]),
];
const normalize = (q: string) =>
  q
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fi-FI")
    .trim()
    .replace(/\s+/gu, " ");
export function searchGuideItems(query: unknown): { items: readonly GuideItem[]; exact: boolean } {
  if (typeof query !== "string" || query.length > 80 || /[\p{Cc}\p{Cf}]/u.test(query))
    return { items: [], exact: false };
  const q = normalize(query);
  if (!q) return { items: [], exact: false };
  const exact = guideItems.filter((entry) => entry.aliases.some((a) => normalize(a) === q));
  if (exact.length) return { items: exact.slice(0, 6), exact: exact.length === 1 };
  return {
    items:
      q.length < 3
        ? []
        : guideItems
            .filter((entry) => entry.aliases.some((a) => normalize(a).includes(q)))
            .slice(0, 6),
    exact: false,
  };
}
