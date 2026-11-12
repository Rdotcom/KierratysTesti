import {
  CollectionDirectorySchema,
  directoryAgeDays,
  type NearbyCollectionPoint,
  nearestCollectionPoints,
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
import { useNearbySearch } from "@/features/nearby/search-context";
import { useSoundFeedback } from "@/features/sound-feedback/context";
import { useLanguage } from "@/i18n/language-context";
import { appFontFamily } from "@/theme/fonts";
import { radius, spacing, useAppTheme } from "@/theme/tokens";

const directory = CollectionDirectorySchema.safeParse(snapshot);
type State =
  | { status: "idle" | "loading" }
  | { status: "error"; message: MessageKey }
  | {
      status: "ready";
      points: readonly NearbyCollectionPoint[];
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
  const router = useRouter();
  const { t, language } = useLanguage();
  const { palette } = useAppTheme();
  const { consumeSearchRequest } = useNearbySearch();
  const { play } = useSoundFeedback();
  const [state, setState] = useState<State>({ status: "idle" });
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
      const points = nearestCollectionPoints(directory.data.points, fix.coords);
      if (!points.length) {
        setState({ status: "error", message: "nearbyNoResult" });
        announceAccessibility(t("nearbyNoResult"), "high");
      } else {
        setState({ status: "ready", points, accuracy: fix.coords.accuracy ?? 0, origin: "device" });
        play("ready");
        announceAccessibility(t("nearbyResult"), "high");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof LocationIssue ? errors[error.reason] : "nearbyUnavailable";
      setState({ status: "error", message });
      play("attention");
      announceAccessibility(t(message), "high");
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [t, play]);
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
      const points = nearestCollectionPoints(directory.data.points, coordinates);
      if (!points.length) {
        setState({ status: "error", message: "nearbyNoResult" });
        announceAccessibility(t("nearbyNoResult"), "high");
      } else {
        setState({ status: "ready", points, accuracy: null, origin: "address" });
        play("ready");
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
      play("attention");
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
            <AppText variant="small" muted>
              {t("nearbyUnverified")}
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
            {state.origin === "address" && <AppText>{t("nearbyManualEstimate")}</AppText>}
            {state.accuracy !== null && state.accuracy > 100 && (
              <AppText>{t("nearbyApproximate")}</AppText>
            )}
          </View>
          <View style={sharedStyles.stack} testID="nearby-result">
            {state.points.map((result, index) => (
              <NearbyPointCard
                key={result.point.id}
                result={result}
                index={index}
                accuracy={state.accuracy}
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
const styles = StyleSheet.create({
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
