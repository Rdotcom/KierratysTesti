import {
  collectionPointMapUrl,
  collectionPointUrl,
  type NearbyCollectionPoint,
} from "@kierratysappi/contracts/collection-points";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { displayDistance } from "@/features/nearby/location-session";
import { collectionMaterialLabels } from "@/features/nearby/material-label";
import { resolvePointAddress } from "@/features/nearby/point-address";
import { useLanguage } from "@/i18n/language-context";
import { AppText, Button, InlineLink, Paper, Rule, sharedStyles } from "./ui";

export function NearbyPointCard({
  result,
  accuracyMeters,
  estimateSource,
  index,
}: {
  readonly result: NearbyCollectionPoint;
  readonly accuracyMeters: number | null;
  readonly estimateSource: "device" | "geocoded";
  readonly index: number;
}) {
  const { point, distanceMeters } = result;
  const { language, t } = useLanguage();
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
    void Linking.openURL(url).catch(() => {
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
    <Paper testID={`nearby-point-${index}`}>
      <AppText variant="small" muted>
        {index + 1} ·{" "}
        {t(
          point.kind === "centre"
            ? "nearbyCentre"
            : point.kind === "container"
              ? "nearbyContainer"
              : "nearbyGeneric",
        )}
      </AppText>
      <AppText variant="heading" accessibilityRole="header">
        {point.name ?? point.operator ?? t("nearbyGeneric")}
      </AppText>
      <AppText variant="mono">
        {displayDistance(distanceMeters, language)} · {t("nearbyDistanceShort")}
      </AppText>
      {point.address ? (
        <AppText>{point.address}</AppText>
      ) : (
        <AppText muted>
          {address.text ??
            t(address.status === "done" ? "nearbyAddressFailed" : "nearbyLocationOnMap")}
        </AppText>
      )}
      {address.text && (
        <AppText variant="small" muted>
          {t("nearbyAddressSource")}
        </AppText>
      )}
      <View style={sharedStyles.tightStack}>
        <AppText variant="label">{t("nearbyMaterials")}</AppText>
        <AppText testID={`nearby-materials-${index}`}>
          {point.reportedMaterials.length
            ? point.reportedMaterials.map((m) => t(collectionMaterialLabels[m])).join(" · ")
            : t("nearbyMaterialsUnknown")}
        </AppText>
        {point.reportedExclusions.length > 0 && (
          <AppText variant="small">
            {t("nearbyExclusions")}:{" "}
            {point.reportedExclusions.map((m) => t(collectionMaterialLabels[m])).join(" · ")}
          </AppText>
        )}
      </View>
      <Button
        label={t("nearbyShowMap")}
        variant={index === 0 ? "primary" : "secondary"}
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
      {detailsOpen && (
        <View style={sharedStyles.tightStack} testID={`nearby-details-${index}`}>
          <Rule />
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
          {estimateSource === "device" && accuracyMeters !== null && (
            <AppText variant="small" muted>
              {t("nearbyAccuracy")}: ±{Math.max(1, Math.ceil(accuracyMeters / 10) * 10)} m
            </AppText>
          )}
          {estimateSource === "geocoded" && (
            <AppText variant="small" muted>
              {t("nearbyGeocodedEstimate")}
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
