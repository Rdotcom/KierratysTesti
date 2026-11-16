import type { MessageKey } from "@kierratysappi/localization";
import type { ObjectKind, ObjectPhotoResponse } from "@/features/local-vision/object-candidates";
import { useLanguage } from "@/i18n/language-context";
import { AppText, Button, Paper, StatusPill } from "./ui";
const labels: Partial<Record<ObjectKind, MessageKey>> = {
  cup: "objectCup",
  spoon: "objectSpoon",
  fork: "objectFork",
  knife: "objectKnife",
  bottle: "objectBottle",
  jar: "objectJar",
  can: "objectCan",
  carton: "objectCarton",
  bag: "objectBag",
  battery: "objectBattery",
  phone: "objectPhone",
  textile: "objectTextile",
};
export function ObjectCandidateResultView({
  result,
  onGuide,
}: {
  result: ObjectPhotoResponse;
  onGuide: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Paper>
      <StatusPill label={t("objectCandidateUnverified")} tone="amber" />
      <AppText accessibilityRole="header" variant="heading" testID="object-candidate-title">
        {t("objectCandidateTitle")}
      </AppText>
      {result.status === "observed" ? (
        <>
          <AppText accessibilityLiveRegion="polite" testID="object-candidate-result">
            {result.observation.focus === "single"
              ? result.observation.candidates
                  .map((kind) => t(labels[kind] ?? "objectCandidateUnknown"))
                  .join(" · ")
              : t(
                  result.observation.focus === "multiple"
                    ? "objectCandidateMultiple"
                    : "objectCandidateUnknown",
                )}
          </AppText>
          <AppText>{t("objectCandidateLimit")}</AppText>
          <AppText variant="small" muted>
            {t("objectCandidateSource")} · {result.observation.source.checkedOn}
          </AppText>
        </>
      ) : (
        <AppText testID="object-candidate-unavailable">{t("objectCandidateUnavailable")}</AppText>
      )}
      <Button
        label={t("objectCandidateGuide")}
        variant="secondary"
        onPress={onGuide}
        testID="object-candidate-guide"
      />
    </Paper>
  );
}
