import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { IconDisc } from "@/components/home-elements";
import {
  ActionRow,
  AppText,
  ChoiceIndicator,
  PageHeader,
  PageIntro,
  Paper,
  Screen,
  sharedStyles,
} from "@/components/ui";
import { isHistoryEnabled } from "@/features/history/storage";
import { useLanguage } from "@/i18n/language-context";
import { controls, interaction, radius, spacing, useAppTheme } from "@/theme/tokens";

export default function SettingsScreen() {
  const router = useRouter();
  const { t, language, setLanguage, storageError } = useLanguage();
  const { palette } = useAppTheme();
  const [history, setHistory] = useState<boolean | "loading" | "error">("loading");
  const [focusedLanguage, setFocusedLanguage] = useState<"fi" | "en" | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      isHistoryEnabled()
        .then((enabled) => {
          if (active) setHistory(enabled);
        })
        .catch(() => {
          if (active) setHistory("error");
        });
      return () => {
        active = false;
      };
    }, []),
  );
  return (
    <Screen testID="settings-screen">
      <PageHeader onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <PageIntro title={t("settingsTitle")} />
      <View style={sharedStyles.stack}>
        <Paper>
          <AppText variant="heading" accessibilityRole="header">
            {t("settingsLanguage")}
          </AppText>
          <View
            style={styles.languages}
            accessibilityRole="radiogroup"
            accessibilityLabel={t("languageLabel")}
          >
            {(["fi", "en"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityLabel={item === "fi" ? t("finnish") : t("english")}
                accessibilityState={{ checked: language === item }}
                aria-checked={language === item}
                onPress={() => setLanguage(item)}
                onFocus={() => setFocusedLanguage(item)}
                onBlur={() => setFocusedLanguage(null)}
                testID={`settings-language-${item}`}
                style={({ pressed }) => [
                  styles.language,
                  {
                    backgroundColor: language === item ? palette.pineSoft : palette.bgSurface,
                    borderColor:
                      focusedLanguage === item
                        ? palette.actionLink
                        : language === item
                          ? palette.actionPrimary
                          : palette.borderSubtle,
                    opacity: pressed ? interaction.pressedOpacity : 1,
                  },
                ]}
              >
                <ChoiceIndicator selected={language === item} />
                <AppText variant="label" style={styles.languageLabel}>
                  {item === "fi" ? t("finnish") : t("english")}
                </AppText>
              </Pressable>
            ))}
          </View>
          {storageError && <AppText accessibilityRole="alert">{t("languageSaveError")}</AppText>}
        </Paper>
        <Paper>
          <ActionRow
            label={t("overviewTitle")}
            detail={t("overviewHomeDetail")}
            leading={<IconDisc kind="guide" compact />}
            onPress={() => router.push("/overview")}
            testID="settings-overview-action"
          />
          <ActionRow
            label={t("settingsHistory")}
            detail={t(
              history === "loading"
                ? "settingsLoading"
                : history === "error"
                  ? "settingsReadError"
                  : history
                    ? "homeHistoryOn"
                    : "homeHistoryOff",
            )}
            leading={<IconDisc kind="history" compact />}
            onPress={() => router.push("/history")}
            testID="settings-history-action"
          />
          <ActionRow
            label={t("settingsGuidance")}
            detail={t("homeJurisdiction")}
            leading={<IconDisc kind="guide" compact />}
            onPress={() => router.push("/guide")}
            testID="settings-guide-action"
          />
          <ActionRow
            label={t("legalAction")}
            onPress={() => router.push("/legal")}
            testID="settings-legal-action"
          />
        </Paper>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  languages: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  languageLabel: { flexShrink: 1 },
  language: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexGrow: 1,
    flexBasis: 128,
    minHeight: controls.minimumTouchTarget,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    justifyContent: "center",
  },
});
