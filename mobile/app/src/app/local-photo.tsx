import type {
  LocalObjectKind,
  LocalVisionObservation,
} from "@kierratysappi/contracts/local-vision";
import type { LocalVisionReadiness } from "@kierratysappi/contracts/local-vision-readiness";
import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import type { OfflineProductResult } from "@kierratysappi/domain/offline-product";
import type { MessageKey } from "@kierratysappi/localization";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState, Image, Linking, StyleSheet, TextInput, View } from "react-native";
import { OfflineProductResultView } from "@/components/offline-product-result";
import { ObjectCandidateResultView } from "@/components/object-candidate-result";
import type { ObjectPhotoResponse } from "@/features/local-vision/object-candidates";
import {
  AppText,
  Button,
  InlineLink,
  PageHeader,
  PageIntro,
  Paper,
  Screen,
  StatusPill,
  sharedStyles,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { offlineCatalogue } from "@/features/local-vision/catalogue";
import {
  inspectLocalVisionReadiness,
  isLocalVisionAvailable,
  recognizeLocalPhoto,
  recognizeOfflineProduct,
} from "@/features/local-vision/native";
import { type LocalPhotoPhase, localPhotoPresentation } from "@/features/local-vision/presentation";
import { localReadinessMessage } from "@/features/local-vision/readiness";
import { isLocalCaptureUri } from "@/features/local-vision/recognizer";
import { canUsePhotoCapture, choosePhotoSize } from "@/features/photo/sorting";
import { useSoundFeedback } from "@/features/sound-feedback/context";
import { useLanguage } from "@/i18n/language-context";
import { radius, useAppTheme } from "@/theme/tokens";

const objectLabels: Record<LocalObjectKind, MessageKey> = {
  bottle: "localVisionBottle",
  jar: "localVisionJar",
  box: "localVisionBox",
  bag: "localVisionBag",
  cup: "localVisionCup",
};

function removeCapture(uri: string): void {
  if (!isLocalCaptureUri(uri, Paths.cache.uri)) throw new Error("invalid_capture_path");
  const file = new File(uri);
  if (file.exists) file.delete();
}

export default function LocalPhotoScreen() {
  const { play } = useSoundFeedback();
  const router = useRouter();
  const { t, language } = useLanguage();
  const { palette } = useAppTheme();
  const [mode, setMode] = useState<"product" | "material">("product");
  const [productResult, setProductResult] = useState<OfflineProductResult>();
  const [objectHint, setObjectHint] = useState<ObjectPhotoResponse>();
  const [manualCode, setManualCode] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<LocalPhotoPhase>("intro");
  const [jpeg, setJpeg] = useState<string>();
  const [observation, setObservation] = useState<LocalVisionObservation>();
  const [error, setError] = useState<MessageKey>();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [readiness, setReadiness] = useState<LocalVisionReadiness>();
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string>();
  const camera = useRef<CameraView>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const permissionPrompt = useRef(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const available = isLocalVisionAvailable();
  const presentation = localPhotoPresentation({ phase, available, permission, error });
  const cameraGeneration = generation.current;

  const clear = useCallback(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = undefined;
    locked.current = false;
    setJpeg(undefined);
    setObservation(undefined);
    setProductResult(undefined);
    setObjectHint(undefined);
    setManualCode("");
    setError(undefined);
    setBusy(false);
    setChecking(false);
    setReadiness(undefined);
    setReady(false);
    setPhase("intro");
  }, []);
  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "background" || (state !== "active" && !permissionPrompt.current)) clear();
      });
      return () => {
        subscription.remove();
        clear();
      };
    }, [clear]),
  );

  const open = async (nextMode: "product" | "material" = mode) => {
    if (locked.current) return;
    setMode(nextMode);
    if (!available || !canUsePhotoCapture("ios", Constants)) {
      setError("localVisionUnavailable");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError(undefined);
    const ticket = ++generation.current;
    const controller = new AbortController();
    pending.current = controller;
    try {
      setChecking(true);
      const inspected = await inspectLocalVisionReadiness(controller.signal);
      if (ticket !== generation.current || controller.signal.aborted) return;
      setChecking(false);
      setReadiness(inspected);
      if (inspected.status === "unavailable") {
        setError(localReadinessMessage(inspected));
        return;
      }
      permissionPrompt.current = true;
      let granted: boolean;
      try {
        granted = permission?.granted || (await requestPermission()).granted;
      } finally {
        permissionPrompt.current = false;
      }
      if (ticket === generation.current) {
        if (granted) {
          setReady(false);
          setPhase("camera");
        } else setError("cameraDenied");
      }
    } catch {
      if (ticket === generation.current) setError("localVisionError");
    } finally {
      if (ticket === generation.current) {
        pending.current = undefined;
        locked.current = false;
        setBusy(false);
        setChecking(false);
      }
    }
  };

  const capture = async () => {
    if (locked.current || !ready || !camera.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    const ticket = ++generation.current;
    try {
      const picture = await camera.current.takePictureAsync({
        base64: true,
        exif: false,
        quality: 0.4,
        imageType: "jpg",
        skipProcessing: false,
      });
      let clean: string;
      try {
        clean = preparePhotoBase64(picture.base64 ?? "");
      } finally {
        removeCapture(picture.uri);
      }
      if (ticket === generation.current) {
        setJpeg(clean);
        setPhase("preview");
      }
    } catch {
      if (ticket === generation.current) setError("localVisionError");
    } finally {
      if (ticket === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };

  const retake = () => {
    clear();
    void open();
  };

  const recognize = async () => {
    if (locked.current || !jpeg || phase !== "preview") return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setPhase("processing");
    const ticket = ++generation.current;
    const controller = new AbortController();
    pending.current = controller;
    if (mode === "product") {
      const result = await recognizeOfflineProduct(jpeg, controller.signal);
      if (ticket !== generation.current) return;
      setJpeg(undefined);
      pending.current = undefined;
      locked.current = false;
      setBusy(false);
      if (result.status === "observed") {
        setProductResult(result.result);
        setObjectHint(result.objectHint);
        setPhase("result");
        play("ready");
        announceAccessibility(t("localVisionReady"));
      } else {
        setError(
          result.reason === "unsupported"
            ? "offlineProductUpdate"
            : result.reason === "timeout"
              ? "localVisionTimeout"
              : "localVisionError",
        );
        setPhase("intro");
      }
      return;
    }
    const result = await recognizeLocalPhoto(jpeg, controller.signal);
    if (ticket !== generation.current) return;
    setJpeg(undefined);
    pending.current = undefined;
    locked.current = false;
    setBusy(false);
    if (result.status === "observed") {
      setObservation(result.observation);
      setPhase("result");
      play("ready");
      announceAccessibility(t("localVisionReady"));
    } else {
      setError(
        result.reason === "busy"
          ? "localVisionBusy"
          : result.reason === "timeout"
            ? "localVisionTimeout"
            : result.reason === "unsupported"
              ? "localVisionUnavailable"
              : "localVisionError",
      );
      setPhase("intro");
      play("attention");
    }
  };

  return (
    <Screen testID="local-photo-screen">
      <PageHeader
        onBack={() => {
          clear();
          if (router.canGoBack()) router.back();
          else router.replace("/identify");
        }}
      />
      <PageIntro
        title={t("localVisionTitle")}
        {...(phase === "intro" ? { body: t("localVisionIntro") } : {})}
      />
      <View style={sharedStyles.stack}>
        {presentation.inlineError && (
          <AppText accessibilityRole="alert" testID="local-photo-error">
            {t(presentation.inlineError)}
          </AppText>
        )}
        {readiness?.status === "primary_only" && (
          <AppText accessibilityLiveRegion="polite" testID="local-photo-readiness-partial">
            {t(localReadinessMessage(readiness) ?? "localVisionReadinessPartial")}
          </AppText>
        )}
        {presentation.showCaptureGuidance && (
          <AppText testID="local-photo-capture-guidance">
            {t(mode === "product" ? "offlineProductGuidance" : "localVisionCaptureGuidance")}
          </AppText>
        )}
        {phase === "intro" && (
          <>
            <AppText>{t("offlineProductScope")}</AppText>
            <AppText>{t("objectCandidateIntro")}</AppText>
            {!available ? (
              <AppText testID="local-photo-unavailable">{t("localVisionUnavailable")}</AppText>
            ) : presentation.permanentDenied ? (
              <>
                <AppText accessibilityRole="alert" testID="local-photo-permission-denied">
                  {t("cameraDenied")}
                </AppText>
                <Button label={t("openSettings")} onPress={() => void Linking.openSettings()} />
              </>
            ) : (
              <Button
                label={t(
                  checking
                    ? "localVisionChecking"
                    : busy
                      ? "localVisionOpening"
                      : "localVisionCamera",
                )}
                onPress={() => void open("product")}
                busy={busy}
                disabled={busy}
                testID="local-photo-open-camera"
              />
            )}
            {available && (
              <Button
                label={t("offlineProductMaterial")}
                variant="secondary"
                onPress={() => void open("material")}
                disabled={busy}
                testID="local-photo-material-camera"
              />
            )}
            <Paper>
              <AppText accessibilityRole="header" variant="heading">
                {t("offlineProductManual")}
              </AppText>
              <TextInput
                value={manualCode}
                onChangeText={setManualCode}
                maxLength={32}
                accessibilityLabel={t("gtinLabel")}
                accessibilityHint={t("gtinHint")}
                keyboardType="number-pad"
                autoCorrect={false}
                autoComplete="off"
                returnKeyType="done"
                testID="offline-product-manual-input"
                style={[
                  styles.codeInput,
                  {
                    color: palette.textPrimary,
                    borderColor: palette.borderSubtle,
                    backgroundColor: palette.bgSurface,
                  },
                ]}
              />
              <Button
                label={t("offlineProductLookup")}
                disabled={!manualCode.trim() || busy}
                onPress={() => {
                  setProductResult(
                    offlineCatalogue?.lookup([manualCode], "manual") ?? { status: "unavailable" },
                  );
                  setObservation(undefined);
                  setObjectHint(undefined);
                  setJpeg(undefined);
                  setManualCode("");
                  setPhase("result");
                }}
                testID="offline-product-manual-submit"
              />
            </Paper>
          </>
        )}
        {phase === "camera" && (
          <>
            <CameraView
              ref={camera}
              style={styles.camera}
              facing="back"
              {...(pictureSize ? { pictureSize } : {})}
              accessibilityLabel={t("localVisionCameraLabel")}
              testID="local-photo-camera"
              onMountError={() => {
                if (cameraGeneration !== generation.current) return;
                clear();
                setError("localVisionError");
              }}
              onCameraReady={() => {
                if (cameraGeneration !== generation.current) return;
                setReady(true);
                void camera.current
                  ?.getAvailablePictureSizesAsync()
                  .then((sizes) => {
                    if (cameraGeneration === generation.current)
                      setPictureSize(choosePhotoSize(sizes));
                  })
                  .catch(() => undefined);
              }}
            />
            <Button
              label={t("localVisionCapture")}
              onPress={() => void capture()}
              disabled={busy || !ready}
              testID="local-photo-capture"
            />
          </>
        )}
        {phase === "preview" && jpeg && (
          <>
            <AppText variant="heading">{t("localVisionPreview")}</AppText>
            <Image
              source={{ uri: `data:image/jpeg;base64,${jpeg}` }}
              style={styles.camera}
              accessibilityLabel={t("localVisionPreview")}
              resizeMode="contain"
            />
            <Button
              label={t("localVisionRecognize")}
              onPress={() => void recognize()}
              disabled={busy}
              testID="local-photo-recognize"
            />
            <Button
              label={t("localVisionAgain")}
              variant="secondary"
              onPress={retake}
              testID="local-photo-retake"
            />
          </>
        )}
        {phase === "processing" && (
          <AppText accessibilityLiveRegion="polite" testID="local-photo-loading">
            {t("localVisionWorking")}
          </AppText>
        )}
        {phase !== "intro" && phase !== "result" && (
          <Button
            label={t("localVisionCancel")}
            variant="secondary"
            onPress={clear}
            testID="local-photo-cancel"
          />
        )}
        {phase === "result" && observation && (
          <>
            <StatusPill label={t("localVisionEstimate")} tone="amber" />
            <AppText accessibilityRole="header" variant="heading" testID="local-photo-object">
              {t(
                observation.object.status === "estimated"
                  ? objectLabels[observation.object.kind]
                  : "localVisionUnknown",
              )}
            </AppText>
            <AppText>{t("localVisionLimit")}</AppText>
            <Paper>
              <AppText variant="heading" accessibilityRole="header">
                {t("localVisionMarkings")}
              </AppText>
              <AppText>
                {t(
                  observation.markings.status === "ambiguous"
                    ? "localVisionConflicting"
                    : observation.markings.candidates.length
                      ? "localVisionMarkingHint"
                      : "localVisionNoMarkings",
                )}
              </AppText>
              {observation.markings.status === "candidates" &&
                observation.markings.candidates.map((marking) => (
                  <Button
                    key={marking.text}
                    label={marking.text}
                    variant="secondary"
                    onPress={() => {
                      clear();
                      router.push({ pathname: "/material-code", params: { code: marking.text } });
                    }}
                  />
                ))}
            </Paper>
            <AppText variant="small" muted>
              {t(
                observation.source.supplement.status === "observed"
                  ? "localVisionSourceMobileClip"
                  : "localVisionSource",
              )}
            </AppText>
            {observation.source.supplement.status === "unavailable" && (
              <AppText testID="local-photo-supplement-unavailable">
                {t("localVisionSupplementUnavailable")}
              </AppText>
            )}
            {observation.source.supplement.status === "observed" && (
              <AppText variant="small" muted>
                MobileCLIP-S0 · {observation.source.supplement.modelRevision.slice(0, 12)} ·{" "}
                {observation.source.supplement.gateVersion}
              </AppText>
            )}
            <AppText variant="small" muted>
              {t("localVisionSourceDetail")} · Vision {observation.source.classificationRevision} /
              OCR {observation.source.ocrRevision} · {observation.source.osVersion} ·{" "}
              {observation.source.normalizerVersion} · {observation.source.abstentionVersion} ·{" "}
              {observation.source.ocrPolicy} · {observation.source.ocrLanguages.join(", ")} ·{" "}
              {new Date(observation.source.observedAt).toLocaleString(
                language === "fi" ? "fi-FI" : "en-GB",
              )}
            </AppText>
            <Button
              label={t("localVisionAgain")}
              variant="secondary"
              onPress={retake}
              testID="local-photo-reset"
            />
          </>
        )}
        {phase === "result" && productResult && (
          <>
            {objectHint && (
              <ObjectCandidateResultView
                result={objectHint}
                onGuide={() => {
                  clear();
                  router.push("/guide");
                }}
              />
            )}
            <OfflineProductResultView result={productResult} />
            <Button
              label={t("localVisionAgain")}
              variant="secondary"
              onPress={retake}
              testID="offline-product-retake"
            />
            <Button
              label={t("offlineProductNewCode")}
              variant="secondary"
              onPress={clear}
              testID="offline-product-reset"
            />
          </>
        )}
        {presentation.showBarcodeRecovery && (
          <Button
            label={t(
              mode === "product" ? "offlineProductOnlineBarcode" : "localVisionBarcodeRecovery",
            )}
            variant="secondary"
            onPress={() => {
              clear();
              router.push("/scan");
            }}
            testID="local-photo-barcode-action"
          />
        )}
        <Button
          label={t("materialCodeAction")}
          variant="secondary"
          onPress={() => {
            clear();
            router.push("/material-code");
          }}
          testID="local-photo-marking-action"
        />
        <Button
          label={t("manualComponentAction")}
          variant="secondary"
          onPress={() => {
            clear();
            router.push("/component");
          }}
        />
        {phase === "intro" && (
          <>
            <AppText variant="small" muted>
              {t("localVisionCloudCost")}
            </AppText>
            <InlineLink
              label={t("localVisionCloud")}
              accessibilityHint={t("localVisionCloudHint")}
              onPress={() => router.push("/photo")}
              testID="local-photo-cloud-action"
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { width: "100%", height: 300, borderRadius: radius.lg },
  codeInput: { minHeight: 52, borderWidth: 2, borderRadius: radius.lg, padding: 16, fontSize: 18 },
});
