import AsyncStorage from "@react-native-async-storage/async-storage";
import { withRecyclingStorageLock } from "../overview/storage";

export const SOUND_PREFERENCE_KEY = "@kierratysappi/sound-feedback/v1";

export function readSoundPreference(): Promise<boolean> {
  return withRecyclingStorageLock(async () => {
    const stored = await AsyncStorage.getItem(SOUND_PREFERENCE_KEY);
    if (stored === null || stored === "true") return true;
    if (stored === "false") return false;
    throw new Error("sound_preference_invalid");
  });
}

export function writeSoundPreference(enabled: boolean): Promise<void> {
  if (typeof enabled !== "boolean") return Promise.reject(new Error("sound_preference_invalid"));
  return withRecyclingStorageLock(async () => {
    try {
      await AsyncStorage.setItem(SOUND_PREFERENCE_KEY, String(enabled));
    } catch {
      // Acknowledgement can fail after commit. Reconcile the exact boolean;
      // unconfirmed state must remain silent rather than blindly replaying.
      if ((await AsyncStorage.getItem(SOUND_PREFERENCE_KEY)) !== String(enabled))
        throw new Error("sound_preference_unconfirmed");
    }
  });
}
