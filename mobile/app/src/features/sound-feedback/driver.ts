import type { SoundCue, SoundDriver } from "./controller";

export interface CuePlayer {
  isLoaded: boolean;
  loop: boolean;
  volume: number;
  pause(): void;
  play(): void;
  remove(): void;
  seekTo(seconds: number): Promise<void>;
}

export function createLocalSoundDriver(
  audio: { createPlayer(source: number): CuePlayer },
  sources: Record<SoundCue, number>,
): SoundDriver {
  const players = new Map<SoundCue, CuePlayer>();
  let generation = 0;
  let disposed = false;
  const stop = () => {
    generation++;
    for (const player of players.values()) {
      try {
        player.pause();
      } catch {
        /* Nonessential feedback cannot break a flow. */
      }
    }
  };
  return {
    async play(cue, isCurrent) {
      if (disposed || !isCurrent()) return;
      stop();
      const ticket = generation;
      let player = players.get(cue);
      if (!player) {
        player = audio.createPlayer(sources[cue]);
        try {
          player.loop = false;
          player.volume = 0.65;
        } catch (error) {
          try {
            player.pause();
          } catch {
            /* Best-effort optional cleanup. */
          }
          try {
            player.remove();
          } catch {
            /* Never retain a partial player. */
          }
          throw error;
        }
        players.set(cue, player);
      }
      const deadline = Date.now() + 180;
      let polls = 0;
      while (!player.isLoaded && Date.now() < deadline && polls++ < 18) {
        if (disposed || ticket !== generation || !isCurrent()) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      if (!player.isLoaded || disposed || ticket !== generation || !isCurrent()) return;
      await player.seekTo(0);
      if (disposed || ticket !== generation || !isCurrent()) return;
      player.play();
    },
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      for (const player of players.values()) {
        try {
          player.remove();
        } catch {
          /* Already released by the platform. */
        }
      }
      players.clear();
    },
  };
}
