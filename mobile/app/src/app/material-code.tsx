import {
  MATERIAL_CODE_INPUT_MAX_LENGTH,
  type MaterialCodeParseResult,
  parseMaterialIdentificationCode,
  type RecognizedMaterialCode,
} from "@kierratysappi/domain";
import { localizedText } from "@kierratysappi/localization";
import type { SortingResult } from "@kierratysappi/recycling-engine";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Keyboard, Linking, type ScrollView, StyleSheet, TextInput, View } from "react-native";
import { RecycleAction } from "@/components/recycle-action";
import { SortingResultCard } from "@/components/sorting-result";
import {
  AppText,
  Button,
  InlineLink,
  PageHeader,
  PageIntro,
  Paper,
  Rule,
  Screen,
  StatusPill,
  sharedStyles,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { materialCodePrefill } from "@/features/material-code/prefill";
import { sortRecognizedMaterialCode } from "@/features/material-code/sorting";
import { recyclingIntent } from "@/features/overview/recording";
import { useLanguage } from "@/i18n/language-context";
import { codeFontFamily } from "@/theme/fonts";
import { radius, spacing, useAppTheme } from "@/theme/tokens";

export default function MaterialCodeScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { palette } = useAppTheme();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const prefill = materialCodePrefill(params.code);
  // Static HTML has no request query. Keep its first render identical to the
  // hydration render, then apply the validated suggestion as editable state.
  // Otherwise React can retain the server's disabled Check button even while
  // the controlled input shows the client query value.
  const [value, setValue] = useState("");
  const [attempt, setAttempt] = useState<MaterialCodeParseResult>();
  const [sorting, setSorting] = useState<SortingResult>();
  const [focused, setFocused] = useState(false);
  const [recordingScope] = useState(() => ({}));
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [resultY, setResultY] = useState(0);

  useEffect(() => {
    setValue(prefill);
    setAttempt(undefined);
    setSorting(undefined);
  }, [prefill]);

  useEffect(() => {
    if (attempt && resultY > 0)
      scrollRef.current?.scrollTo({ y: Math.max(0, resultY - 16), animated: false });
  }, [attempt, resultY]);

  const parse = () => {
    Keyboard.dismiss();
    const nextAttempt = parseMaterialIdentificationCode(value);
    setAttempt(nextAttempt);
    const nextSorting =
      nextAttempt.status === "recognized"
        ? sortRecognizedMaterialCode({
            recognition: nextAttempt,
            language,
            observedAt: new Date().toISOString(),
            componentId: `material-code-${Date.now()}`,
          })
        : undefined;
    setSorting(nextSorting);
    announceAccessibility(
      nextSorting
        ? sortingAnnouncement(nextSorting, language)
        : nextAttempt.status === "ambiguous"
          ? t("materialCodeAmbiguousTitle")
          : t("materialCodeUnknownTitle"),
      nextAttempt.status === "recognized" ? "default" : "high",
    );
  };

  return (
    <Screen scrollRef={scrollRef}>
      <PageHeader onBack={() => router.back()} />
      <PageIntro title={t("materialCodeTitle")} body={t("materialCodeBody")} />

      <View style={styles.form}>
        <View style={sharedStyles.tightStack}>
          <AppText variant="label" nativeID="material-code-label">
            {t("materialCodeLabel")}
          </AppText>
          <TextInput
            accessibilityLabel={t("materialCodeLabel")}
            accessibilityLabelledBy="material-code-label"
            accessibilityHint={t("materialCodeHint")}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect={false}
            inputMode="text"
            maxLength={MATERIAL_CODE_INPUT_MAX_LENGTH}
            onChangeText={(text) => {
              setValue(text);
              setAttempt(undefined);
              setSorting(undefined);
            }}
            onSubmitEditing={parse}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="05 PP"
            placeholderTextColor={palette.faint}
            returnKeyType="search"
            style={[
              styles.input,
              {
                backgroundColor: palette.surfaceRaised,
                borderColor:
                  attempt && attempt.status !== "recognized"
                    ? palette.brick
                    : focused
                      ? palette.actionPrimary
                      : palette.borderStrong,
                color: palette.ink,
              },
            ]}
            value={value}
          />
          <AppText variant="small" muted>
            {t("materialCodeHint")}
          </AppText>
        </View>
        <Button
          label={t("materialCodeParseAction")}
          onPress={parse}
          disabled={value.trim().length === 0}
        />
        <AppText variant="small" muted>
          {t("materialCodeLocalNote")}
        </AppText>
      </View>

      {attempt && (
        <View
          accessibilityLiveRegion="polite"
          style={styles.result}
          testID="material-code-result"
          onLayout={(event) => setResultY(event.nativeEvent.layout.y)}
        >
          {attempt.status === "recognized" ? (
            <RecognizedCode
              recognition={attempt}
              sorting={sorting}
              recordId={recyclingIntent(recordingScope, "material-code")}
            />
          ) : (
            <UnresolvedCode attempt={attempt} onManual={() => router.push("/component")} />
          )}
        </View>
      )}
    </Screen>
  );
}

