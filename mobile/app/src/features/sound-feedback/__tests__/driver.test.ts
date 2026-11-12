import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundCue } from "../controller";
import { type CuePlayer, createLocalSoundDriver } from "../driver";

const sources: Record<SoundCue, number> = { tap: 11, ready: 12, confirm: 13, attention: 14 };

function player(loaded = true): CuePlayer {
  return {
    isLoaded: loaded,
    loop: true,
    volume: 1,
    pause: vi.fn(),
    play: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn(async () => undefined),
  };
}
function setup(value = player()) {
  const audio = { createPlayer: vi.fn((_source: number) => value) };
  return { value, audio, driver: createLocalSoundDriver(audio, sources) };
}
function deferred() {
  let resolve = () => {};
  let reject = (_reason: Error) => {};
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("optional local sound driver without native or audible playback", () => {
  it.each(Object.keys(sources) as SoundCue[])(
    "uses only the supplied local asset for %s with quiet, nonlooping playback",
    async (cue) => {
      const { driver, audio, value } = setup();
      await driver.play(cue, () => true);
      expect(audio.createPlayer).toHaveBeenCalledExactlyOnceWith(sources[cue]);
      expect(value.loop).toBe(false);
      expect(value.volume).toBe(0.65);
      expect(value.seekTo).toHaveBeenCalledExactlyOnceWith(0);
      expect(value.play).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      driver.dispose();
    },
  );

  it("creates nothing for an already-cancelled event", async () => {
    const { driver, audio, value } = setup();
    await driver.play("tap", () => false);
    expect(audio.createPlayer).not.toHaveBeenCalled();
    expect(value.play).not.toHaveBeenCalled();
    expect(value.seekTo).not.toHaveBeenCalled();
    driver.dispose();
  });

  it("reuses an existing cue player but always rewinds before playback", async () => {
    const { driver, audio, value } = setup();
    await driver.play("tap", () => true);
    await driver.play("tap", () => true);
    expect(audio.createPlayer).toHaveBeenCalledTimes(1);
    expect(value.pause).toHaveBeenCalledTimes(1);
    expect(value.seekTo).toHaveBeenNthCalledWith(1, 0);
    expect(value.seekTo).toHaveBeenNthCalledWith(2, 0);
    expect(value.play).toHaveBeenCalledTimes(2);
    driver.dispose();
  });

  it("pauses previous cue players instead of layering their playback", async () => {
    const first = player();
    const second = player();
    const audio = { createPlayer: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) };
    const driver = createLocalSoundDriver(audio, sources);
    await driver.play("tap", () => true);
    await driver.play("confirm", () => true);
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(first.play).toHaveBeenCalledTimes(1);
    expect(second.play).toHaveBeenCalledTimes(1);
    driver.dispose();
    expect(first.remove).toHaveBeenCalledTimes(1);
    expect(second.remove).toHaveBeenCalledTimes(1);
  });

  it("allows loading within the short deadline without retrying asset creation", async () => {
    const { driver, audio, value } = setup(player(false));
    const result = driver.play("ready", () => true);
    await vi.advanceTimersByTimeAsync(70);
    expect(value.play).not.toHaveBeenCalled();
    value.isLoaded = true;
    await vi.advanceTimersByTimeAsync(10);
    await result;
    expect(audio.createPlayer).toHaveBeenCalledTimes(1);
    expect(value.seekTo).toHaveBeenCalledTimes(1);
    expect(value.play).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    driver.dispose();
  });

  it("drops a cue that is still unloaded at180ms, with no delayed replay", async () => {
    const { driver, value } = setup(player(false));
    const result = driver.play("ready", () => true);
    await vi.advanceTimersByTimeAsync(180);
    await result;
    expect(value.seekTo).not.toHaveBeenCalled();
    expect(value.play).not.toHaveBeenCalled();
    value.isLoaded = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(value.play).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    driver.dispose();
  });

  it("keeps the180ms load budget bounded even if the wall clock moves backwards", async () => {
    const { driver, value } = setup(player(false));
    const result = driver.play("ready", () => true);
    await vi.advanceTimersByTimeAsync(20);
    vi.setSystemTime(-10_000);
    await vi.advanceTimersByTimeAsync(160);
    expect(vi.getTimerCount()).toBe(0);
    await result;
    expect(value.play).not.toHaveBeenCalled();
    driver.dispose();
  });

  it("cancels while loading before any rewind", async () => {
    const { driver, value } = setup(player(false));
    let current = true;
    const result = driver.play("tap", () => current);
    current = false;
    await vi.advanceTimersByTimeAsync(10);
    await result;
    expect(value.seekTo).not.toHaveBeenCalled();
    expect(value.play).not.toHaveBeenCalled();
    driver.dispose();
  });

  it("checks cancellation again after an asynchronous seek", async () => {
    const { driver, value } = setup();
    const seek = deferred();
    vi.mocked(value.seekTo).mockImplementationOnce(() => seek.promise);
    let current = true;
    const result = driver.play("tap", () => current);
    expect(value.seekTo).toHaveBeenCalledTimes(1);
    current = false;
    seek.resolve();
    await result;
    expect(value.play).not.toHaveBeenCalled();
    driver.dispose();
  });

  it.each(["stop", "dispose"] as const)(
    "%s invalidates a waiting load generation",
    async (action) => {
      const { driver, value } = setup(player(false));
      const result = driver.play("tap", () => true);
      driver[action]();
      value.isLoaded = true;
      await vi.advanceTimersByTimeAsync(10);
      await result;
      expect(value.seekTo).not.toHaveBeenCalled();
      expect(value.play).not.toHaveBeenCalled();
      driver.dispose();
    },
  );

  it.each(["stop", "dispose"] as const)(
    "%s invalidates a pending seek generation",
    async (action) => {
      const { driver, value } = setup();
      const seek = deferred();
      vi.mocked(value.seekTo).mockImplementationOnce(() => seek.promise);
      const result = driver.play("tap", () => true);
      driver[action]();
      seek.resolve();
      await result;
      expect(value.play).not.toHaveBeenCalled();
      driver.dispose();
    },
  );

  it("a newer cue cannot let an older seek play after it resolves", async () => {
    const first = player();
    const second = player();
    const seek = deferred();
    vi.mocked(first.seekTo).mockImplementationOnce(() => seek.promise);
    const audio = { createPlayer: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) };
    const driver = createLocalSoundDriver(audio, sources);
    const older = driver.play("tap", () => true);
    await driver.play("ready", () => true);
    seek.resolve();
    await older;
    expect(first.play).not.toHaveBeenCalled();
    expect(second.play).toHaveBeenCalledTimes(1);
    driver.dispose();
  });

  it("dispose releases players exactly once and prevents future creation/playback", async () => {
    const { driver, audio, value } = setup();
    await driver.play("tap", () => true);
    driver.dispose();
    driver.dispose();
    await driver.play("ready", () => true);
    expect(audio.createPlayer).toHaveBeenCalledTimes(1);
    expect(value.remove).toHaveBeenCalledTimes(1);
    expect(value.play).toHaveBeenCalledTimes(1);
  });

  it("one failed native pause/remove does not prevent cleaning other players", async () => {
    const first = player();
    const second = player();
    vi.mocked(first.pause).mockImplementation(() => {
      throw new Error("pause unavailable");
    });
    vi.mocked(first.remove).mockImplementation(() => {
      throw new Error("remove unavailable");
    });
    const audio = { createPlayer: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) };
    const driver = createLocalSoundDriver(audio, sources);
    await driver.play("tap", () => true);
    await driver.play("ready", () => true);
    expect(() => driver.stop()).not.toThrow();
    expect(() => driver.dispose()).not.toThrow();
    expect(second.pause).toHaveBeenCalled();
    expect(first.remove).toHaveBeenCalledTimes(1);
    expect(second.remove).toHaveBeenCalledTimes(1);
  });

  it("a failed creation rejects this optional operation without creating a retry timer", async () => {
    const audio = {
      createPlayer: vi.fn(() => {
        throw new Error("native unavailable");
      }),
    };
    const driver = createLocalSoundDriver(audio, sources);
    await expect(driver.play("tap", () => true)).rejects.toThrow("native unavailable");
    expect(vi.getTimerCount()).toBe(0);
    expect(() => driver.dispose()).not.toThrow();
  });

  it("a failed seek never plays, and its tracked player remains releasable", async () => {
    const { driver, value } = setup();
    vi.mocked(value.seekTo).mockRejectedValueOnce(new Error("seek unavailable"));
    await expect(driver.play("tap", () => true)).rejects.toThrow("seek unavailable");
    expect(value.play).not.toHaveBeenCalled();
    driver.dispose();
    expect(value.remove).toHaveBeenCalledTimes(1);
  });

  it.each(["loop", "volume"] as const)(
    "releases an allocated player if setting %s throws",
    async (property) => {
      const { driver, value } = setup();
      Object.defineProperty(value, property, {
        set() {
          throw new Error("configuration unavailable");
        },
        configurable: true,
      });
      await expect(driver.play("tap", () => true)).rejects.toThrow("configuration unavailable");
      driver.dispose();
      expect(value.play).not.toHaveBeenCalled();
      expect(value.remove).toHaveBeenCalledTimes(1);
    },
  );
});
