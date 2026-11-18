import { networkModelId } from "@kierratysappi/contracts/network-recognition";
import type { MessageKey } from "@kierratysappi/localization";
import type { SortableObjectKind } from "@kierratysappi/recycling-engine";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import type { ObjectPhotoResponse } from "@/features/local-vision/object-candidates";
import {
  objectCandidateChoices,
  selectableObjectCandidates,
} from "@/features/local-vision/object-selection";
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
  const [rejectedResult, setRejectedResult] = useState<ObjectPhotoResponse>();
  const rejected = rejectedResult === result;
  const { primary, alternatives } = objectCandidateChoices(result, rejected);
  const alternativesRef = useRef<ComponentRef<typeof View>>(null);
  const [selection, setSelection] = useState<{
    result: ObjectPhotoResponse;
    kind: SortableObjectKind;
  }>();
  const current =
    selection?.result === result && candidates.includes(selection.kind) ? selection : undefined;
  const headingKind = current?.kind ?? primary;
  useEffect(() => {
    if (rejected && !current) {
      alternativesRef.current?.focus();
      announceAccessibility(t("objectCandidateOther"));
    }
  }, [rejected, current, t]);
  return (
    <Paper>
      <StatusPill label={t("objectCandidateUnverified")} tone="amber" />
      <AppText accessibilityRole="header" variant="heading" testID="object-candidate-title">
        {headingKind
          ? t(labels[headingKind] ?? "objectCandidateUnknown")
          : t("objectCandidateTitle")}
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
                  primary
                    ? "objectCandidateConfirm"
                    : candidates.length
                      ? rejected
                        ? "objectCandidateOther"
                        : "objectCandidateUnclear"
                      : result.observation.focus === "multiple"
                        ? "objectCandidateMultiple"
                        : "objectCandidateUnknown",
                )}
              </AppText>
              {primary ? (
                <View style={sharedStyles.tightStack}>
                  <Button
                    label={t("objectCandidateYes")}
                    accessibilityHint={t("objectSortingConfirmHint")}
                    onPress={() => setSelection({ result, kind: primary })}
                    testID="object-confirm-yes"
                  />
                  <Button
                    label={t("objectCandidateNo")}
                    variant="secondary"
                    onPress={() => setRejectedResult(result)}
                    testID="object-confirm-no"
                  />
                </View>
              ) : (
                candidates.length > 0 && (
                  <View
                    ref={alternativesRef}
                    tabIndex={-1}
                    accessibilityLabel={t(
                      rejected ? "objectCandidateOther" : "objectCandidateUnclear",
                    )}
                    style={sharedStyles.tightStack}
                    testID="object-alternatives"
                  >
                    <AppText variant="small" muted>
                      {t("objectCandidateChooseHint")}
                    </AppText>
                    {alternatives.map((kind) => (
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
                )
              )}
              <AppText>{t("objectCandidateLimit")}</AppText>
            </>
          )}
          <AppText variant="small" muted>
            {t(
              result.observation.source.modelId === networkModelId
                ? "networkCandidateSource"
                : "objectCandidateSource",
            )}{" "}
            · {result.observation.source.checkedOn}
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
