import { GtinSchema } from "@kierratysappi/domain";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { withRecyclingStorageLock } from "../overview/storage";
import { invalidateLocalDataWork } from "../security/local-data-generation";

const HISTORY_ENABLED_KEY = "@kierratysappi/history-enabled/v1";
const HISTORY_KEY = "@kierratysappi/history/v1";
const PENDING_KEY = "@kierratysappi/pending-lookups/v1";
const FEEDBACK_KEY = "@kierratysappi/feedback-drafts/v1";
const APP_STORAGE_PREFIX = "@kierratysappi/";
const historySchema = z
  .object({
    gtin: GtinSchema,
    productName: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[^\p{Cc}\p{Cf}]*$/u)
      .optional(),
    resultStatus: z.enum(["resolved", "packaging_missing", "not_found"]),
    scannedAt: z.iso.datetime(),
  })
  .transform((value) => ({ ...value, productName: value.productName }));
const feedbackSchema = z.object({
  gtin: GtinSchema.optional(),
  category: z.enum(["wrong_product", "wrong_packaging", "wrong_sorting", "missing_data"]),
  note: z
    .string()
    .max(2000)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\r\n\t]/gu, ""))),
  createdAt: z.iso.datetime(),
});

export type HistoryEntry = {
  readonly gtin: string;
  readonly productName: string | undefined;
  readonly resultStatus: "resolved" | "packaging_missing" | "not_found";
  readonly scannedAt: string;
};

export type FeedbackDraft = {
  readonly gtin: string | undefined;
  readonly category: string;
  readonly note: string;
  readonly createdAt: string;
};

export async function isHistoryEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(HISTORY_ENABLED_KEY)) === "true";
}

export async function setHistoryEnabled(enabled: boolean): Promise<void> {
  await withRecyclingStorageLock(async () => {
    await AsyncStorage.setItem(HISTORY_ENABLED_KEY, String(enabled));
    if (!enabled) await AsyncStorage.removeItem(HISTORY_KEY);
  });
}

export async function readHistory(): Promise<HistoryEntry[]> {
  return readBoundedArray(HISTORY_KEY, 20, historySchema);
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const checked = historySchema.parse(entry);
  await withRecyclingStorageLock(async () => {
    if (!(await isHistoryEnabled())) return;
    const current = await readHistory();
    const next = [checked, ...current.filter((item) => item.gtin !== checked.gtin)].slice(0, 20);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  });
}

export async function clearHistory(): Promise<void> {
  await withRecyclingStorageLock(async () => {
    await AsyncStorage.removeItem(HISTORY_KEY);
  });
}

export async function clearAllLocalData(): Promise<void> {
  invalidateLocalDataWork();
  await withRecyclingStorageLock(async () => {
    const appKeys = (await AsyncStorage.getAllKeys()).filter(isAppStorageKey);
    if (appKeys.length > 0) await AsyncStorage.multiRemove(appKeys);
  });
}

export function isAppStorageKey(key: string): boolean {
  return key.startsWith(APP_STORAGE_PREFIX);
}

export async function queuePendingLookup(gtin: string): Promise<void> {
  const checked = GtinSchema.parse(gtin);
  await withRecyclingStorageLock(async () => {
    const current = await readBoundedArray(PENDING_KEY, 10, GtinSchema);
    await AsyncStorage.setItem(
      PENDING_KEY,
      JSON.stringify([checked, ...current.filter((item) => item !== checked)].slice(0, 10)),
    );
  });
}

export async function saveFeedbackDraft(draft: FeedbackDraft): Promise<void> {
  const checked = feedbackSchema.parse(draft);
  await withRecyclingStorageLock(async () => {
    const current = await readBoundedArray(FEEDBACK_KEY, 20, feedbackSchema);
    await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify([checked, ...current].slice(0, 20)));
  });
}

async function readBoundedArray<T>(
  key: string,
  maximum: number,
  schema: z.ZodType<T>,
): Promise<T[]> {
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored && stored.length > 128_000) throw Error("storage_bound");
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed.slice(0, maximum).flatMap((row: unknown) => {
          const checked = schema.safeParse(row);
          return checked.success ? [checked.data] : [];
        })
      : [];
  } catch {
    await AsyncStorage.removeItem(key);
    return [];
  }
}
