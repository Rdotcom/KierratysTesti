import { usePathname } from "expo-router";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, AppState } from "react-native";
import {
  createSoundFeedbackController,
  type SoundCue,
  type SoundFeedbackController,
} from "./controller";
import { loadSoundDriver } from "./load-driver";
import { readSoundPreference, writeSoundPreference } from "./storage";

type Preference = "loading" | "on" | "off" | "error";
type SoundFeedbackValue = {
  preference: Preference;
  saving: boolean;
  unavailable: boolean;
  play: (cue: SoundCue) => void;
  setEnabled: (enabled: boolean) => Promise<void>;
  reloadAfterDeletion: () => void;
};
const silent = () => undefined;
const SoundFeedbackContext = createContext<SoundFeedbackValue>({
  preference: "loading",
  saving: false,
  unavailable: false,
  play: silent,
  setEnabled: async () => undefined,
  reloadAfterDeletion: silent,
});

export function SoundFeedbackProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const [preference, setPreference] = useState<Preference>("loading");
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const controller = useRef<SoundFeedbackController | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const locked = useRef(false);
  const hydrate = useCallback(() => {
    const ticket = ++generation.current;
    controller.current?.setEnabled(false);
    setPreference("loading");
    void readSoundPreference()
      .then((enabled) => {
        if (!mounted.current || ticket !== generation.current) return;
        setPreference(enabled ? "on" : "off");
        controller.current?.setEnabled(enabled);
      })
      .catch(() => {
        if (mounted.current && ticket === generation.current) setPreference("error");
      });
  }, []);
  useEffect(() => {
    mounted.current = true;
    // Create a fresh lifecycle instance, including React StrictMode re-setup.
    const instance = createSoundFeedbackController({
      loadDriver: loadSoundDriver,
      onUnavailable: () => {
        if (mounted.current) setUnavailable(true);
      },
    });
    controller.current = instance;
    instance.setForeground(AppState.currentState === "active");
    hydrate();
    let readerEvent = false;
    const reader = AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => {
      readerEvent = true;
      instance.setScreenReader(enabled);
    });
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (mounted.current && !readerEvent && controller.current === instance)
          instance.setScreenReader(enabled);
      })
      .catch(() => undefined);
    const app = AppState.addEventListener("change", (state) =>
      instance.setForeground(state === "active"),
    );
    return () => {
      mounted.current = false;
      generation.current++;
      reader.remove();
      app.remove();
      instance.dispose();
      if (controller.current === instance) controller.current = null;
    };
  }, [hydrate]);
  useEffect(() => {
    // Leaving a screen invalidates any cue still waiting on native loading.
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    controller.current?.setForeground(false);
    controller.current?.setForeground(AppState.currentState === "active");
  }, [pathname]);
  const setEnabled = useCallback(async (enabled: boolean) => {
    if (locked.current || typeof enabled !== "boolean") return;
    locked.current = true;
    const ticket = ++generation.current;
    setSaving(true);
    controller.current?.setEnabled(false);
    try {
      await writeSoundPreference(enabled);
      if (!mounted.current || ticket !== generation.current) return;
      setPreference(enabled ? "on" : "off");
      controller.current?.setEnabled(enabled);
      if (enabled) controller.current?.play("ready");
    } catch {
      if (mounted.current && ticket === generation.current) setPreference("error");
    } finally {
      locked.current = false;
      if (mounted.current) setSaving(false);
    }
  }, []);
  const play = useCallback((cue: SoundCue) => controller.current?.play(cue), []);
  const value = useMemo(
    () => ({ preference, saving, unavailable, play, setEnabled, reloadAfterDeletion: hydrate }),
    [preference, saving, unavailable, play, setEnabled, hydrate],
  );
  return <SoundFeedbackContext.Provider value={value}>{children}</SoundFeedbackContext.Provider>;
}

export function useSoundFeedback() {
  return useContext(SoundFeedbackContext);
}
