import {
  CollectionDirectorySchema,
  directoryAgeDays,
} from "@kierratysappi/contracts/collection-points";
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
import { ChoiceChip } from "@/components/choice-chip";
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
import { readAddressLocation, readDeviceLocation } from "@/features/nearby/device-location";
import { LocationIssue } from "@/features/nearby/location-session";
import { AddressLookupIssue } from "@/features/nearby/manual-location";
import {
  buildNearbyResults,
  type NearbyFilter,
  type NearbyResults,
  nearbyMaterialGroups,
} from "@/features/nearby/results";
import { useNearbySearch } from "@/features/nearby/search-context";
import { useSortingRegion } from "@/features/region/context";
import { openExternalUrl } from "@/features/security/external-links";
import { useLanguage } from "@/i18n/language-context";
import { appFontFamily } from "@/theme/fonts";
import { radius, spacing, useAppTheme } from "@/theme/tokens";

const directory = CollectionDirectorySchema.safeParse(snapshot);
type State =
  | { status: "idle" | "loading" }
  | { status: "error"; message: MessageKey }
  | {
      status: "ready";
      results: NearbyResults;
      accuracy: number | null;
      origin: "device" | "address";
    };
const errors = {
  permission: "nearbyPermission",
  services: "nearbyServices",
  timeout: "nearbyTimeout",
  unavailable: "nearbyUnavailable",
  cancelled: "nearbyUnavailable",
} as const;

