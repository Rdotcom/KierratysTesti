import type { MessageKey } from "@kierratysappi/localization";
import type { SortableObjectKind } from "@kierratysappi/recycling-engine";
import { useState } from "react";
import { View } from "react-native";
import type { ObjectPhotoResponse } from "@/features/local-vision/object-candidates";
import { selectableObjectCandidates } from "@/features/local-vision/object-selection";
import { recyclingIntent } from "@/features/overview/recording";
import { useLanguage } from "@/i18n/language-context";
import { ObjectSortingFlowView } from "./object-sorting-flow";
import { AppText, Button, Paper, StatusPill, sharedStyles } from "./ui";

const labels: Partial<Record<SortableObjectKind, MessageKey>> = {
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
  recordId,
}: {
  result: ObjectPhotoResponse;
  onGuide: () => void;
  recordId?: string;
}) {
  const { t } = useLanguage(),
    candidates = selectableObjectCandidates(result);
  const [selection, setSelection] = useState<{
    result: ObjectPhotoResponse;
    kind: SortableObjectKind;
  }>();
  const current =
    selection?.result === result && candidates.includes(selection.kind) ? selection : undefined;
  return (
    <Paper>
      <StatusPill label={t("objectCandidateUnverified")} tone="amber" />
      <AppText accessibilityRole="header" variant="heading" testID="object-candidate-title">
        {current ? t(labels[current.kind] ?? "objectCandidateUnknown") : t("objectCandidateTitle")}
      </AppText>
      {result.status === "observed" ? (
        <>
          {current ? (
            <ObjectSortingFlowView
              key={current.kind}
              kind={current.kind}
              recordId={recordId ?? recyclingIntent(result, "object")}
              label={t(labels[current.kind] ?? "objectCandidateUnknown")}
              onChangeObject={() => setSelection(undefined)}
            />
          ) : (
            <>
              <AppText accessibilityLiveRegion="polite" testID="object-candidate-result">
                {t(
                  candidates.length
                    ? "objectCandidateChoose"
                    : result.observation.focus === "multiple"
                      ? "objectCandidateMultiple"
                      : "objectCandidateUnknown",
                )}
              </AppText>
              {candidates.length > 0 && (
                <View style={sharedStyles.tightStack}>
                  <AppText variant="small" muted>
                    {t("objectCandidateChooseHint")}
                  </AppText>
                  {candidates.map((kind) => (
                    <Button
                      key={kind}
                      label={t(labels[kind] ?? "objectCandidateUnknown")}
                      variant="secondary"
                      accessibilityHint={t("objectSortingConfirmHint")}
                      onPress={() => setSelection({ result, kind })}
                      testID={`object-choice-${kind}`}
                    />
                  ))}
                  <Button
                    label={t("objectCandidateNone")}
                    variant="quiet"
                    onPress={onGuide}
                    testID="object-choice-none"
                  />
                </View>
              )}
              <AppText>{t("objectCandidateLimit")}</AppText>
            </>
          )}
          <AppText variant="small" muted>
            {t("objectCandidateSource")} · {result.observation.source.checkedOn}
          </AppText>
        </>
      ) : (
        <AppText testID="object-candidate-unavailable">{t("objectCandidateUnavailable")}</AppText>
      )}
      {!current && !candidates.length && (
        <Button
          label={t("objectCandidateGuide")}
          variant="secondary"
          onPress={onGuide}
          testID="object-candidate-guide"
        />
      )}
    </Paper>
  );
}
