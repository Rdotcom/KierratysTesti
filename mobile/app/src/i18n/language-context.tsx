import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Language } from "@kierratysappi/domain";
import { translate, type MessageKey } from "@kierratysappi/localization";
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

import { createLanguagePreference, LANGUAGE_KEY } from "./preference";

type LanguageContextValue = {
  readonly language: Language;
  readonly setLanguage: (language: Language) => void;
  readonly t: (key: MessageKey) => string;
  readonly storageError: boolean;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>("fi");
  const [storageError, setStorageError] = useState(false),
    [hydrated, setHydrated] = useState(false);
  const preference = useRef<ReturnType<typeof createLanguagePreference> | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const instance = createLanguagePreference({
      read: () =>
        new Promise<string | null>((resolve, reject) => {
          const timer = setTimeout(() => reject(Error("language_storage_timeout")), 1500);
          AsyncStorage.getItem(LANGUAGE_KEY).then(
            (value) => {
              clearTimeout(timer);
              resolve(value);
            },
            () => {
              clearTimeout(timer);
              reject(Error("language_storage_unavailable"));
            },
          );
        }),
      write: (next) => AsyncStorage.setItem(LANGUAGE_KEY, next),
      changed: setLanguageState,
      issue: setStorageError,
    });
    preference.current = instance;
    void instance.hydrate().finally(() => {
      if (active) setHydrated(true);
    });
    return () => {
      active = false;
      instance.dispose();
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    preference.current?.select(next);
  }, []);
  const t = useCallback((key: MessageKey) => translate(language, key), [language]);
  const value = useMemo(
    () => ({ language, setLanguage, t, storageError }),
    [language, setLanguage, t, storageError],
  );

  return (
    <LanguageContext.Provider value={value}>{hydrated ? children : null}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
