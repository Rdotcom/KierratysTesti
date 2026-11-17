// QA component host: focus-scoped recording reads storage but never auto-saves.
import { useEffect } from "react";
export const useFocusEffect = (callback) => useEffect(callback, [callback]);
export const usePathname = () => "/local-photo";
export const useLocalSearchParams = () => ({
  query: new URLSearchParams(location.search).get("q") ?? "",
});
export const useRouter = () => ({
  canGoBack: () => false,
  back: () => {},
  replace: () => {},
  push: () => {},
});
