import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
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
import { useSoundFeedback } from "@/features/sound-feedback/context";
import { useLanguage } from "@/i18n/language-context";
import { controls, interaction, radius, spacing, useAppTheme } from "@/theme/tokens";

export default function SettingsScreen() {
  const router = useRouter();
  const { t, language, setLanguage, storageError } = useLanguage();
  const { palette } = useAppTheme();
  const sound = useSoundFeedback();
  const [soundFocused, setSoundFocused] = useState(false);
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
        <Paper testID="sound-feedback-settings">
          <View style={styles.soundRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading" accessibilityRole="header">
                {t("soundFeedbackTitle")}
              </AppText>
              <AppText variant="small" muted>
                {t(
                  sound.preference === "loading"
                    ? "soundFeedbackLoading"
                    : sound.preference === "on"
                      ? "soundFeedbackOn"
                      : "soundFeedbackOff",
                )}
              </AppText>
            </View>
            <Pressable
              testID="sound-feedback-switch"
              accessibilityRole="switch"
              accessibilityLabel={t("soundFeedbackTitle")}
              accessibilityHint={t("soundFeedbackBody")}
              accessibilityState={{
                checked: sound.preference === "on",
                disabled: sound.preference === "loading" || sound.saving,
              }}
              aria-checked={sound.preference === "on"}
              {...(Platform.OS === "web"
                ? {
                    onKeyDown: (event: unknown) => {
                      // RN Web handles Enter, but its Pressable only handles Space
                      // for button roles, not ARIA switches. Preserve both keys.
                      if (typeof event !== "object" || event === null || !("key" in event)) return;
                      if (event.key !== " " && event.key !== "Spacebar") return;
                      if (
                        !("preventDefault" in event) ||
                        typeof event.preventDefault !== "function"
                      )
                        return;
                      event.preventDefault();
                      if (
                        !("repeat" in event && event.repeat === true) &&
                        sound.preference !== "loading" &&
                        !sound.saving
                      )
                        void sound.setEnabled(sound.preference !== "on");
                    },
                  }
                : {})}
              disabled={sound.preference === "loading" || sound.saving}
              onPress={() => void sound.setEnabled(sound.preference !== "on")}
              onFocus={() => setSoundFocused(true)}
              onBlur={() => setSoundFocused(false)}
              style={({ pressed }) => [
                styles.soundSwitch,
                {
                  borderColor: soundFocused ? palette.actionLink : "transparent",
                  opacity: pressed || sound.saving ? interaction.pressedOpacity : 1,
                },
              ]}
            >
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.soundTrack,
                  {
                    backgroundColor:
                      sound.preference === "on" ? palette.actionPrimary : palette.textSecondary,
                    alignItems: sound.preference === "on" ? "flex-end" : "flex-start",
                  },
                ]}
              >
                <View style={[styles.soundThumb, { backgroundColor: palette.bgSurface }]} />
              </View>
            </Pressable>
          </View>
          <AppText variant="small" muted>
            {t("soundFeedbackBody")}
          </AppText>
          {sound.preference === "error" && (
            <AppText accessibilityRole="alert">{t("soundFeedbackError")}</AppText>
          )}
          {sound.unavailable && (
            <AppText variant="small" muted>
              {t("soundFeedbackUnavailable")}
            </AppText>
          )}
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
  soundSwitch: {
    minHeight: controls.minimumTouchTarget,
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 14,
  },
  soundTrack: { width: 52, height: 30, borderRadius: 15, padding: 4, justifyContent: "center" },
  soundThumb: { width: 22, height: 22, borderRadius: 11 },
  soundRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
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
