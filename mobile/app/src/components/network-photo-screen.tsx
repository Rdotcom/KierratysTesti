import type { NetworkResult } from "@kierratysappi/contracts/network-recognition";
import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import type { MessageKey } from "@kierratysappi/localization";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File, Paths } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState, Linking, Platform, View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import {
  shouldClearLocalPhotoState,
  waitForCameraPermissionResume,
} from "@/features/local-vision/lifecycle";
import { isLocalCaptureUri } from "@/features/local-vision/recognizer";
import {
  networkRecognitionClient as client,
  networkRecognitionOrigin as origin,
} from "@/features/network-recognition/config";
import { localPhotoInitialSize, resolvePhotoCaptureSize } from "@/features/camera/capture";
import { useLanguage } from "@/i18n/language-context";
import { ExpoGoRecognition } from "./expo-go-recognition";
import { ObjectCandidateResultView } from "./object-candidate-result";
import {
  RecognitionConsent,
  RecognitionHeading,
  RecognitionPreview,
  RecognitionRecovery,
  RecognitionStart,
  recognitionStyles,
} from "./recognition-presentation";
import { AppText, Button, PageHeader, Screen, sharedStyles } from "./ui";

function removeCapture(uri: string): void {
  if (!isLocalCaptureUri(uri, Paths.cache.uri)) throw Error("invalid_capture_path");
  const file = new File(uri);
  if (file.exists) file.delete();
}

