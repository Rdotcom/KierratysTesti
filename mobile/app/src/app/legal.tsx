import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import {
  AppText,
  Button,
  DocumentSection,
  PageHeader,
  PageIntro,
  Paper,
  InlineLink,
  Screen,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { clearAllLocalData } from "@/features/history/storage";
import { useSoundFeedback } from "@/features/sound-feedback/context";
import { useLanguage } from "@/i18n/language-context";
import { useAppTheme } from "@/theme/tokens";

export default function LegalScreen() {
  const router = useRouter();
  const { palette } = useAppTheme();
  const { t, language, setLanguage } = useLanguage();
  const [deleted, setDeleted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const { reloadAfterDeletion } = useSoundFeedback();

  const deleteData = async () => {
    if (locked.current) return;
    locked.current = true;
    setDeleting(true);
    setFailed(false);
    try {
      await clearAllLocalData();
      reloadAfterDeletion();
      setLanguage(language);
      setDeleted(true);
      setConfirming(false);
      announceAccessibility(t("localDataDeleted"), "high");
    } catch {
      setFailed(true);
      announceAccessibility(t("localDataDeleteError"), "high");
    } finally {
      locked.current = false;
      setDeleting(false);
    }
  };
  return (
    <Screen>
      <PageHeader onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <PageIntro title={t("legalAction")} />
      <DocumentSection>
        <AppText variant="heading" accessibilityRole="header">
          {t("privacyTitle")}
        </AppText>
        <AppText>
          {Platform.OS === "android" ? t("androidPrivacyInformation") : t("privacyInformation")}
        </AppText>
        {Platform.OS === "android" && (
          <InlineLink
            label={t("androidPrivacyLink")}
            onPress={() =>
              void Linking.openURL(
                "https://developers.google.com/ml-kit/android-data-disclosure",
              ).catch(() => undefined)
            }
          />
        )}
        <AppText>{t("offlineCachePrivacy")}</AppText>
        <AppText>{t("offlineLibraryInfo")}</AppText>
        <AppText>{t("guideSourceAttribution")}</AppText>
        <AppText>{t("nearbyPrivacy")}</AppText>
        <AppText>{t("nearbyLocationHint")}</AppText>
        <AppText>{t("nearbyAddressDisclosure")}</AppText>
        <AppText variant="heading" accessibilityRole="header">
          {t("localVisionTitle")}
        </AppText>
        <AppText>{t("localVisionPrivacy")}</AppText>
        <AppText>{t("localVisionModelAttribution")}</AppText>
        <AppText>{t("objectDecoderAttribution")}</AppText>
        <AppText variant="heading" accessibilityRole="header">
          {t("localVisionCloud")}
        </AppText>
        <AppText>{t("photoPrivacy")}</AppText>
      </DocumentSection>
      <DocumentSection>
        <AppText variant="heading">{t("deleteLocalData")}</AppText>
        <AppText>{t("deleteLocalDataBody")}</AppText>
        <Button
          label={t("deleteLocalData")}
          variant="danger"
          disabled={deleting}
          onPress={() => {
            setConfirming(true);
            setDeleted(false);
            setFailed(false);
          }}
          testID="privacy-delete-action"
        />
        {confirming && (
          <Paper testID="privacy-delete-confirm-panel">
            <AppText variant="heading" accessibilityRole="header">
              {t("deleteLocalDataConfirmTitle")}
            </AppText>
            <AppText>{t("deleteLocalDataConfirmBody")}</AppText>
            {failed && (
              <AppText accessibilityRole="alert" style={{ color: palette.statusError }}>
                {t("localDataDeleteError")}
              </AppText>
            )}
            <Button
              label={t("deleteLocalDataConfirmAction")}
              variant="danger"
              busy={deleting}
              onPress={() => void deleteData()}
              testID="privacy-delete-confirm-action"
            />
            <Button
              label={t("cancel")}
              variant="secondary"
              disabled={deleting}
              onPress={() => setConfirming(false)}
              testID="privacy-delete-cancel"
            />
          </Paper>
        )}
        {deleted && (
          <AppText accessibilityRole="alert" style={{ color: palette.pine }}>
            {t("localDataDeleted")}
          </AppText>
        )}
      </DocumentSection>
      <DocumentSection>
        <AppText variant="heading">{t("sortingInformationTitle")}</AppText>
        <AppText>{t("sortingInformation")}</AppText>
      </DocumentSection>
    </Screen>
  );
}
