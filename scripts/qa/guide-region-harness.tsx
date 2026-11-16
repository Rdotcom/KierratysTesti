// Actual guide/context views; controlled public test coordinates, no native GPS/camera.
import { createRoot } from "react-dom/client";
import { SafeAreaProvider } from "react-native-safe-area-context";
import GuideScreen from "../../mobile/app/src/app/guide";
import {
  SortingRegionProvider,
  useSortingRegion,
} from "../../mobile/app/src/features/region/context";
import { LanguageProvider } from "../../mobile/app/src/i18n/language-context";
import { AppThemeProvider } from "../../mobile/app/src/theme/tokens";
let finish: (() => void) | undefined;
const readFix = async () => {
  if (new URLSearchParams(location.search).has("pending"))
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  const coast = new URLSearchParams(location.search).has("coast");
  return {
    coords: { latitude: coast ? 60.1699 : 60.24, longitude: coast ? 24.9384 : 24.92, accuracy: 20 },
  };
};
function Host() {
  const region = useSortingRegion();
  return (
    <>
      <p>QA · CONTROLLED LOCATION · NO CAMERA OR NATIVE GPS</p>
      <button type="button" data-testid="qa-clear" onClick={region.clear}>
        Clear region
      </button>
      <button type="button" data-testid="qa-finish" onClick={() => finish?.()}>
        Finish stale location
      </button>
      <output data-testid="qa-region-state" style={{ overflowWrap: "anywhere" }}>
        {JSON.stringify({ selection: region.selection, busy: region.busy, issue: region.issue })}
      </output>
      <GuideScreen />
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw Error("missing_root");
createRoot(root).render(
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    }}
  >
    <LanguageProvider>
      <AppThemeProvider>
        <SortingRegionProvider readFix={readFix}>
          <Host />
        </SortingRegionProvider>
      </AppThemeProvider>
    </LanguageProvider>
  </SafeAreaProvider>,
);
