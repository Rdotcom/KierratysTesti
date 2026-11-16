import type { Language } from "@kierratysappi/domain";
export const LANGUAGE_KEY = "@kierratysappi/language/v1";
export function createLanguagePreference(port: {
  read: () => Promise<unknown>;
  write: (language: Language) => Promise<void>;
  changed: (language: Language) => void;
  issue: (failed: boolean) => void;
}) {
  let generation = 0,
    disposed = false,
    queue = Promise.resolve();
  return {
    async hydrate() {
      const ticket = generation;
      try {
        const value = await port.read();
        if (!disposed && ticket === generation && (value === "fi" || value === "en"))
          port.changed(value);
      } catch {
        if (!disposed && ticket === generation) port.issue(true);
      }
    },
    select(value: Language) {
      if (disposed || (value !== "fi" && value !== "en")) return;
      const ticket = ++generation;
      port.changed(value);
      queue = queue
        .catch(() => undefined)
        .then(() => port.write(value))
        .then(
          () => {
            if (!disposed && ticket === generation) port.issue(false);
          },
          () => {
            if (!disposed && ticket === generation) port.issue(true);
          },
        );
    },
    settled: () => queue,
    dispose() {
      disposed = true;
      generation++;
    },
  };
}
