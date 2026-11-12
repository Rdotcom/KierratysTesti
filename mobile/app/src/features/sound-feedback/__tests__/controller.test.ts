import { describe, expect, it, vi } from "vitest";
import {
  createSoundFeedbackController,
  SOUND_FEEDBACK_COOLDOWN_MS,
  SOUND_FEEDBACK_MAX_EVENT_AGE_MS,
  type SoundCue,
  type SoundDriver,
  type SoundFeedbackController,
} from "../controller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};
function createDriver() {
  return {
    play: vi.fn(async (_cue: SoundCue, _current: () => boolean): Promise<void> => undefined),
    stop: vi.fn(),
    dispose: vi.fn(),
  } satisfies SoundDriver;
}
function enable(controller: SoundFeedbackController) {
  controller.setEnabled(true);
  controller.setForeground(true);
  controller.setScreenReader(false);
}
function setup() {
  let clock = 0;
  const driver = createDriver();
  const loadDriver = vi.fn(async () => driver);
  const onUnavailable = vi.fn();
  const controller = createSoundFeedbackController({ loadDriver, now: () => clock, onUnavailable });
  return {
    controller,
    driver,
    loadDriver,
    onUnavailable,
    at: (value: number) => {
      clock = value;
    },
  };
}

describe("nonessential sound lifecycle", () => {
  it("starts fully silent and loads nothing until all gates resolve and an action occurs", async () => {
    const { controller, loadDriver, driver } = setup();
    controller.play("tap");
    controller.setEnabled(true);
    controller.play("tap");
    controller.setForeground(true);
    controller.play("tap");
    await flush();
    expect(loadDriver).not.toHaveBeenCalled();
    controller.setScreenReader(false);
    await flush();
    expect(loadDriver).not.toHaveBeenCalled();
    controller.play("tap");
    await flush();
    expect(loadDriver).toHaveBeenCalledOnce();
    expect(driver.play).toHaveBeenCalledOnce();
    expect(driver.play.mock.calls[0]?.[0]).toBe("tap");
    expect(driver.play.mock.calls[0]?.[1]()).toBe(true);
  });

  it("permits the first event at time zero and uses one global cooldown across cues", async () => {
    const { controller, driver, at } = setup();
    enable(controller);
    controller.play("tap");
    await flush();
    at(SOUND_FEEDBACK_COOLDOWN_MS - 1);
    controller.play("confirm");
    expect(driver.play).toHaveBeenCalledOnce();
    at(SOUND_FEEDBACK_COOLDOWN_MS);
    controller.play("ready");
    await flush();
    expect(driver.play.mock.calls.map(([cue]) => cue)).toEqual(["tap", "ready"]);
  });

  it("keeps only the latest eligible event during one pending import", async () => {
    const pending = deferred<SoundDriver>();
    const driver = createDriver();
    let clock = 0;
    const load = vi.fn(() => pending.promise);
    const controller = createSoundFeedbackController({ loadDriver: load, now: () => clock });
    enable(controller);
    controller.play("tap");
    clock = 100;
    controller.play("attention");
    clock = 200;
    controller.play("ready");
    clock = 250;
    pending.resolve(driver);
    await flush();
    expect(load).toHaveBeenCalledOnce();
    expect(driver.play.mock.calls.map(([cue]) => cue)).toEqual(["ready"]);
  });

  for (const gate of ["disable", "background", "screen-reader"] as const) {
    it(`drops a pending event on ${gate}, without replay after restoring gates`, async () => {
      const pending = deferred<SoundDriver>();
      const driver = createDriver();
      const controller = createSoundFeedbackController({
        loadDriver: () => pending.promise,
        now: () => 0,
      });
      enable(controller);
      controller.play("ready");
      if (gate === "disable") controller.setEnabled(false);
      else if (gate === "background") controller.setForeground(false);
      else controller.setScreenReader(true);
      enable(controller);
      pending.resolve(driver);
      await flush();
      expect(driver.play).not.toHaveBeenCalled();
      expect(driver.dispose).toHaveBeenCalledOnce();
    });

    it(`stops current playback and invalidates asynchronous seek on ${gate}`, async () => {
      const { controller, driver } = setup();
      const seek = deferred<void>();
      const sounded: SoundCue[] = [];
      driver.play.mockImplementation(async (cue, current) => {
        await seek.promise;
        if (current()) sounded.push(cue);
      });
      enable(controller);
      controller.play("confirm");
      await flush();
      if (gate === "disable") controller.setEnabled(false);
      else if (gate === "background") controller.setForeground(false);
      else controller.setScreenReader(true);
      expect(driver.stop).toHaveBeenCalled();
      seek.resolve();
      await flush();
      expect(sounded).toEqual([]);
    });
  }

  it("does not invalidate an eligible event when identical gate values repeat", async () => {
    const { controller, driver } = setup();
    enable(controller);
    controller.play("tap");
    enable(controller);
    await flush();
    expect(driver.play).toHaveBeenCalledOnce();
    expect(driver.play.mock.calls[0]?.[1]()).toBe(true);
  });

  it("never plays a stale import result several seconds after an action", async () => {
    const pending = deferred<SoundDriver>();
    const driver = createDriver();
    let clock = 0;
    const controller = createSoundFeedbackController({
      loadDriver: () => pending.promise,
      now: () => clock,
    });
    enable(controller);
    controller.play("tap");
    clock = SOUND_FEEDBACK_MAX_EVENT_AGE_MS + 1;
    pending.resolve(driver);
    await flush();
    expect(driver.play).not.toHaveBeenCalled();
    expect(driver.dispose).toHaveBeenCalledOnce();
    enable(controller);
    await flush();
    expect(driver.play).not.toHaveBeenCalled();
  });

  it("expires the driver callback during a long asynchronous seek", async () => {
    const { controller, driver, at } = setup();
    const seek = deferred<void>();
    const sounded: SoundCue[] = [];
    driver.play.mockImplementation(async (cue, current) => {
      await seek.promise;
      if (current()) sounded.push(cue);
    });
    enable(controller);
    controller.play("ready");
    await flush();
    at(SOUND_FEEDBACK_MAX_EVENT_AGE_MS + 1);
    seek.resolve();
    await flush();
    expect(sounded).toEqual([]);
  });

  it("allows a fresh action after dropping an expired import instead of replaying old work", async () => {
    const first = deferred<SoundDriver>();
    const firstDriver = createDriver();
    const nextDriver = createDriver();
    let clock = 0;
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(nextDriver);
    const controller = createSoundFeedbackController({ loadDriver: load, now: () => clock });
    enable(controller);
    controller.play("tap");
    clock = 1_000;
    first.resolve(firstDriver);
    await flush();
    controller.play("attention");
    await flush();
    expect(firstDriver.play).not.toHaveBeenCalled();
    expect(nextDriver.play.mock.calls.map(([cue]) => cue)).toEqual(["attention"]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("contains driver load failure and avoids repeated import attempts", async () => {
    const load = vi.fn(async () => {
      throw new Error("missing_native_audio");
    });
    const unavailable = vi.fn();
    const controller = createSoundFeedbackController({
      loadDriver: load,
      now: () => 0,
      onUnavailable: unavailable,
    });
    enable(controller);
    expect(() => controller.play("tap")).not.toThrow();
    await flush();
    controller.setEnabled(false);
    controller.setEnabled(true);
    controller.play("ready");
    await flush();
    expect(load).toHaveBeenCalledOnce();
    expect(unavailable).toHaveBeenCalledOnce();
  });

  it("contains synchronous loader failure and callback failure", async () => {
    const controller = createSoundFeedbackController({
      loadDriver: () => {
        throw new Error("loader");
      },
      now: () => 0,
      onUnavailable: () => {
        throw new Error("observer");
      },
    });
    enable(controller);
    expect(() => controller.play("tap")).not.toThrow();
    await flush();
  });

  it("contains current play failure, releases resources and reports unavailable once", async () => {
    const { controller, driver, onUnavailable, at } = setup();
    driver.play.mockRejectedValue(new Error("native_play_failed"));
    enable(controller);
    controller.play("confirm");
    await flush();
    expect(driver.dispose).toHaveBeenCalledOnce();
    expect(onUnavailable).toHaveBeenCalledOnce();
    at(500);
    controller.play("tap");
    await flush();
    expect(driver.play).toHaveBeenCalledOnce();
  });

  it("ignores a rejected old seek after a newer event instead of disabling newer feedback", async () => {
    const { controller, driver, at, onUnavailable } = setup();
    const first = deferred<void>();
    driver.play.mockImplementationOnce(() => first.promise);
    enable(controller);
    controller.play("tap");
    await flush();
    const oldCurrent = driver.play.mock.calls[0]?.[1];
    at(200);
    controller.play("ready");
    expect(oldCurrent?.()).toBe(false);
    first.reject(new Error("old_seek_cancelled"));
    await flush();
    expect(driver.play.mock.calls.map(([cue]) => cue)).toEqual(["tap", "ready"]);
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(driver.dispose).not.toHaveBeenCalled();
  });

  it("disposes once, stops sound and rejects every later action", async () => {
    const { controller, driver, loadDriver, at } = setup();
    enable(controller);
    controller.play("tap");
    await flush();
    const current = driver.play.mock.calls[0]?.[1];
    controller.dispose();
    controller.dispose();
    expect(current?.()).toBe(false);
    expect(driver.dispose).toHaveBeenCalledOnce();
    at(500);
    enable(controller);
    controller.play("confirm");
    await flush();
    expect(driver.play).toHaveBeenCalledOnce();
    expect(loadDriver).toHaveBeenCalledOnce();
  });

  it("releases a late imported driver after disposal without reporting a stale failure", async () => {
    const pending = deferred<SoundDriver>();
    const driver = createDriver();
    const unavailable = vi.fn();
    const controller = createSoundFeedbackController({
      loadDriver: () => pending.promise,
      now: () => 0,
      onUnavailable: unavailable,
    });
    enable(controller);
    controller.play("tap");
    controller.dispose();
    pending.resolve(driver);
    await flush();
    expect(driver.dispose).toHaveBeenCalledOnce();
    expect(driver.play).not.toHaveBeenCalled();
    expect(unavailable).not.toHaveBeenCalled();
  });

  it("contains throwing platform cleanup methods", async () => {
    const { controller, driver } = setup();
    driver.stop.mockImplementation(() => {
      throw new Error("stop");
    });
    driver.dispose.mockImplementation(() => {
      throw new Error("dispose");
    });
    enable(controller);
    controller.play("tap");
    await flush();
    expect(() => controller.setForeground(false)).not.toThrow();
    expect(() => controller.dispose()).not.toThrow();
  });

  it("rejects unknown cues and invalid or throwing clocks without loading", async () => {
    const { controller, loadDriver } = setup();
    enable(controller);
    controller.play("not-a-cue" as SoundCue);
    expect(loadDriver).not.toHaveBeenCalled();
    for (const now of [
      () => Number.NaN,
      () => Number.POSITIVE_INFINITY,
      () => {
        throw new Error("clock");
      },
    ]) {
      const controller = createSoundFeedbackController({ loadDriver, now });
      enable(controller);
      expect(() => controller.play("tap")).not.toThrow();
    }
    await flush();
    expect(loadDriver).not.toHaveBeenCalled();
  });

  it("drops backward-clock events and invalidates callbacks if clock becomes invalid", async () => {
    let clock = 500;
    const driver = createDriver();
    const controller = createSoundFeedbackController({
      loadDriver: async () => driver,
      now: () => clock,
    });
    enable(controller);
    controller.play("tap");
    await flush();
    const current = driver.play.mock.calls[0]?.[1];
    clock = 100;
    controller.play("confirm");
    expect(driver.play).toHaveBeenCalledOnce();
    expect(current?.()).toBe(false);
    clock = Number.NaN;
    expect(current?.()).toBe(false);
  });
});
