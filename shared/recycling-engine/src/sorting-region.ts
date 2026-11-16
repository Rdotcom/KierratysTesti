import { z } from "zod";
import snapshot from "./data/municipalities-2026.json";

export const sortingRegionIds = ["hsy", "lsjh", "kiertokaari", "unsupported"] as const;
export type SortingRegionId = (typeof sortingRegionIds)[number];
export const sortingRegionNames: Record<SortingRegionId, string> = {
  hsy: "HSY",
  lsjh: "Lounais-Suomen Jätehuolto",
  kiertokaari: "Kiertokaari",
  unsupported: "—",
};
const operators: Record<Exclude<SortingRegionId, "unsupported">, readonly string[]> = {
  hsy: ["Espoo", "Helsinki", "Vantaa", "Kauniainen", "Kirkkonummi"],
  lsjh: [
    "Aura",
    "Kaarina",
    "Kemiönsaari",
    "Lieto",
    "Marttila",
    "Masku",
    "Mynämäki",
    "Naantali",
    "Nousiainen",
    "Paimio",
    "Parainen",
    "Pöytyä",
    "Raisio",
    "Rusko",
    "Salo",
    "Sauvo",
    "Turku",
    "Uusikaupunki",
  ],
  kiertokaari: [
    "Hailuoto",
    "Ii",
    "Kempele",
    "Lumijoki",
    "Oulu",
    "Pudasjärvi",
    "Raahe",
    "Siikajoki",
    "Simo",
  ],
};
export const sortingRegionSource = snapshot.source;
export type MunicipalitySelection = {
  municipalityCode: string;
  municipalityName: string;
  regionId: SortingRegionId;
  regionName: string;
};
export function municipalitySelection(code: string): MunicipalitySelection | undefined {
  const m = snapshot.municipalities.find((candidate) => candidate.code === code);
  if (!m) return undefined;
  const regionId = (Object.entries(operators).find(([, names]) => names.includes(m.name))?.[0] ??
    "unsupported") as SortingRegionId;
  return {
    municipalityCode: m.code,
    municipalityName: m.name,
    regionId,
    regionName: sortingRegionNames[regionId],
  };
}
const comparable = (s: string) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLocaleLowerCase("fi-FI");
export function searchMunicipalities(query: string): MunicipalitySelection[] {
  if (typeof query !== "string" || query.length > 80 || /[\p{Cc}\p{Cf}]/u.test(query)) return [];
  const q = comparable(query);
  if (q.length < 2) return [];
  return snapshot.municipalities
    .filter((m) => comparable(m.name).startsWith(q))
    .sort((a, b) => a.name.localeCompare(b.name, "fi"))
    .slice(0, 5)
    .flatMap((m) => {
      const selected = municipalitySelection(m.code);
      return selected ? [selected] : [];
    });
}
function insideRing(longitude: number, latitude: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (!a || !b) continue;
    const [ax = 0, ay = 0] = a,
      [bx = 0, by = 0] = b;
    if (
      ay > latitude !== by > latitude &&
      longitude < ((bx - ax) * (latitude - ay)) / (by - ay) + ax
    )
      inside = !inside;
  }
  return inside;
}
function distanceToRing(longitude: number, latitude: number, ring: number[][]): number {
  const xScale = Math.cos((latitude * Math.PI) / 180) * 111320,
    yScale = 111320;
  let min = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i];
    if (!a || !b) continue;
    const ax = ((a[0] ?? 0) - longitude) * xScale,
      ay = ((a[1] ?? 0) - latitude) * yScale;
    const bx = ((b[0] ?? 0) - longitude) * xScale,
      by = ((b[1] ?? 0) - latitude) * yScale;
    const dx = bx - ax,
      dy = by - ay,
      length = dx * dx + dy * dy;
    const t = length ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / length)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}
const fixSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(10000),
});
export type MunicipalityResolution =
  | { status: "known"; selection: MunicipalitySelection }
  | { status: "boundary"; suggestion?: MunicipalitySelection }
  | { status: "unknown" };

/** Offline polygon containment, never nearest-centroid guessing or reverse geocoding.
 * Coarse source boundaries + GPS uncertainty refuse automatic border decisions. */
export function resolveSortingMunicipality(input: unknown): MunicipalityResolution {
  const parsed = fixSchema.safeParse(input);
  if (!parsed.success) return { status: "unknown" };
  const { latitude, longitude, accuracy } = parsed.data;
  const matches: { code: string; boundary: number }[] = [];
  for (const m of snapshot.municipalities) {
    for (const polygon of m.polygons) {
      const outer = polygon[0];
      if (
        !outer ||
        !insideRing(longitude, latitude, outer) ||
        polygon.slice(1).some((ring) => insideRing(longitude, latitude, ring))
      )
        continue;
      matches.push({
        code: m.code,
        boundary: Math.min(...polygon.map((ring) => distanceToRing(longitude, latitude, ring))),
      });
      break;
    }
  }
  if (matches.length !== 1) return { status: matches.length ? "boundary" : "unknown" };
  const hit = matches[0];
  if (!hit) return { status: "unknown" };
  const selection = municipalitySelection(hit.code);
  if (hit.boundary <= accuracy + snapshot.source.boundaryUncertaintyMeters)
    return { status: "boundary", ...(selection ? { suggestion: selection } : {}) };
  return selection ? { status: "known", selection } : { status: "unknown" };
}
