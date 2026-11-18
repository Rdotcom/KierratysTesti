import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    getAllKeys: vi.fn(async () => [...values.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) values.delete(key);
    }),
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));

import {
  addHistoryEntry,
  clearAllLocalData,
  readHistory,
  saveFeedbackDraft,
  setHistoryEnabled,
} from "../storage";

const key = "@kierratysappi/history/v1";
const entry = {
  gtin: "3017620422003",
  productName: "Jar",
  resultStatus: "packaging_missing" as const,
  scannedAt: "2026-11-18T12:00:00.000Z",
};
beforeEach(() => {
  storage.values.clear();
  vi.clearAllMocks();
});
describe("untrusted local history and draft storage", () => {
  it("drops malformed rows rather than casting arbitrary stored objects as entries", async () => {
    storage.values.set(
      key,
      JSON.stringify([
        null,
        {},
        { ...entry, gtin: "invalid" },
        { ...entry, productName: "\u202eFake" },
        entry,
      ]),
    );
    expect(await readHistory()).toEqual([entry]);
  });
  it("bounds raw storage before JSON parse and removes only the corrupt app key", async () => {
    storage.values.set(key, "x".repeat(128001));
    storage.values.set("other-app", "preserved");
    expect(await readHistory()).toEqual([]);
    expect(storage.values.has(key)).toBe(false);
    expect(storage.values.get("other-app")).toBe("preserved");
  });
  it("validates writes and does not persist overlong drafts or unsafe GTINs", async () => {
    await expect(addHistoryEntry({ ...entry, gtin: "bad" })).rejects.toThrow();
    await expect(
      saveFeedbackDraft({
        gtin: undefined,
        category: "wrong_product",
        note: "x".repeat(2001),
        createdAt: entry.scannedAt,
      }),
    ).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("serializes concurrent writes without losing entries and keeps opt-out/deletion final", async () => {
    await setHistoryEnabled(true);
    await Promise.all([
      addHistoryEntry(entry),
      addHistoryEntry({ ...entry, gtin: "737628064502" }),
    ]);
    expect(await readHistory()).toHaveLength(2);
    await Promise.all([addHistoryEntry(entry), setHistoryEnabled(false)]);
    expect(await readHistory()).toEqual([]);
    await setHistoryEnabled(true);
    await Promise.all([addHistoryEntry(entry), clearAllLocalData(), addHistoryEntry(entry)]);
    expect(await readHistory()).toEqual([]);
    expect(storage.values.has("@kierratysappi/history-enabled/v1")).toBe(false);
  });
});
