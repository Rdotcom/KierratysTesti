import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ProductLookupResultSchema,
  type ProductLookupResult,
} from "@kierratysappi/contracts/lookup-schema";
import type { Gtin, Language } from "@kierratysappi/domain";
import { withRecyclingStorageLock } from "../overview/storage";
const key = "@kierratysappi/offline-lookup-cache/v1",
  ttl = 30 * 86400000,
  limit = 100,
  maxBytes = 1_000_000;
type Entry = { gtin: string; language: Language; savedAt: number; result: ProductLookupResult };
async function read(now: number): Promise<Entry[]> {
  try {
    const text = await AsyncStorage.getItem(key);
    if (!text || text.length > maxBytes) return [];
    const raw: unknown = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, limit).flatMap((e: unknown) => {
      if (
        !e ||
        typeof e !== "object" ||
        !("gtin" in e) ||
        !("language" in e) ||
        !("savedAt" in e) ||
        !("result" in e)
      )
        return [];
      if (
        typeof e.gtin !== "string" ||
        (e.language !== "fi" && e.language !== "en") ||
        typeof e.savedAt !== "number" ||
        !Number.isFinite(e.savedAt) ||
        e.savedAt > now ||
        now - e.savedAt > ttl
      )
        return [];
      const result = ProductLookupResultSchema.safeParse(e.result);
      if (
        !result.success ||
        (result.data.status !== "resolved" && result.data.status !== "packaging_missing") ||
        result.data.gtin.padStart(14, "0") !== e.gtin
      )
        return [];
      return [{ gtin: e.gtin, language: e.language, savedAt: e.savedAt, result: result.data }];
    });
  } catch {
    return [];
  }
}
export async function cachedLookup(
  gtin: Gtin,
  language: Language,
  now = Date.now(),
): Promise<ProductLookupResult | null> {
  return withRecyclingStorageLock(async () => {
    const found = (await read(now)).find(
      (e) => e.gtin === gtin.padStart(14, "0") && e.language === language,
    );
    if (
      !found ||
      (found.result.status !== "resolved" && found.result.status !== "packaging_missing")
    )
      return null;
    return { ...found.result, cache: { ...found.result.cache, hit: true } };
  });
}
export async function cacheLookup(
  result: ProductLookupResult,
  language: Language,
  now = Date.now(),
): Promise<void> {
  if (result.status !== "resolved" && result.status !== "packaging_missing") return;
  if (JSON.stringify(result).length > 50000) return;
  await withRecyclingStorageLock(async () => {
    const gtin = result.gtin.padStart(14, "0"),
      old = await read(now),
      entries = [
        { gtin, language, savedAt: now, result },
        ...old.filter((e) => e.gtin !== gtin || e.language !== language),
      ].slice(0, limit);
    while (JSON.stringify(entries).length > maxBytes) entries.pop();
    await AsyncStorage.setItem(key, JSON.stringify(entries));
  });
}
