import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAllLocalData, clearHistory } from "../../history/storage";
import { withRecyclingStorageLock } from "../../overview/storage";
import { readSoundPreference, SOUND_PREFERENCE_KEY, writeSoundPreference } from "../storage";

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
    multiRemove: vi.fn(async (keys: readonly string[]) => {
      for (const key of keys) values.delete(key);
    }),
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));

beforeEach(async () => {
  await withRecyclingStorageLock(async () => undefined);
  storage.values.clear();
  storage.getItem.mockReset().mockImplementation(async (key) => storage.values.get(key) ?? null);
  storage.setItem.mockReset().mockImplementation(async (key, value) => {
    storage.values.set(key, value);
  });
  storage.removeItem.mockReset().mockImplementation(async (key) => {
    storage.values.delete(key);
  });
  storage.getAllKeys.mockReset().mockImplementation(async () => [...storage.values.keys()]);
  storage.multiRemove.mockReset().mockImplementation(async (keys) => {
    for (const key of keys) storage.values.delete(key);
  });
});

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("local sound preference storage", () => {
  it("uses the documented missing-key default without writing or deleting on read", async () => {
    expect(SOUND_PREFERENCE_KEY).toBe("@kierratysappi/sound-feedback/v1");
    expect(await readSoundPreference()).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith(SOUND_PREFERENCE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it.each([
    ["true", true],
    ["false", false],
  ] as const)("reads canonical %s only", async (value, expected) => {
    storage.values.set(SOUND_PREFERENCE_KEY, value);
    expect(await readSoundPreference()).toBe(expected);
  });

  it.each(["", "TRUE", "False", "false ", " true", "0", "1", "null", "{}", '"false"'])(
    "rejects malformed preference without overwriting it: %s",
    async (value) => {
      storage.values.set(SOUND_PREFERENCE_KEY, value);
      await expect(readSoundPreference()).rejects.toThrow("sound_preference_invalid");
      expect(storage.values.get(SOUND_PREFERENCE_KEY)).toBe(value);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    },
  );

  it("does not reinterpret a read failure as permission to make sound", async () => {
    storage.getItem.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(readSoundPreference()).rejects.toThrow("storage unavailable");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await readSoundPreference()).toBe(true);
  });

  it.each([true, false])(
    "persists an explicit boolean %s and reloads the exact value",
    async (value) => {
      await writeSoundPreference(value);
      expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(SOUND_PREFERENCE_KEY, String(value));
      expect(await readSoundPreference()).toBe(value);
    },
  );

  it.each([undefined, null, 0, 1, "false", {}, []])(
    "rejects nonboolean writes before touching storage: %j",
    async (value) => {
      await expect(writeSoundPreference(value as unknown as boolean)).rejects.toThrow(
        "sound_preference_invalid",
      );
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.getItem).not.toHaveBeenCalled();
    },
  );

  it("reconciles a committed write whose acknowledgement failed without writing again", async () => {
    storage.setItem.mockImplementationOnce(async (key, value) => {
      storage.values.set(key, value);
      throw new Error("acknowledgement lost");
    });
    await expect(writeSoundPreference(false)).resolves.toBeUndefined();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(SOUND_PREFERENCE_KEY);
    expect(await readSoundPreference()).toBe(false);
  });

  it("cannot confirm an uncommitted write merely because the previous setting exists", async () => {
    storage.values.set(SOUND_PREFERENCE_KEY, "true");
    storage.setItem.mockRejectedValueOnce(new Error("not committed"));
    await expect(writeSoundPreference(false)).rejects.toThrow("sound_preference_unconfirmed");
    expect(storage.values.get(SOUND_PREFERENCE_KEY)).toBe("true");
    await writeSoundPreference(false);
    expect(await readSoundPreference()).toBe(false);
  });

  it("keeps an acknowledgement/read failure unconfirmed and recovers its queue", async () => {
    storage.setItem.mockRejectedValueOnce(new Error("write unavailable"));
    storage.getItem.mockRejectedValueOnce(new Error("read unavailable"));
    await expect(writeSoundPreference(true)).rejects.toThrow("read unavailable");
    await writeSoundPreference(false);
    expect(await readSoundPreference()).toBe(false);
  });

  it("serializes writes and reads in requested order", async () => {
    const gate = deferred();
    storage.setItem.mockImplementationOnce(async (key, value) => {
      await gate.promise;
      storage.values.set(key, value);
    });
    const first = writeSoundPreference(true);
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    const second = writeSoundPreference(false);
    const reading = readSoundPreference();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([first, second]);
    expect(await reading).toBe(false);
    expect(storage.setItem.mock.calls.map(([, value]) => value)).toEqual(["true", "false"]);
  });

  it("global deletion waits for a pending setting write without recreating it afterward", async () => {
    storage.values.set("@another-app/preferences", "preserved");
    const gate = deferred();
    storage.setItem.mockImplementationOnce(async (key, value) => {
      await gate.promise;
      storage.values.set(key, value);
    });
    const writing = writeSoundPreference(false);
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    const clearing = clearAllLocalData();
    const reading = readSoundPreference();
    expect(storage.multiRemove).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([writing, clearing]);
    expect(await reading).toBe(true);
    expect(storage.values.has(SOUND_PREFERENCE_KEY)).toBe(false);
    expect([...storage.values]).toEqual([["@another-app/preferences", "preserved"]]);
  });

  it("keeps acknowledgement reconciliation inside the same lock as global deletion", async () => {
    const gate = deferred();
    storage.setItem.mockImplementationOnce(async (key, value) => {
      storage.values.set(key, value);
      throw new Error("committed acknowledgement lost");
    });
    storage.getItem.mockImplementationOnce(async (key) => {
      await gate.promise;
      return storage.values.get(key) ?? null;
    });
    const writing = writeSoundPreference(false);
    await vi.waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));
    const clearing = clearAllLocalData();
    expect(storage.multiRemove).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([writing, clearing]);
    expect(storage.values.has(SOUND_PREFERENCE_KEY)).toBe(false);
  });

  it("preserves sound and other settings when clearing only lookup history", async () => {
    storage.values.set("@kierratysappi/history/v1", "history");
    await writeSoundPreference(false);
    await clearHistory();
    expect(await readSoundPreference()).toBe(false);
    expect(storage.values.has("@kierratysappi/history/v1")).toBe(false);
  });
});
