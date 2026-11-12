/** Nonessential, local interface feedback. No storage, player or app dependency. */
export type SoundCue = "tap" | "ready" | "confirm" | "attention";

export interface SoundDriver {
  play(cue: SoundCue, isCurrent: () => boolean): Promise<void>;
  stop(): void;
  dispose(): void;
}

export interface SoundFeedbackController {
  setEnabled(enabled: boolean): void;
  setForeground(foreground: boolean): void;
  setScreenReader(screenReader: boolean): void;
  play(cue: SoundCue): void;
  dispose(): void;
}

export const SOUND_FEEDBACK_COOLDOWN_MS = 200;
export const SOUND_FEEDBACK_MAX_EVENT_AGE_MS = 300;
const cues: readonly SoundCue[] = ["tap", "ready", "confirm", "attention"];
interface FeedbackEvent {
  cue: SoundCue;
  generation: number;
  acceptedAt: number;
}

/** Dropped events are never replayed. At most the latest eligible event waits
 * for one driver load. Drivers must re-check isCurrent after asynchronous
 * configuration/seek and immediately before native playback.
 */
export function createSoundFeedbackController({
  loadDriver,
  now = Date.now,
  onUnavailable,
}: {
  loadDriver: () => Promise<SoundDriver>;
  now?: () => number;
  onUnavailable?: () => void;
}): SoundFeedbackController {
  let enabled = false;
  let foreground = false;
  let screenReader = true;
  let disposed = false;
  let unavailable = false;
  let generation = 0;
  let lastAcceptedAt: number | undefined;
  let driver: SoundDriver | undefined;
  let loading = false;
  let pending: FeedbackEvent | undefined;

  const permitted = () => enabled && foreground && !screenReader && !disposed && !unavailable;
  const currentEvent = (event: FeedbackEvent) => {
    if (!permitted() || generation !== event.generation) return false;
    try {
      const at = now();
      return (
        Number.isFinite(at) &&
        at >= event.acceptedAt &&
        at - event.acceptedAt <= SOUND_FEEDBACK_MAX_EVENT_AGE_MS
      );
    } catch {
      return false;
    }
  };
  const safeStop = (value: SoundDriver | undefined) => {
    try {
      value?.stop();
    } catch {
      // Optional sound cannot break the user's actual operation.
    }
  };
  const safeDispose = (value: SoundDriver | undefined) => {
    safeStop(value);
    try {
      value?.dispose();
    } catch {
      // A failed platform cleanup must not escape a lifecycle callback.
    }
  };
  const invalidate = () => {
    generation++;
    pending = undefined;
    safeStop(driver);
  };
  const fail = () => {
    if (unavailable || disposed) return;
    unavailable = true;
    invalidate();
    const failed = driver;
    driver = undefined;
    safeDispose(failed);
    try {
      onUnavailable?.();
    } catch {
      // This optional status callback is not part of product functionality.
    }
  };
  const deliver = (value: SoundDriver, event: FeedbackEvent) => {
    const isCurrent = () => currentEvent(event) && driver === value;
    if (!isCurrent()) return;
    safeStop(value);
    void (async () => {
      try {
        await value.play(event.cue, isCurrent);
      } catch {
        // Cancellation may reject an older platform seek/play. It must not
        // disable a newer event or surface an obsolete unavailable warning.
        if (isCurrent()) fail();
      }
    })();
  };
  const beginLoad = () => {
    if (loading) return;
    loading = true;
    void (async () => {
      let loaded: SoundDriver | undefined;
      try {
        loaded = await loadDriver();
        if (
          !loaded ||
          typeof loaded.play !== "function" ||
          typeof loaded.stop !== "function" ||
          typeof loaded.dispose !== "function"
        )
          throw new Error("sound_driver_unavailable");
        const event = pending;
        pending = undefined;
        if (!event || !currentEvent(event)) {
          safeDispose(loaded);
          return;
        }
        driver = loaded;
        deliver(loaded, event);
      } catch {
        safeDispose(loaded);
        // A missing module is permanent for this mounted controller. Never
        // retry a download/import every time a user presses another button.
        fail();
      } finally {
        loading = false;
      }
    })();
  };

  return {
    setEnabled(value) {
      if (disposed || enabled === value) return;
      enabled = value;
      if (!value) invalidate();
    },
    setForeground(value) {
      if (disposed || foreground === value) return;
      foreground = value;
      if (!value) invalidate();
    },
    setScreenReader(value) {
      if (disposed || screenReader === value) return;
      screenReader = value;
      if (value) invalidate();
    },
    play(cue) {
      if (!permitted() || !cues.includes(cue)) return;
      let at: number;
      try {
        at = now();
      } catch {
        return;
      }
      if (!Number.isFinite(at)) return;
      if (lastAcceptedAt !== undefined && at - lastAcceptedAt < SOUND_FEEDBACK_COOLDOWN_MS) return;
      lastAcceptedAt = at;
      const event = { cue, generation: ++generation, acceptedAt: at };
      if (driver) deliver(driver, event);
      else {
        pending = event;
        beginLoad();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      const previous = driver;
      driver = undefined;
      safeDispose(previous);
    },
  };
}
