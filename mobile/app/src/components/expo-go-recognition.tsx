import { useRouter } from "expo-router";
import { View } from "react-native";
import { useLanguage } from "@/i18n/language-context";
import { AppText, Button, PageHeader, PageIntro, Screen, sharedStyles } from "./ui";

/** A real capability boundary: no camera hook, photo capture, upload or invented result. */
export function ExpoGoRecognition({ networkSetup = false }: { networkSetup?: boolean }) {
  const router = useRouter();
  const { t } = useLanguage();
  return (
    <Screen testID="expo-go-recognition-screen">
      <PageHeader
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/identify"))}
      />
      <PageIntro title={t("expoGoRecognitionTitle")} body={t("expoGoRecognitionBody")} />
      {networkSetup && <AppText>{t("networkSetup")}</AppText>}
      <AppText>{t("expoGoAvailable")}</AppText>
      <View style={sharedStyles.stack}>
        <Button
          label={t("identifyScanAction")}
          onPress={() => router.push("/scan")}
          testID="expo-go-barcode-action"
        />
        <Button
          label={t("identifyManualAction")}
          variant="secondary"
          onPress={() => router.push("/manual")}
          testID="expo-go-manual-action"
        />
        <Button
          label={t("expoGoManualTitle")}
          variant="secondary"
          onPress={() => router.push("/guide")}
          testID="expo-go-guide-action"
        />
        <Button
          label={t("materialCodeAction")}
          variant="quiet"
          onPress={() => router.push("/material-code")}
          testID="expo-go-material-code-action"
        />
      </View>
    </Screen>
  );
}
