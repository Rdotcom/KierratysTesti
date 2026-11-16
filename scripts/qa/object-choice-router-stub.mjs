// Only the unused Screen export in the QA host imports this router dependency.
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