export default function NearbyScreen() {
  const { fromCoordinates } = useSortingRegion();
  const router = useRouter();
  const { t, language } = useLanguage();
  const { palette } = useAppTheme();
  const { consumeSearchRequest } = useNearbySearch();
  const [state, setState] = useState<State>({ status: "idle" });
  const [filter, setFilter] = useState<NearbyFilter>("all");
  const [missingOpen, setMissingOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const active = useRef<AbortController | null>(null);
  const clear = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setState({ status: "idle" });
    setPrivacyOpen(false);
    setFilter("all");
    setMissingOpen(false);
    setLinkError(false);
    setManualOpen(false);
    setLocationInput("");
  }, []);
  const find = useCallback(async () => {
    if (active.current) return;
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
      const fix = await readDeviceLocation(controller.signal);
      if (controller.signal.aborted) return;
      fromCoordinates(fix.coords);
      const results = buildNearbyResults(directory.data.points, fix.coords);
      if (!results.reported.length && !results.missing.length) {
        setState({ status: "error", message: "nearbyNoResult" });
        announceAccessibility(t("nearbyNoResult"), "high");
      } else {
        setState({
          status: "ready",
          results,
          accuracy: fix.coords.accuracy ?? 0,
          origin: "device",
        });

        announceAccessibility(t("nearbyResult"), "high");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof LocationIssue ? errors[error.reason] : "nearbyUnavailable";
      setState({ status: "error", message });

      announceAccessibility(t(message), "high");
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [t, fromCoordinates]);
  const findByLocation = async () => {
    if (active.current || Platform.OS === "web") return;
    const input = locationInput;
    clear();
    Keyboard.dismiss();
    if (!directory.success) {
      setState({ status: "error", message: "nearbyDataError" });
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setState({ status: "loading" });
    announceAccessibility(t("nearbyLoading"));
    try {
      const coordinates = await readAddressLocation(input, controller.signal);
      if (controller.signal.aborted) return;
      const results = buildNearbyResults(directory.data.points, coordinates);
      if (!results.reported.length && !results.missing.length) {
        setState({ status: "error", message: "nearbyNoResult" });
        announceAccessibility(t("nearbyNoResult"), "high");
      } else {
        setState({ status: "ready", results, accuracy: null, origin: "address" });

        announceAccessibility(`${t("nearbyResult")}. ${t("nearbyManualEstimate")}`, "high");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof AddressLookupIssue && error.reason === "invalid"
          ? "nearbyLocationInvalid"
          : error instanceof AddressLookupIssue && error.reason === "ambiguous"
            ? "nearbyLocationAmbiguous"
            : error instanceof AddressLookupIssue && error.reason === "busy"
              ? "nearbyLocationBusy"
              : "nearbyLocationError";
      setState({ status: "error", message });

      announceAccessibility(t(message), "high");
    } finally {
      if (active.current === controller) active.current = null;
    }
  };
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
    void openExternalUrl(directory.data.attributionUrl).catch(() => {
      setLinkError(true);
      announceAccessibility(t("nearbyLinkError"), "high");
    });
  };
  return (
    <Screen testID="nearby-screen" style={styles.screen}>
      <PageHeader
        onBack={() => {
          clear();
          if (router.canGoBack()) router.back();
          else router.replace("/");
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
          <Button label={t("nearbyFind")} onPress={() => void find()} testID="nearby-find" />
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
            <AppText variant="label">{t("nearbyFilterTitle")}</AppText>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t("nearbyFilterTitle")}
              style={styles.filters}
            >
              {(["all", ...Object.keys(nearbyMaterialGroups)] as NearbyFilter[]).map((value) => (
                <ChoiceChip
                  key={value}
                  selected={filter === value}
                  label={t(filterLabels[value])}
                  onPress={() => {
                    setFilter(value);
                    setMissingOpen(false);
                  }}
                  testID={`nearby-filter-${value}`}
                />
              ))}
            </View>
          </View>
          <View style={sharedStyles.tightStack} testID="nearby-result">
            {(filter === "all" ? state.results.reported : state.results.materials[filter])
              .length === 0 && (
              <AppText testID="nearby-no-material-result">
                {t(filter === "all" ? "nearbyNoReported" : "nearbyNoMaterialMatch")}
              </AppText>
            )}
            {(filter === "all" ? state.results.reported : state.results.materials[filter]).map(
              (result, index) => (
                <NearbyPointCard
                  key={result.point.id}
                  result={result}
                  index={index}
                  accuracy={state.accuracy}
                />
              ),
            )}
          </View>
          {filter === "all" && state.results.missing.length > 0 && (
            <View style={sharedStyles.tightStack}>
              <InlineLink
                label={t(missingOpen ? "nearbyHideMissing" : "nearbyShowMissing")}
                role="button"
                expanded={missingOpen}
                onPress={() => setMissingOpen((value) => !value)}
                testID="nearby-missing-toggle"
              />
              {missingOpen && (
                <View testID="nearby-missing-results" style={sharedStyles.tightStack}>
                  <AppText variant="small" muted>
                    {t("nearbyMissingNote")}
                  </AppText>
                  {state.results.missing.map((result, index) => (
                    <NearbyPointCard
                      key={result.point.id}
                      result={result}
                      index={index + 5}
                      accuracy={state.accuracy}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
          <View style={sharedStyles.tightStack}>
            <AppText variant="small" muted>
              {t("nearbyQuickCaution")}
            </AppText>
            {state.origin === "address" && (
              <AppText variant="small" muted>
                {t("nearbyManualEstimate")}
              </AppText>
            )}
            {state.accuracy !== null && state.accuracy > 100 && (
              <AppText variant="small">{t("nearbyApproximate")}</AppText>
            )}
            {directory.success && (
              <AppText variant="small" muted>
                {t("nearbyRetrieved")}:{" "}
                {new Date(directory.data.retrievedAt).toLocaleDateString(
                  language === "fi" ? "fi-FI" : "en-GB",
                )}
              </AppText>
            )}
            <AppText variant="small" muted>
              {t("nearbyUnverified")}
            </AppText>
            <InlineLink label={t("nearbySource")} onPress={openSource} />
            {directory.success && directoryAgeDays(directory.data) > 30 && (
              <AppText variant="small" muted>
                {t("nearbyStale")}
              </AppText>
            )}
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
      {state.status !== "loading" && (
        <View style={sharedStyles.tightStack}>
          <InlineLink
            label={t("nearbyLocationAction")}
            role="button"
            expanded={manualOpen}
            onPress={() => {
              setManualOpen((open) => !open);
              setLocationInput("");
            }}
            testID="nearby-location-toggle"
          />
          {manualOpen &&
            (Platform.OS === "web" ? (
              <AppText>{t("nearbyLocationNativeOnly")}</AppText>
            ) : (
              <View style={sharedStyles.tightStack}>
                <AppText>{t("nearbyLocationHint")}</AppText>
                <TextInput
                  accessibilityLabel={t("nearbyLocationLabel")}
                  accessibilityHint={t("nearbyLocationHint")}
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={160}
                  value={locationInput}
                  onChangeText={setLocationInput}
                  placeholder={t("nearbyLocationPlaceholder")}
                  placeholderTextColor={palette.faint}
                  returnKeyType="search"
                  onSubmitEditing={() => void findByLocation()}
                  style={[
                    styles.locationInput,
                    {
                      color: palette.ink,
                      borderColor: palette.borderStrong,
                      backgroundColor: palette.surfaceRaised,
                    },
                  ]}
                  testID="nearby-location-input"
                />
                <Button
                  label={t("nearbyLocationAction")}
                  onPress={() => void findByLocation()}
                  disabled={!locationInput.trim()}
                  testID="nearby-location-submit"
                />
              </View>
            ))}
        </View>
      )}
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
          </View>
        )}
      </View>
    </Screen>
  );
}
const filterLabels = {
  all: "nearbyFilterAll",
  plastic: "pointPlastic",
  glass: "pointGlass",
  metal: "pointMetal",
  cardboard: "pointCartons",
  paper: "pointPaper",
  batteries: "pointBatteries",
  electronics: "pointElectricalAppliances",
  textiles: "pointTextiles",
  other: "nearbyFilterOther",
} as const satisfies Record<NearbyFilter, MessageKey>;
const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  screen: { gap: spacing.md },
  provenance: { gap: spacing.sm, paddingTop: spacing.sm },
  locationInput: {
    minHeight: 48,
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.md,
    fontFamily: appFontFamily,
    fontSize: 16,
  },
});