function sortingAnnouncement(result: SortingResult, language: "fi" | "en"): string {
  if (result.status === "resolved") return localizedText(language, result.destination.label);
  if (result.status === "ambiguous") return localizedText(language, result.question);
  return localizedText(language, result.nextAction);
}

function RecognizedCode({
  recognition,
  sorting,
  recordId,
}: {
  readonly recognition: RecognizedMaterialCode;
  readonly sorting?: SortingResult;
  readonly recordId: string;
}) {
  const { language, t } = useLanguage();
  const { palette } = useAppTheme();

  return (
    <View style={sharedStyles.stack}>
      <View style={[styles.codePlate, { borderColor: palette.borderSubtle }]}>
        <AppText style={styles.code}>{recognition.canonicalCode}</AppText>
        <AppText variant="label">{localizedText(language, recognition.materialName)}</AppText>
        <AppText variant="small" muted>
          {recognition.precision === "exact" ? t("identifierExact") : t("identifierGroup")}
        </AppText>
      </View>
      {sorting && (
        <>
          <SortingResultCard result={sorting} />
          <RecycleAction
            sorting={sorting}
            material={recognition.materialFamily}
            recordId={recordId}
            label={recognition.canonicalCode}
          />
        </>
      )}
      <AppText variant="small" muted>
        {t("materialCodeRecognizedBody")}
      </AppText>
      <Rule />
      <View style={sharedStyles.tightStack}>
        <AppText variant="small" muted>
          {t("materialCodeSource")}
        </AppText>
        <InlineLink
          label={recognition.source.sourceName}
          onPress={() => void Linking.openURL(recognition.source.sourceUrl)}
        />
        <AppText variant="small" muted>
          {recognition.source.jurisdiction} · {recognition.source.version} · {t("checkedLabel")}:{" "}
          {recognition.source.checkedAt}
        </AppText>
      </View>
    </View>
  );
}

function UnresolvedCode({
  attempt,
  onManual,
}: {
  readonly attempt: Exclude<MaterialCodeParseResult, { status: "recognized" }>;
  readonly onManual: () => void;
}) {
  const { t } = useLanguage();
  const { palette } = useAppTheme();
  const ambiguous = attempt.status === "ambiguous";

  return (
    <Paper style={{ borderColor: ambiguous ? palette.amber : palette.brick }}>
      <StatusPill
        label={ambiguous ? t("needsCheckLabel") : t("confidenceUnknown")}
        tone={ambiguous ? "amber" : "brick"}
      />
      <AppText variant="heading" accessibilityRole="alert">
        {ambiguous ? t("materialCodeAmbiguousTitle") : t("materialCodeUnknownTitle")}
      </AppText>
      <AppText>{ambiguous ? t("materialCodeAmbiguousBody") : t("materialCodeUnknownBody")}</AppText>
      {ambiguous && attempt.candidateCodes.length > 0 && (
        <View style={sharedStyles.tightStack}>
          <AppText variant="small" muted>
            {t("materialCodeCandidates")}
          </AppText>
          <AppText>{attempt.candidateCodes.join(" · ")}</AppText>
        </View>
      )}
      <Button label={t("manualComponentAction")} variant="secondary" onPress={onManual} />
    </Paper>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  input: {
    minHeight: 60,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: codeFontFamily,
    fontSize: 20,
    letterSpacing: 1.2,
  },
  result: { paddingTop: spacing.md },
  codePlate: {
    borderLeftWidth: 2,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  code: {
    fontFamily: codeFontFamily,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -1,
  },
});
