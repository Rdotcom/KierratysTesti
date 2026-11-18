import { localizedText } from "@kierratysappi/localization";
import { evaluateObjectSorting, type SortableObjectKind } from "@kierratysappi/recycling-engine";
import { useState } from "react";
import { View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { recordingMaterialFromAnswer, recyclingIntent } from "@/features/overview/recording";
import { useSortingRegion } from "@/features/region/context";
import { openExternalUrl } from "@/features/security/external-links";
import { useLanguage } from "@/i18n/language-context";
import { RecyclingRecordAction } from "./recycle-action";
import { SortingRegionPicker } from "./sorting-region-picker";
import { AppText, Button, InlineLink, sharedStyles } from "./ui";

// Used by both manual search and actual image hints; never creates fake AI output.
export function ObjectSortingFlowView({
  kind,
  onChangeObject,
  showRegionControl = true,
  recordId,
  label,
}: {
  kind: SortableObjectKind;
  onChangeObject: () => void;
  showRegionControl?: boolean;
  recordId?: string;
  label?: string;
}) {
  const { t, language } = useLanguage(),
    { selection } = useSortingRegion();
  const key = `${kind}:${selection?.municipalityCode ?? "none"}`;
  const [state, setState] = useState({
    key,
    answers: [] as string[],
    evaluatedAt: new Date().toISOString(),
  });
  const [recordingScope] = useState(() => ({}));
  const current =
    state.key === key ? state : { key, answers: [], evaluatedAt: new Date().toISOString() };
  const input = (answers: string[]) => ({
    kind,
    answers,
    evaluatedAt: current.evaluatedAt,
    ...(selection ? { region: selection.regionId } : {}),
  });
  const step = evaluateObjectSorting(input(current.answers));
  const recordedMaterial = current.answers.flatMap((answer, index) => {
    const previous = evaluateObjectSorting(input(current.answers.slice(0, index)));
    const material =
      previous.status === "question" ? recordingMaterialFromAnswer(previous.id, answer) : undefined;
    return material ? [material] : [];
  })[0];
  const labels = current.answers.flatMap((answer, index) => {
    const previous = evaluateObjectSorting(input(current.answers.slice(0, index)));
    const label =
      previous.status === "question"
        ? previous.choices.find((c) => c.id === answer)?.label
        : undefined;
    return label ? [localizedText(language, label)] : [];
  });
  const choose = (answers: string[]) => {
    const next = evaluateObjectSorting(input(answers));
    setState({ ...current, answers });
    announceAccessibility(
      localizedText(
        language,
        next.status === "question"
          ? next.title
          : next.status === "guidance"
            ? next.destination
            : next.explanation,
      ),
    );
  };
  return (
    <View style={sharedStyles.stack} testID="object-sorting-flow">
      <AppText variant="small" muted>
        {t("objectSortingBasedOnAnswers")}
      </AppText>
      {labels.length > 0 && (
        <AppText variant="small" testID="object-sorting-answers">
          {labels.join(" · ")}
        </AppText>
      )}
      {step.status === "question" ? (
        <>
          <AppText
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            variant="heading"
            testID="object-sorting-heading"
          >
            {localizedText(language, step.title)}
          </AppText>
          {step.detail && <AppText>{localizedText(language, step.detail)}</AppText>}
          {step.id === "region" && showRegionControl && <SortingRegionPicker />}
          {step.choices.map((option) => (
            <Button
              key={option.id}
              variant="secondary"
              label={localizedText(language, option.label)}
              onPress={() => choose([...current.answers, option.id])}
              accessibilityHint={t("objectSortingConfirmHint")}
              testID={`object-answer-${step.id}-${option.id}`}
            />
          ))}
        </>
      ) : (
        <>
          <AppText
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            variant="heading"
            testID="object-sorting-heading"
          >
            {step.status === "guidance"
              ? localizedText(language, step.destination)
              : t("objectSortingUnknown")}
          </AppText>
          {step.status === "guidance" && (
            <AppText testID="object-sorting-preparation">
              {localizedText(language, step.preparation)}
            </AppText>
          )}
          <AppText testID="object-sorting-explanation">
            {localizedText(language, step.explanation)}
          </AppText>
          {step.status === "guidance" &&
            step.exceptions.map((e) => <AppText key={e.en}>{localizedText(language, e)}</AppText>)}
          {step.status === "guidance" && (
            <RecyclingRecordAction
              recordId={recordId ?? recyclingIntent(recordingScope, "object")}
              material={recordedMaterial}
              label={label ?? localizedText(language, step.destination)}
            />
          )}
          {step.sources.map((reference) => (
            <View key={reference.id} style={sharedStyles.tightStack} testID="object-sorting-source">
              <InlineLink
                label={reference.sourceName}
                onPress={() => void openExternalUrl(reference.sourceUrl).catch(() => undefined)}
              />
              <AppText variant="small" muted>
                {t("ruleJurisdictionLabel")}: {reference.jurisdiction} · {t("checkedLabel")}:{" "}
                {reference.checkedAt}
              </AppText>
              <AppText variant="small" muted>
                {t("ruleVersionLabel")}: {reference.version} · {t("ruleVerificationLabel")}:{" "}
                {t("verificationVerified")}
              </AppText>
            </View>
          ))}
          {showRegionControl && <SortingRegionPicker />}
        </>
      )}
      <Button
        variant="quiet"
        label={t(current.answers.length ? "objectSortingBack" : "objectSortingChange")}
        onPress={() =>
          current.answers.length ? choose(current.answers.slice(0, -1)) : onChangeObject()
        }
        testID="object-sorting-back"
      />
      {current.answers.length > 0 && (
        <Button
          variant="quiet"
          label={t("objectSortingChange")}
          onPress={onChangeObject}
          testID="object-sorting-change"
        />
      )}
    </View>
  );
}