/** Stock Go uses an explicit, opt-in own-server transport, never the paid photo route. */
export function NetworkPhotoScreen() {
  return origin ? (
    <ConfiguredNetworkPhotoScreen origin={origin} />
  ) : (
    <ExpoGoRecognition networkSetup />
  );
}
function ConfiguredNetworkPhotoScreen({ origin }: { readonly origin: string }) {
  const router = useRouter(),
    { t } = useLanguage();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<"intro" | "camera" | "preview" | "result">("intro");
  const [jpeg, setJpeg] = useState<string>();
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Extract<NetworkResult, { status: "observed" }>>();
  const [error, setError] = useState<MessageKey>();
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string>(localPhotoInitialSize);
  const camera = useRef<CameraView>(null),
    generation = useRef(0),
    locked = useRef(false),
    prompt = useRef(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const clear = useCallback(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = undefined;
    locked.current = false;
    setBusy(false);
    setReady(false);
    setJpeg(undefined);
    setConsent(false);
    setResult(undefined);
    setError(undefined);
    setPhase("intro");
    setPictureSize(localPhotoInitialSize);
  }, []);
  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (shouldClearLocalPhotoState(state, Platform.OS, prompt.current)) clear();
      });
      return () => {
        subscription.remove();
        clear();
      };
    }, [clear]),
  );
  const open = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    const ticket = ++generation.current,
      controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const available = await client.available(controller.signal);
      clearTimeout(timer);
      if (ticket !== generation.current) return;
      if (!available) {
        setError("networkUnavailable");
        return;
      }
      prompt.current = true;
      let granted = false;
      try {
        granted = permission?.granted || (await requestPermission()).granted;
        if (Platform.OS === "android" && granted)
          granted = await waitForCameraPermissionResume(
            {
              get currentState() {
                return AppState.currentState;
              },
              subscribe: (listener) => AppState.addEventListener("change", listener),
            },
            controller.signal,
          );
      } finally {
        prompt.current = false;
      }
      if (ticket !== generation.current || controller.signal.aborted) return;
      if (granted) {
        setReady(false);
        setPhase("camera");
      } else setError("cameraDenied");
    } catch {
      if (ticket === generation.current) setError("networkUnavailable");
    } finally {
      clearTimeout(timer);
      if (ticket === generation.current) {
        locked.current = false;
        setBusy(false);
        pending.current = undefined;
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
      const photo = await camera.current.takePictureAsync({
        base64: true,
        exif: false,
        quality: 0.4,
        imageType: "jpg",
        skipProcessing: false,
      });
      let clean: string;
      try {
        clean = preparePhotoBase64(photo.base64 ?? "");
      } finally {
        removeCapture(photo.uri);
      }
      if (ticket === generation.current) {
        setJpeg(clean);
        setPhase("preview");
      }
    } catch {
      if (ticket === generation.current) {
        setPhase("intro");
        setError("networkError");
      }
    } finally {
      if (ticket === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  // Only this separate button handler grants transport consent. Capture never sends.
  const send = async () => {
    if (locked.current || !jpeg || phase !== "preview" || !consent) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    const ticket = ++generation.current,
      controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await client.recognize(jpeg, true, controller.signal);
      if (ticket !== generation.current) return;
      if (response.status === "observed") {
        setResult(response);
        setJpeg(undefined);
        setConsent(false);
        setPhase("result");
        announceAccessibility(t("objectCandidateTitle"));
      } else
        setError(
          response.reason === "busy" || response.reason === "rate_limited"
            ? "networkRateLimited"
            : response.reason === "offline" ||
                response.reason === "cancelled" ||
                response.reason === "timeout"
              ? "networkUnavailable"
              : "networkError",
        );
    } finally {
      clearTimeout(timer);
      if (ticket === generation.current) {
        locked.current = false;
        setBusy(false);
        pending.current = undefined;
      }
    }
  };
  const cameraGeneration = generation.current;
  return (
    <Screen testID="network-photo-screen">
      <PageHeader
        onBack={() => {
          clear();
          router.canGoBack() ? router.back() : router.replace("/identify");
        }}
      />
      <RecognitionHeading intro={phase === "intro"} />
      <View style={sharedStyles.stack}>
        {error && (
          <AppText accessibilityRole="alert" testID="network-photo-error">
            {t(error)}
          </AppText>
        )}
        {phase === "intro" && (
          <RecognitionStart
            busy={busy}
            beforeNavigate={clear}
            cameraAction={
              permission && !permission.granted && !permission.canAskAgain ? (
                <Button label={t("openSettings")} onPress={() => void Linking.openSettings()} />
              ) : (
                <Button
                  label={t("localVisionCamera")}
                  busy={busy}
                  onPress={() => void open()}
                  testID="network-photo-open-camera"
                />
              )
            }
            details={
              <>
                <AppText>{t("networkIntro")}</AppText>
                <AppText>{t("recognitionMarkingManual")}</AppText>
                <AppText variant="small">
                  {t("networkRecipient")}: {origin}
                </AppText>
              </>
            }
          />
        )}
        {phase === "camera" && (
          <>
            <AppText>{t("networkCaptureGuidance")}</AppText>
            <CameraView
              ref={camera}
              facing="back"
              pictureSize={pictureSize}
              style={recognitionStyles.camera}
              accessibilityLabel={t("networkCameraLabel")}
              onMountError={() => {
                if (cameraGeneration === generation.current) {
                  clear();
                  setError("networkError");
                }
              }}
              onCameraReady={() => {
                const view = camera.current;
                if (!view) return;
                void resolvePhotoCaptureSize(() => view.getAvailablePictureSizesAsync()).then(
                  (size) => {
                    if (cameraGeneration === generation.current && camera.current === view) {
                      setPictureSize(size);
                      setReady(true);
                    }
                  },
                );
              }}
              testID="network-photo-camera"
            />
            <Button
              label={t("localVisionCapture")}
              busy={busy}
              disabled={!ready}
              onPress={() => void capture()}
              testID="network-photo-capture"
            />
          </>
        )}
        {phase === "preview" &&
          jpeg &&
          (consent ? (
            <RecognitionConsent
              origin={origin}
              busy={busy}
              onConfirm={() => void send()}
              onCancel={() => setConsent(false)}
            />
          ) : (
            <RecognitionPreview
              jpeg={jpeg}
              busy={busy}
              onRecognize={() => setConsent(true)}
              onRetake={() => {
                clear();
                void open();
              }}
            />
          ))}
        {result && (
          <ObjectCandidateResultView result={result} onGuide={() => router.push("/guide")} />
        )}
        {phase !== "intro" && (
          <Button
            label={t(phase === "result" ? "offlineProductNewCode" : "localVisionCancel")}
            variant="secondary"
            onPress={clear}
            testID="network-photo-cancel"
          />
        )}
        {phase === "result" && (
          <Button
            label={t("localVisionAgain")}
            variant="secondary"
            onPress={() => {
              clear();
              void open();
            }}
            testID="network-photo-retake"
          />
        )}
        <RecognitionRecovery
          beforeNavigate={clear}
          showBarcode={phase === "intro" || phase === "result"}
          showMarking={phase !== "intro"}
        />
      </View>
    </Screen>
  );
}
