import { parseGtin } from "@kierratysappi/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  AppText,
  Button,
  ChoiceIndicator,
  PageHeader,
  PageIntro,
  Paper,
  Screen,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { saveFeedbackDraft } from "@/features/history/storage";
import { useLanguage } from "@/i18n/language-context";
import { appFontFamily } from "@/theme/fonts";
import { radius, spacing, useAppTheme } from "@/theme/tokens";

const CATEGORIES = [
  ["wrong_product", "feedbackWrongProduct"],
  ["wrong_packaging", "feedbackWrongPackaging"],
  ["wrong_sorting", "feedbackWrongSorting"],
  ["missing_data", "feedbackMissing"],
] as const;

export default function FeedbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ gtin?: string; category?: string }>();
  const { palette } = useAppTheme();
  const { t } = useLanguage();
  const initialCategory = CATEGORIES.some(([value]) => value === params.category)
    ? params.category
    : undefined;
  const [category, setCategory] = useState<string | undefined>(initialCategory);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [focused, setFocused] = useState(false);

  const save = async () => {
    if (!category) return;
    const gtin = parseGtin(typeof params.gtin === "string" ? params.gtin : "");
    setSaveError(false);
    try {
      await saveFeedbackDraft({
        gtin: gtin.ok ? gtin.value : undefined,
        category,
        note: note.trim().slice(0, 2_000),
        createdAt: new Date().toISOString(),
      });
      setSaved(true);
      announceAccessibility(t("draftSaved"));
    } catch {
      setSaved(false);
      setSaveError(true);
      announceAccessibility(t("feedbackSaveError"), "high");
    }
  };

  return (
    <Screen>
      <PageHeader onBack={() => router.back()} />
      <PageIntro title={t("feedbackTitle")} body={t("feedbackBody")} />
      <View style={styles.form}>
        <View
          style={styles.categories}
          accessibilityRole="radiogroup"
          accessibilityLabel={t("feedbackCategory")}
        >
          {CATEGORIES.map(([value, key]) => {
            const selected = category === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                onPress={() => {
                  setCategory(value);
                  setSaved(false);
                }}
                style={({ pressed }) => [
                  styles.category,
                  {
                    backgroundColor: selected ? palette.pineSoft : palette.surface,
                    borderColor: selected ? palette.pine : palette.line,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <ChoiceIndicator selected={selected} />
                <AppText
                  variant="label"
                  style={{ color: selected ? palette.pine : palette.ink, flexShrink: 1 }}
                >
                  {t(key)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <AppText variant="label" nativeID="feedback-note">
          {t("feedbackNote")}
        </AppText>
        <AppText variant="small" muted>
          {t("feedbackPrivacyCaution")}
        </AppText>
        <TextInput
          accessibilityLabel={t("feedbackNote")}
          accessibilityLabelledBy="feedback-note"
          multiline
          maxLength={2_000}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={(value) => {
            setNote(value);
            setSaved(false);
          }}
          style={[
            styles.input,
            {
              backgroundColor: palette.surfaceRaised,
              borderColor: focused ? palette.actionPrimary : palette.borderStrong,
              color: palette.ink,
            },
          ]}
          textAlignVertical="top"
          value={note}
        />
        <Button label={t("saveDraft")} onPress={() => void save()} disabled={!category} />
        {saveError && <AppText accessibilityRole="alert">{t("feedbackSaveError")}</AppText>}
        {saved && (
          <Paper style={{ backgroundColor: palette.pineSoft }}>
            <AppText variant="heading" style={{ color: palette.pine }} accessibilityRole="alert">
              {t("draftSaved")}
            </AppText>
            <AppText>{t("draftNotSent")}</AppText>
          </Paper>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  categories: { gap: spacing.xs },
  category: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  input: {
    minHeight: 140,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: appFontFamily,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
});
