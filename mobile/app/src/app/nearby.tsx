import {
  CollectionDirectorySchema,
  directoryAgeDays,
  nearestCollectionPoints,
  type NearbyCollectionPoint,
} from "@kierratysappi/contracts/collection-points";
import type { Coordinates } from "@kierratysappi/domain";
import type { MessageKey } from "@kierratysappi/localization";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import snapshot from "@/assets/data/finland-recycling.json";
import { NearbyPointCard } from "@/components/nearby-point-card";
import {
  AppText,
  Button,
  InlineLink,
  PageHeader,
  PageIntro,
  Screen,
  sharedStyles,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { readDeviceLocation } from "@/features/nearby/device-location";
import {
  geocodeNearbyInput,
  NEARBY_GEOCODE_INPUT_MAX_LENGTH,
  NearbyGeocodeIssue,
} from "@/features/nearby/geocode-query";
import { LocationIssue } from "@/features/nearby/location-session";
import {
  isApproximateDeviceEstimate,
  nearbyEstimateMessageKey,
  type NearbyEstimate,
} from "@/features/nearby/nearby-estimate";
import { useNearbySearch } from "@/features/nearby/search-context";
import { useLanguage } from "@/i18n/language-context";
import { controls, radius, spacing, useAppTheme } from "@/theme/tokens";

const directory = CollectionDirectorySchema.safeParse(snapshot);
type State =
  | { status: "idle" | "loading" }
  | { status: "error"; message: MessageKey }
  | { status: "ready"; points: readonly NearbyCollectionPoint[]; estimate: NearbyEstimate };
const errors = {
  permission: "nearbyPermission",
  services: "nearbyServices",
  timeout: "nearbyTimeout",
  unavailable: "nearbyUnavailable",
  cancelled: "nearbyUnavailable",
} as const;

export default function NearbyScreen() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { palette } = useAppTheme();
  const { consumeSearchRequest } = useNearbySearch();
  const [state, setState] = useState<State>({ status: "idle" });
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [queryFocused, setQueryFocused] = useState(false);
  const active = useRef<AbortController | null>(null);
  const clear = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setState({ status: "idle" });
    setPrivacyOpen(false);
    setLinkError(false);
  }, []);
  const runSearch = useCallback(
    async (mode: "device" | "geocoded") => {
      if (active.current) return;
      Keyboard.dismiss();
      setLinkError(false);
      if (!directory.success) {
        setState({ status: "error", message: "nearbyDataError" });
        return;
      }
      const controller = new AbortController();
      active.current = controller;
      setState({ status: "loading" });
      announceAccessibility(t("nearbyLoading"));
      try {
        let coordinates: Coordinates;
        let estimate: NearbyEstimate;
        if (mode === "device") {
          const fix = await readDeviceLocation(controller.signal);
          coordinates = fix.coords;
          estimate = { source: "device", accuracyMeters: fix.coords.accuracy ?? null };
        } else {
          const geocoded = await geocodeNearbyInput(queryInput, { signal: controller.signal });
          coordinates = geocoded.coordinates;
          estimate = { source: "geocoded", inputKind: geocoded.kind };
        }
        if (controller.signal.aborted) return;
        const points = nearestCollectionPoints(directory.data.points, coordinates);
        if (!points.length) {
          const message = mode === "device" ? "nearbyNoResult" : "nearbySearchNoResult";
          setState({ status: "error", message });
          announceAccessibility(t(message), "high");
        } else {
          setState({ status: "ready", points, estimate });
          announceAccessibility(t("nearbyResult"), "high");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof NearbyGeocodeIssue && error.reason === "cancelled") return;
        const message =
          mode === "device"
            ? error instanceof LocationIssue
              ? errors[error.reason]
              : "nearbyUnavailable"
            : error instanceof NearbyGeocodeIssue
              ? error.reason === "invalid-input"
                ? "nearbySearchInputInvalid"
                : error.reason === "no-result"
                  ? "nearbySearchNoResult"
                  : "nearbySearchService"
              : "nearbySearchService";
        setState({ status: "error", message });
        announceAccessibility(t(message), "high");
      } finally {
        if (active.current === controller) active.current = null;
      }
    },
    [queryInput, t],
  );
  const find = useCallback(async () => {
    await runSearch("device");
  }, [runSearch]);
  const findByTypedInput = useCallback(async () => {
    await runSearch("geocoded");
  }, [runSearch]);
  useFocusEffect(
    useCallback(() => {
      // Only a recent in-memory Home press auto-starts; URL/deep-link opening alone never does.
      if (consumeSearchRequest()) void find();
      const listener = AppState.addEventListener("change", (next) => {
        if (next === "background") clear();
      });
      return () => {
        listener.remove();
        clear();
      };
    }, [clear, consumeSearchRequest, find]),
  );
  const openSource = () => {
    if (!directory.success) return;
    setLinkError(false);
    void Linking.openURL(directory.data.attributionUrl).catch(() => {
      setLinkError(true);
      announceAccessibility(t("nearbyLinkError"), "high");
    });
  };
  return (
    <Screen testID="nearby-screen" style={styles.screen}>
      <PageHeader
        onBack={() => {
          clear();
          router.back();
        }}
      />
      <PageIntro
        title={t("nearbyTitle")}
        body={state.status === "ready" ? undefined : t("nearbyIntro")}
      />
      {state.status === "loading" ? (
        <View style={sharedStyles.tightStack}>
          <ActivityIndicator
            color={palette.actionPrimary}
            accessibilityLabel={t("nearbyLoading")}
          />
          <AppText accessibilityLiveRegion="polite">{t("nearbyLoading")}</AppText>
          <Button label={t("cancel")} variant="secondary" onPress={clear} testID="nearby-cancel" />
        </View>
      ) : (
        state.status !== "ready" && (
          <View style={styles.searchControls}>
            <Button label={t("nearbyFind")} onPress={() => void find()} testID="nearby-find" />
            <View style={styles.typedSearchSection}>
              <AppText variant="label" nativeID="nearby-search-input-label">
                {t("nearbySearchInputLabel")}
              </AppText>
              <TextInput
                accessibilityLabel={t("nearbySearchInputLabel")}
                accessibilityLabelledBy="nearby-search-input-label"
                accessibilityHint={t("nearbySearchInputHint")}
                autoCapitalize="words"
                autoCorrect={false}
                autoComplete="street-address"
                inputMode="search"
                maxLength={NEARBY_GEOCODE_INPUT_MAX_LENGTH}
                onChangeText={setQueryInput}
                onSubmitEditing={() => void findByTypedInput()}
                onFocus={() => setQueryFocused(true)}
                onBlur={() => setQueryFocused(false)}
                placeholder={t("nearbySearchInputPlaceholder")}
                placeholderTextColor={palette.faint}
                returnKeyType="search"
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.surfaceRaised,
                    borderColor: queryFocused ? palette.actionPrimary : palette.borderStrong,
                    color: palette.ink,
                  },
                ]}
                value={queryInput}
                testID="nearby-search-input"
              />
              <AppText variant="small" muted>
                {t("nearbySearchInputHint")}
              </AppText>
              <AppText variant="small" muted>
                {t("nearbyTypedSearchDisclosure")}
              </AppText>
              <Button
                label={t("nearbySearchByInputAction")}
                variant="secondary"
                onPress={() => void findByTypedInput()}
                disabled={queryInput.trim().length === 0}
                testID="nearby-search-input-action"
              />
            </View>
          </View>
        )
      )}
      {state.status === "error" && (
        <View style={sharedStyles.tightStack}>
          <AppText accessibilityRole="alert">{t(state.message)}</AppText>
          {(state.message === "nearbyPermission" || state.message === "nearbyServices") &&
            (Platform.OS === "web" ? (
              <AppText muted>{t("nearbySettingsHint")}</AppText>
            ) : (
              <Button
                label={t("openSettings")}
                variant="secondary"
                onPress={() => {
                  void Linking.openSettings().catch(() => {
                    setLinkError(true);
                    announceAccessibility(t("nearbyLinkError"), "high");
                  });
                }}
              />
            ))}
        </View>
      )}
      {state.status === "ready" && (
        <>
          <View style={sharedStyles.tightStack}>
            <AppText variant="small" muted>
              {t("nearbyUnverified")}
            </AppText>
            <AppText variant="small" muted>
              {t(nearbyEstimateMessageKey(state.estimate))}
            </AppText>
            {directory.success && (
              <AppText variant="small" muted>
                {t("nearbyRetrieved")}:{" "}
                {new Date(directory.data.retrievedAt).toLocaleDateString(
                  language === "fi" ? "fi-FI" : "en-GB",
                )}
              </AppText>
            )}
            <InlineLink label={t("nearbySource")} onPress={openSource} />
            {directory.success && directoryAgeDays(directory.data) > 30 && (
              <AppText>{t("nearbyStale")}</AppText>
            )}
            <AppText variant="small">{t("nearbyQuickCaution")}</AppText>
            {isApproximateDeviceEstimate(state.estimate) && (
              <AppText>{t("nearbyApproximate")}</AppText>
            )}
          </View>
          <View style={sharedStyles.stack} testID="nearby-result">
            {state.points.map((result, index) => (
              <NearbyPointCard
                key={result.point.id}
                result={result}
                index={index}
                accuracyMeters={
                  state.estimate.source === "device" ? state.estimate.accuracyMeters : null
                }
                estimateSource={state.estimate.source}
              />
            ))}
          </View>
          <Button
            label={t("nearbyRefresh")}
            variant="quiet"
            onPress={() => void find()}
            testID="nearby-find"
          />
        </>
      )}
      {linkError && <AppText accessibilityRole="alert">{t("nearbyLinkError")}</AppText>}
      <View style={styles.provenance}>
        <AppText variant="small" muted>
          {t("nearbyScope")}
        </AppText>
        {directory.success && (
          <>
            {state.status !== "ready" && (
              <AppText variant="small" muted>
                {t("nearbyRetrieved")}:{" "}
                {new Date(directory.data.retrievedAt).toLocaleDateString(
                  language === "fi" ? "fi-FI" : "en-GB",
                )}
              </AppText>
            )}
            {state.status !== "ready" && directoryAgeDays(directory.data) > 30 && (
              <AppText>{t("nearbyStale")}</AppText>
            )}
            {state.status !== "ready" && (
              <InlineLink label={t("nearbySource")} onPress={openSource} />
            )}
          </>
        )}
        <InlineLink
          label={t(privacyOpen ? "nearbyPrivacyLess" : "nearbyPrivacyMore")}
          role="button"
          expanded={privacyOpen}
          onPress={() => setPrivacyOpen((open) => !open)}
          testID="nearby-privacy-toggle"
        />
        {privacyOpen && (
          <View style={sharedStyles.tightStack}>
            <AppText variant="small" muted>
              {t("nearbyPurpose")}
            </AppText>
            <AppText variant="small" muted>
              {t("nearbyCaution")}
            </AppText>
            <AppText variant="small" muted>
              {t("nearbyAddressDisclosure")}
            </AppText>
            <AppText variant="small" muted>
              {t("nearbyTypedSearchDisclosure")}
            </AppText>
          </View>
        )}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  provenance: { gap: spacing.sm, paddingTop: spacing.sm },
  searchControls: { gap: spacing.md },
  typedSearchSection: { gap: spacing.xs },
  input: {
    minHeight: controls.inputMinHeight,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 17,
  },
});
