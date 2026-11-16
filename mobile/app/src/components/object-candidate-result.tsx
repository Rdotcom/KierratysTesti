import type { MessageKey } from "@kierratysappi/localization";
import { localizedText } from "@kierratysappi/localization";
import { evaluateObjectSorting, type SortableObjectKind } from "@kierratysappi/recycling-engine";
import { useState } from "react";
import { Linking, View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import type { ObjectKind, ObjectPhotoResponse } from "@/features/local-vision/object-candidates";
import { selectableObjectCandidates } from "@/features/local-vision/object-selection";
import { useLanguage } from "@/i18n/language-context";
import { AppText, Button, InlineLink, Paper, StatusPill, sharedStyles } from "./ui";
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
  const { t, language } = useLanguage();
  const candidates = selectableObjectCandidates(result);
  const [selection, setSelection] = useState<{
    result: ObjectPhotoResponse;
    kind: SortableObjectKind;
    answers: string[];
    evaluatedAt: string;
  }>();
  // A new/cancelled capture must never inherit a previous object's answers.
  const current =
    selection?.result === result && candidates.includes(selection.kind) ? selection : undefined;
  const step = current
    ? evaluateObjectSorting({
        kind: current.kind,
        answers: current.answers,
        evaluatedAt: current.evaluatedAt,
      })
    : undefined;
  const answerLabels =
    current?.answers
      .map((answer, index) => {
        const previous = evaluateObjectSorting({
          kind: current.kind,
          answers: current.answers.slice(0, index),
          evaluatedAt: current.evaluatedAt,
        });
        return previous.status === "question"
          ? previous.choices.find((option) => option.id === answer)?.label
          : undefined;
      })
      .filter((label) => label !== undefined) ?? [];
  const choose = (kind: SortableObjectKind, answers: string[] = []) => {
    if (!candidates.includes(kind)) return;
    const next = {
      result,
      kind,
      answers,
      evaluatedAt: current?.evaluatedAt ?? new Date().toISOString(),
    };
    const outcome = evaluateObjectSorting({ kind, answers, evaluatedAt: next.evaluatedAt });
    setSelection(next);
    announceAccessibility(
      localizedText(
        language,
        outcome.status === "question"
          ? outcome.title
          : outcome.status === "guidance"
            ? outcome.destination
            : outcome.explanation,
      ),
    );
  };
  return (
    <Paper>
      <StatusPill label={t("objectCandidateUnverified")} tone="amber" />
      <AppText accessibilityRole="header" variant="heading" testID="object-candidate-title">
        {current ? t(labels[current.kind] ?? "objectCandidateUnknown") : t("objectCandidateTitle")}
      </AppText>
      {result.status === "observed" ? (
        <>
          {!current && (
            <AppText accessibilityLiveRegion="polite" testID="object-candidate-result">
              {candidates.length > 0
                ? t("objectCandidateChoose")
                : t(
                    result.observation.focus === "multiple"
                      ? "objectCandidateMultiple"
                      : "objectCandidateUnknown",
                  )}
            </AppText>
          )}
          {!current && candidates.length > 0 && (
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
                  onPress={() => choose(kind)}
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
          {current && step && (
            <View style={sharedStyles.stack} testID="object-sorting-flow">
              <AppText variant="small" muted>
                {t("objectSortingBasedOnAnswers")}
              </AppText>
              {answerLabels.length > 0 && (
                <AppText variant="small" testID="object-sorting-answers">
                  {answerLabels.map((label) => localizedText(language, label)).join(" · ")}
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
                  {step.choices.map((option) => (
                    <Button
                      key={option.id}
                      variant="secondary"
                      label={localizedText(language, option.label)}
                      onPress={() => choose(current.kind, [...current.answers, option.id])}
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
                    step.exceptions.map((exception) => (
                      <AppText key={exception.en}>{localizedText(language, exception)}</AppText>
                    ))}
                  {step.sources.map((reference) => (
                    <View
                      key={reference.id}
                      style={sharedStyles.tightStack}
                      testID="object-sorting-source"
                    >
                      <InlineLink
                        label={reference.sourceName}
                        onPress={() => void Linking.openURL(reference.sourceUrl)}
                      />
                      <AppText variant="small" muted>
                        {t("ruleJurisdictionLabel")}:{" "}
                        {reference.jurisdiction === "FI-HSY" ? t("objectSortingHsy") : "FI"} ·{" "}
                        {t("checkedLabel")}: {reference.checkedAt}
                      </AppText>
                      <AppText variant="small" muted>
                        {t("ruleVersionLabel")}: {reference.version} · {t("ruleVerificationLabel")}:{" "}
                        {t("verificationVerified")}
                      </AppText>
                    </View>
                  ))}
                </>
              )}
              <Button
                variant="quiet"
                label={t(current.answers.length ? "objectSortingBack" : "objectSortingChange")}
                onPress={() =>
                  current.answers.length
                    ? choose(current.kind, current.answers.slice(0, -1))
                    : setSelection(undefined)
                }
                testID="object-sorting-back"
              />
              {current.answers.length > 0 && (
                <Button
                  variant="quiet"
                  label={t("objectSortingChange")}
                  onPress={() => setSelection(undefined)}
                  testID="object-sorting-change"
                />
              )}
            </View>
          )}
          {!current && <AppText>{t("objectCandidateLimit")}</AppText>}
          <AppText variant="small" muted>
            {t("objectCandidateSource")} · {result.observation.source.checkedOn}
          </AppText>
        </>
      ) : (
        <AppText testID="object-candidate-unavailable">{t("objectCandidateUnavailable")}</AppText>
      )}
      {((!current && candidates.length === 0) || step?.status === "unknown") && (
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
