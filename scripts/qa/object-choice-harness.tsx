// QA-only component host with explicitly synthetic suggestions. Never a runtime route,
// image recognition benchmark or claimed native-device evidence.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ObjectCandidateResultView } from "../../mobile/app/src/components/object-candidate-result";
import type { ObjectPhotoResponse } from "../../mobile/app/src/features/local-vision/object-candidates";
import { LanguageProvider } from "../../mobile/app/src/i18n/language-context";
import { AppThemeProvider } from "../../mobile/app/src/theme/tokens";
const fixture = (multiple = false): ObjectPhotoResponse => ({
  status: "observed",
  observation: {
    focus: multiple ? "multiple" : "single",
    candidates: multiple ? [] : ["spoon", "cup", "bottle"],
    source: {
      modelId: "google-siglip2-base224-block32-v1",
      revision: "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2",
      checkedOn: "2026-11-16",
      observedAt: "2026-11-16T18:00:00Z",
      verification: "unverified",
      confidence: "uncalibrated",
      scope: "object_form_only",
    },
  },
});
function Host() {
  const [result, setResult] = useState(fixture),
    [guide, setGuide] = useState(false);
  return (
    <>
      <p>QA · SYNTHETIC CANDIDATES · NOT AN INFERENCE TEST</p>
      <button type="button" data-testid="qa-new-result" onClick={() => setResult(fixture())}>
        QA new capture
      </button>
      <button type="button" data-testid="qa-multiple" onClick={() => setResult(fixture(true))}>
        QA multiple
      </button>
      <ObjectCandidateResultView result={result} onGuide={() => setGuide(true)} />
      {guide && <p data-testid="qa-guide-opened">QA manual-guide callback</p>}
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw Error("missing_qa_root");
createRoot(root).render(
  <LanguageProvider>
    <AppThemeProvider>
      <Host />
    </AppThemeProvider>
  </LanguageProvider>,
);
