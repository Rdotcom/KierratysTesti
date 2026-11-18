import type { ProductLookupResult } from "@kierratysappi/contracts/lookup-schema";
import type { MaterialFamily, PackagingShape } from "@kierratysappi/domain";
import type { MessageKey } from "@kierratysappi/localization";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { PackagingMark } from "@/components/packaging-mark";
import { RecycleAction, RecyclingRecordAction } from "@/components/recycle-action";
import { SortingResultCard } from "@/components/sorting-result";
import {
  AppText,
  Button,
  InlineLink,
  PageHeader,
  Paper,
  Rule,
  Screen,
  SectionHeader,
  StatusPill,
  sharedStyles,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { lookupAnnouncement } from "@/features/accessibility/result-announcement";
import { recyclingIntent } from "@/features/overview/recording";
import { useScanSession } from "@/features/scan/session-context";
import { openExternalUrl } from "@/features/security/external-links";
import { useLanguage } from "@/i18n/language-context";
import { spacing, useAppTheme } from "@/theme/tokens";

export default function ResultScreen() {
  const router = useRouter();
  const { palette } = useAppTheme();
  const { language, t } = useLanguage();
  const { state, lookupBarcode, reset } = useScanSession();

  useEffect(() => {
    const announcement = lookupAnnouncement(state, t, language);
    if (announcement) announceAccessibility(announcement.message, announcement.priority);
  }, [language, state, t]);

  const startOver = () => {
    reset();
    router.replace("/");
  };

  if (state.status === "loading") {
    return (
      <Screen scroll={false} style={styles.centered} testID="result-loading-screen">
        <ActivityIndicator size="large" color={palette.pine} accessibilityLabel={t("loading")} />
        <AppText variant="title" style={styles.centerText}>
          {t("loading")}
        </AppText>
        <AppText variant="mono" muted>
          {state.gtin}
        </AppText>
      </Screen>
    );
  }

  if (state.status === "offline") {
    return (
      <StateScreen
        title={t("offlineTitle")}
        body={t("offlineBody")}
        code={state.gtin}
        primary={{ label: t("retry"), onPress: () => void lookupBarcode(state.gtin, "manual") }}
        secondary={{ label: t("materialGuideAction"), onPress: () => router.push("/guide") }}
        close={startOver}
        testID="result-offline-screen"
      />
    );
  }

  if (state.status === "invalid") {
    return (
      <StateScreen
        title={t("checkCode")}
        body={t("invalidGtin")}
        primary={{ label: t("manualEntry"), onPress: () => router.replace("/manual") }}
        close={startOver}
        testID="result-invalid-screen"
      />
    );
  }

  if (state.status !== "complete") {
    return (
      <StateScreen
        title={t("cameraTitle")}
        body={t("introBody")}
        primary={{ label: t("scanAction"), onPress: () => router.replace("/scan") }}
        close={startOver}
        testID="result-empty-screen"
      />
    );
  }

  const { result } = state;
  if (result.status === "not_found") {
    return (
      <StateScreen
        title={t("notFoundTitle")}
        body={t("notFoundBody")}
        code={result.gtin}
        primary={{ label: t("checkCode"), onPress: () => router.replace("/manual") }}
        secondary={{ label: t("materialGuideAction"), onPress: () => router.push("/guide") }}
        close={startOver}
        testID="result-not-found-screen"
      />
    );
  }

  if (result.status === "provider_unavailable") {
    return (
      <StateScreen
        title={t("providerUnavailableTitle")}
        body={t("providerUnavailableBody")}
        code={result.gtin}
        primary={{ label: t("retry"), onPress: () => void lookupBarcode(result.gtin, "manual") }}
        secondary={{ label: t("materialGuideAction"), onPress: () => router.push("/guide") }}
        close={startOver}
        testID="result-provider-unavailable-screen"
      />
    );
  }

  return <ProductResult result={result} onClose={startOver} />;
}

function ProductResult({
  result,
  onClose,
}: {
  readonly result: Extract<ProductLookupResult, { status: "resolved" | "packaging_missing" }>;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const { palette } = useAppTheme();
  const { language, t } = useLanguage();
  const name = result.product.name?.value ?? result.gtin;
  const brand = result.product.brands?.value.join(", ");
  const provenance = result.product.packagingCompleteness.provenance;

  return (
    <Screen testID="product-result-screen">
      <PageHeader onBack={onClose} label={t("close")} testID="result-close-action" />

      <View style={styles.answerIntro}>
        <AppText variant="small" muted>
          {t("productDetailsTitle")}
        </AppText>
        <AppText variant="title" accessibilityRole="header">
          {name}
        </AppText>
        {brand && <AppText muted>{brand}</AppText>}
        <AppText variant="small" muted>
          {t("resultScope")}
        </AppText>
      </View>

      {result.status === "packaging_missing" ? (
        <View style={styles.resultStack}>
          <Paper style={{ borderColor: palette.amber }} testID="packaging-missing-result">
            <StatusPill label={t("confidenceUnknown")} tone="amber" />
            <AppText variant="heading">{t("packagingMissingTitle")}</AppText>
            <AppText>{t("packagingMissingBody")}</AppText>
          </Paper>
          <RecyclingRecordAction
            recordId={recyclingIntent(result, "manual-material")}
            label={name}
          />
          <Button
            label={t("materialCodeAction")}
            onPress={() => router.push("./material-code")}
            testID="result-material-code-action"
          />
          <Button
            label={t("manualComponentAction")}
            variant="secondary"
            onPress={() => router.push("/component")}
            testID="result-manual-component-action"
          />
        </View>
      ) : (
        <View style={styles.resultStack}>
          <SectionHeader title={t("packagingParts")} />
          {result.components.map(({ observation, sorting }, index) => (
            <Paper key={observation.id} style={styles.componentBlock}>
              <View style={sharedStyles.row}>
                <PackagingMark material={observation.materialFamily?.value} />
                <View style={sharedStyles.grow}>
                  <AppText variant="small" muted>
                    {index + 1} / {result.components.length}
                  </AppText>
                  <AppText variant="heading">{componentLabel(observation, t)}</AppText>
                </View>
              </View>
              <Rule />
              <SortingResultCard result={sorting} embedded />
              <RecycleAction
                sorting={sorting}
                material={observation.materialFamily?.value}
                recordId={recyclingIntent(result, observation.id)}
                label={[result.product.name?.value, componentLabel(observation, t)]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </Paper>
          ))}
        </View>
      )}

      <View style={styles.nextActions}>
        <Button
          label={t("scanAnother")}
          variant={result.status === "packaging_missing" ? "secondary" : "primary"}
          onPress={onClose}
          testID="result-scan-another-action"
        />
        <Button
          label={t("correctionAction")}
          variant="secondary"
          onPress={() => router.push({ pathname: "/feedback", params: { gtin: result.gtin } })}
          testID="result-feedback-action"
        />
      </View>

      <View style={styles.productSummary}>
        <Rule />
        <SectionHeader title={t("productDetailsTitle")} />
        <View style={sharedStyles.tightStack}>
          <AppText variant="mono" muted>
            {result.gtin}
          </AppText>
        </View>
        <View style={styles.sourceRow}>
          <AppText variant="small" muted>
            {result.cache.hit ? t("cachedLabel") : t("liveLabel")}
          </AppText>
          <AppText variant="small" muted>
            {provenance.sourceName}
          </AppText>
        </View>
        <View style={sharedStyles.tightStack}>
          <AppText variant="small" muted>
            {t("communityDataLabel")} · {t("lastRetrievedLabel")}:{" "}
            {formatDate(provenance.retrievedAt, language)}
          </AppText>
          <View style={styles.disclosureRow}>
            <AppText variant="small" muted>
              {t("dataSourceLabel")}:
            </AppText>
            <InlineLink
              label={provenance.sourceName}
              onPress={() => void openExternalUrl(provenance.sourceUrl).catch(() => undefined)}
            />
          </View>
          {provenance.license.url && (
            <View style={styles.disclosureRow}>
              <AppText variant="small" muted>
                {t("dataLicenseLabel")}:
              </AppText>
              <InlineLink
                label={provenance.license.name}
                onPress={() =>
                  void openExternalUrl(provenance.license.url ?? "").catch(() => undefined)
                }
              />
            </View>
          )}
          <AppText variant="small" muted>
            {t("dataAttributionLabel")}: {provenance.license.attributionText}
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

type StateScreenProps = {
  readonly title: string;
  readonly body: string;
  readonly code?: string;
  readonly primary: { readonly label: string; readonly onPress: () => void };
  readonly secondary?: { readonly label: string; readonly onPress: () => void };
  readonly close: () => void;
  readonly testID: string;
};

function StateScreen({ title, body, code, primary, secondary, close, testID }: StateScreenProps) {
  const { t } = useLanguage();
  return (
    <Screen testID={testID}>
      <PageHeader onBack={close} label={t("close")} testID="result-close-action" />
      <View style={styles.stateBody}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        <AppText>{body}</AppText>
        {code && (
          <AppText variant="mono" muted>
            {code}
          </AppText>
        )}
        <View style={[sharedStyles.stack, styles.stateActions]}>
          <Button label={primary.label} onPress={primary.onPress} testID="result-primary-action" />
          {secondary && (
            <Button
              label={secondary.label}
              variant="secondary"
              onPress={secondary.onPress}
              testID="result-secondary-action"
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

function formatDate(value: string, language: "fi" | "en") {
  return new Intl.DateTimeFormat(language === "fi" ? "fi-FI" : "en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}

type Translator = (key: MessageKey) => string;

function materialLabel(value: MaterialFamily | undefined, t: Translator): string {
  if (!value || value === "unknown") return t("materialUnknown");
  if (value === "plastic") return t("materialPlastic");
  if (value === "carton") return t("materialCarton");
  if (value === "paper") return t("materialPaper");
  if (value === "glass") return t("materialGlass");
  if (value === "metal") return t("materialMetal");
  if (value === "wood") return t("materialWood");
  if (value === "composite") return t("materialComposite");
  return t("materialOther");
}

function componentLabel(
  observation: {
    readonly shape?: { readonly value: PackagingShape };
    readonly materialFamily?: { readonly value: MaterialFamily };
    readonly displayName?: { readonly value: string };
  },
  t: Translator,
): string {
  if (observation.shape?.value === "bottle") return t("shapeBottle");
  if (observation.shape?.value === "can") return t("shapeCan");
  if (observation.shape?.value === "jar") return t("shapeJar");
  return observation.displayName?.value ?? materialLabel(observation.materialFamily?.value, t);
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", alignItems: "center", gap: spacing.md },
  centerText: { textAlign: "center" },
  stateBody: { paddingTop: spacing.lg, gap: spacing.md },
  stateActions: { marginTop: spacing.md },
  answerIntro: { paddingTop: spacing.lg, gap: spacing.xs },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  resultStack: { paddingTop: spacing.lg, gap: spacing.md },
  nextActions: { paddingTop: spacing.xl, gap: spacing.md },
  productSummary: { paddingTop: spacing.xl, gap: spacing.md },
  disclosureRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  componentBlock: { gap: spacing.sm },
});
