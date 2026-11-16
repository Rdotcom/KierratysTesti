import type { GuideLibraryItem } from "@kierratysappi/recycling-engine";
import { Linking, View } from "react-native";
import { useLanguage } from "@/i18n/language-context";
import { guideLibrary } from "@/features/guide/library";
import { AppText, InlineLink, Paper, StatusPill, sharedStyles } from "./ui";
export function SourceGuideResult({ item }: { item: GuideLibraryItem }) {
  const { language, t } = useLanguage();
  if (!guideLibrary) return null;
  const library = guideLibrary;
  const data = item[language];
  return (
    <Paper testID="source-guide-result">
      <AppText
        variant="heading"
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        testID="source-guide-title"
      >
        {data.title}
      </AppText>
      <StatusPill label={t("guideSourceRegion")} tone="pine" />
      <AppText variant="small" muted>
        {t("confidenceLabel")}: {t("guideSourceAssumption")}
      </AppText>
      {data.wasteTypes.length > 0 && (
        <View style={sharedStyles.tightStack}>
          <AppText variant="label">{t("guideSourceWasteTypes")}</AppText>
          {data.wasteTypes.map((v) => (
            <AppText key={v.id}>{v.title}</AppText>
          ))}
        </View>
      )}
      {data.instructions.length > 0 && (
        <AppText testID="source-guide-instructions">{data.instructions}</AppText>
      )}
      {data.translationIncomplete && (
        <AppText variant="small">{t("guideTranslationIncomplete")}</AppText>
      )}
      <AppText variant="label">{t("guideSourceReceivers")}</AppText>
      {data.receivers.map((r) => (
        <View key={r.id} style={sharedStyles.tightStack} testID="source-guide-receiver">
          <AppText variant="label">{r.title}</AppText>
          {r.description.length > 0 && <AppText>{r.description}</AppText>}
          {r.url && (
            <InlineLink
              label={t("sourceLabel")}
              onPress={() =>
                void Linking.openURL(r.url ?? library.source.url).catch(() => undefined)
              }
            />
          )}
        </View>
      ))}
      <AppText variant="small" muted>
        {t("guideSourceCondition")}
      </AppText>
      <InlineLink
        label={t("guideSourceTitle")}
        onPress={() => void Linking.openURL(library.source.url).catch(() => undefined)}
      />
      <AppText variant="small" muted>
        {t("guideSourceAttribution")}
      </AppText>
      <AppText variant="small" muted>
        {t("ruleJurisdictionLabel")}: FI-HSY · {t("checkedLabel")}: {guideLibrary.checkedAt}
      </AppText>
      <AppText variant="small" muted>
        {t("ruleVersionLabel")}: {guideLibrary.version} · {t("ruleVerificationLabel")}:{" "}
        {t("verificationVerified")}
      </AppText>
      <AppText variant="small" muted>
        {t("sourceRecord")}: {item.id}
      </AppText>
    </Paper>
  );
}
