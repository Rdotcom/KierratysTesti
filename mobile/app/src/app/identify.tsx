import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { IconDisc } from "@/components/home-elements";
import {
  ActionRow,
  AppText,
  Chevron,
  PageHeader,
  PageIntro,
  Paper,
  Screen,
  sharedStyles,
} from "@/components/ui";
import { useLanguage } from "@/i18n/language-context";
import { focusRing, interaction, radius, spacing, useAppTheme } from "@/theme/tokens";

export default function IdentifyScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { palette } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const stackScan = fontScale > 1.2 || width < 360;
  const [scanFocused, setScanFocused] = useState(false);
  return (
    <Screen testID="identify-screen">
      <PageHeader onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <PageIntro title={t("identifyTitle")} body={t("identifyBody")} />
      <View style={sharedStyles.stack}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("identifyScanAction")}
          accessibilityHint={t("identifyScanDetail")}
          onPress={() => router.push("/scan")}
          onFocus={() => setScanFocused(true)}
          onBlur={() => setScanFocused(false)}
          testID="identify-scan-action"
          style={({ pressed }) => [
            styles.scanAction,
            stackScan && styles.scanStack,
            {
              backgroundColor: palette.pineSoft,
              borderColor: scanFocused ? palette.actionLink : "transparent",
              boxShadow: scanFocused ? focusRing(palette) : "none",
              opacity: pressed ? interaction.pressedOpacity : 1,
            },
          ]}
        >
          <IconDisc kind="scan" />
          <View style={[styles.scanCopy, !stackScan && sharedStyles.grow]}>
            <AppText variant="heading" style={styles.scanTitle}>
              {t("identifyScanAction")}
            </AppText>
            <AppText variant="small" muted>
              {t("identifyScanDetail")}
            </AppText>
          </View>
          {!stackScan && <Chevron />}
        </Pressable>
        <Paper>
          <ActionRow
            label={t("identifyManualAction")}
            detail={t("identifyManualDetail")}
            leading={stackScan ? undefined : <IconDisc kind="manual" compact />}
            onPress={() => router.push("/manual")}
            testID="identify-manual-action"
          />
          <ActionRow
            label={t("identifyPhotoAction")}
            detail={t("identifyPhotoDetail")}
            leading={stackScan ? undefined : <IconDisc kind="photo" compact blue />}
            onPress={() => router.push("/local-photo")}
            testID="identify-photo-action"
          />
        </Paper>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scanAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 176,
    padding: 20,
    borderWidth: 2,
    borderRadius: radius.lg,
  },
  scanStack: { flexDirection: "column", alignItems: "flex-start" },
  scanCopy: { minWidth: 0, flexShrink: 1, gap: spacing.xs },
  scanTitle: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.5 },
});
