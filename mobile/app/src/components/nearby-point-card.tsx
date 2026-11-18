import {
  collectionPointMapUrl,
  collectionPointUrl,
  type NearbyCollectionPoint,
} from "@kierratysappi/contracts/collection-points";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { displayDistance } from "@/features/nearby/location-session";
import { collectionMaterialLabels } from "@/features/nearby/material-label";
import { resolvePointAddress } from "@/features/nearby/point-address";
import { recyclingIntent } from "@/features/overview/recording";
import { openExternalUrl } from "@/features/security/external-links";
import { useLanguage } from "@/i18n/language-context";
import { useAppTheme } from "@/theme/tokens";
import { RecyclingRecordAction } from "./recycle-action";
import { AppText, Button, InlineLink, Paper, Rule, sharedStyles } from "./ui";

export function NearbyPointCard({
  result,
  accuracy,
  index,
}: {
  readonly result: NearbyCollectionPoint;
  readonly accuracy: number | null;
  readonly index: number;
}) {
  const { point, distanceMeters } = result;
  const { language, t } = useLanguage();
  const { palette } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const stackedHeading = width < 360 || fontScale > 1.2;
  const [recordingScope] = useState(() => ({}));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [address, setAddress] = useState<{
    status: "idle" | "loading" | "done";
    text: string | null;
  }>({ status: "idle", text: null });
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  const openUrl = (url: string) => {
    setLinkError(false);
    void openExternalUrl(url).catch(() => {
      setLinkError(true);
      announceAccessibility(t("nearbyLinkError"), "high");
    });
  };
  const completeAddress = async () => {
    if (address.status !== "idle" || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setAddress({ status: "loading", text: null });
    announceAccessibility(t("nearbyAddressLoading"));
    const text = await resolvePointAddress(point, Location.reverseGeocodeAsync, controller.signal);
    if (!controller.signal.aborted) {
      setAddress({ status: "done", text });
      announceAccessibility(
        text ? `${t("nearbyAddressEstimate")}: ${text}` : t("nearbyAddressFailed"),
      );
    }
    if (active.current === controller) active.current = null;
  };
  return (
    <Paper style={styles.card} testID={`nearby-point-${index}`}>
      <View style={[styles.heading, stackedHeading && styles.headingStack]}>
        <View style={[styles.identity, stackedHeading && styles.identityStack]}>
          <AppText variant="heading" accessibilityRole="header" style={styles.name}>
            {point.name ?? point.operator ?? t("nearbyGeneric")}
          </AppText>
          <AppText variant="small" muted>
            {point.address ??
              address.text ??
              t(address.status === "done" ? "nearbyAddressFailed" : "nearbyLocationOnMap")}
          </AppText>
        </View>
        <View style={[styles.distance, stackedHeading && styles.distanceLine]}>
          <AppText variant="mono" style={styles.distanceValue}>
            {displayDistance(distanceMeters, language)}
          </AppText>
          <AppText variant="small" muted>
            {t("nearbyDistanceShort")}
          </AppText>
        </View>
      </View>
      {address.text && (
        <AppText variant="small" muted>
          {t("nearbyAddressSource")}
        </AppText>
      )}
      <View style={styles.materials} testID={`nearby-materials-${index}`}>
        {point.reportedMaterials.length ? (
          point.reportedMaterials.slice(0, detailsOpen ? 30 : 4).map((material) => (
            <View key={material} style={[styles.material, { backgroundColor: palette.pineSoft }]}>
              <AppText variant="small">{t(collectionMaterialLabels[material])}</AppText>
            </View>
          ))
        ) : (
          <AppText variant="small" muted>
            {t("nearbyMaterialsUnknown")}
          </AppText>
        )}
        {!detailsOpen && point.reportedMaterials.length > 4 && (
          <InlineLink
            role="button"
            label={t("nearbyMoreMaterials").replace(
              "{count}",
              String(point.reportedMaterials.length - 4),
            )}
            onPress={() => setDetailsOpen(true)}
          />
        )}
      </View>
      <View style={styles.actions}>
        <InlineLink
          label={t("nearbyShowMap")}
          role="button"
          onPress={() => openUrl(collectionPointMapUrl(point))}
          accessibilityHint={t("nearbyMapHint")}
          testID={`nearby-map-${index}`}
        />
        <InlineLink
          label={t(detailsOpen ? "nearbyLess" : "nearbyMore")}
          role="button"
          expanded={detailsOpen}
          onPress={() => setDetailsOpen((open) => !open)}
          testID={`nearby-details-toggle-${index}`}
        />
      </View>
      {detailsOpen && (
        <View style={sharedStyles.tightStack} testID={`nearby-details-${index}`}>
          <Rule />
          {point.reportedExclusions.length > 0 && (
            <AppText variant="small">
              {t("nearbyExclusions")}:{" "}
              {point.reportedExclusions.map((m) => t(collectionMaterialLabels[m])).join(" · ")}
            </AppText>
          )}
          {!point.name && (
            <AppText variant="small" muted>
              {t("nearbyNameUnknown")}
            </AppText>
          )}
          <AppText variant="small" muted>
            {t("nearbyPointType")}:{" "}
            {t(
              point.kind === "centre"
                ? "nearbyCentre"
                : point.kind === "container"
                  ? "nearbyContainer"
                  : "nearbyTypeUnknown",
            )}
          </AppText>
          {point.operator && (
            <AppText variant="small" muted>
              {t("nearbyOperator")}: {point.operator}
            </AppText>
          )}
          <AppText variant="small" muted>
            {t("nearbyPointId")}: {point.id}
          </AppText>
          {accuracy !== null && (
            <AppText variant="small" muted>
              {t("nearbyAccuracy")}: ±{Math.max(1, Math.ceil(accuracy / 10) * 10)} m
            </AppText>
          )}
          <AppText variant="small" muted>
            {t("nearbyCaution")}
          </AppText>
          <AppText variant="small" muted>
            {t("nearbyShortMapHint")}
          </AppText>
          <InlineLink
            label={t("nearbyDetails")}
            accessibilityHint={t("nearbyExternalHint")}
            onPress={() => openUrl(collectionPointUrl(point))}
          />
          <RecyclingRecordAction
            recordId={recyclingIntent(recordingScope, point.id)}
            label={t("nearbyGeneric")}
          />
          {!point.address && Platform.OS !== "web" && address.status !== "done" && (
            <View style={sharedStyles.tightStack}>
              <AppText variant="small" muted>
                {t("nearbyAddressConsent")}
              </AppText>
              <Button
                label={t("nearbyCompleteAddress")}
                variant="quiet"
                busy={address.status === "loading"}
                onPress={() => void completeAddress()}
                testID={`nearby-address-${index}`}
              />
              {address.status === "loading" && (
                <AppText variant="small" accessibilityLiveRegion="polite">
                  {t("nearbyAddressLoading")}
                </AppText>
              )}
            </View>
          )}
        </View>
      )}
      {linkError && <AppText accessibilityRole="alert">{t("nearbyLinkError")}</AppText>}
    </Paper>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, boxShadow: "none" },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headingStack: { flexDirection: "column", gap: 4 },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  identityStack: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", alignSelf: "stretch" },
  name: { fontSize: 19, lineHeight: 25 },
  distance: { alignItems: "flex-end", maxWidth: 110, gap: 2 },
  distanceLine: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
  },
  distanceValue: { fontSize: 18, lineHeight: 26 },
  materials: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  material: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
});
