import type { NetworkResult } from "@kierratysappi/contracts/network-recognition";
import type { MessageKey } from "@kierratysappi/localization";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Image, View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import {
  captureBrowserVideo,
  prepareBrowserFile,
  stopBrowserCamera,
} from "@/features/network-recognition/browser-image";
import {
  networkRecognitionClient as client,
  networkRecognitionOrigin as origin,
} from "@/features/network-recognition/config";
import { useLanguage } from "@/i18n/language-context";
import { radius, useAppTheme } from "@/theme/tokens";
import { ObjectCandidateResultView } from "./object-candidate-result";
import { AppText, Button, PageHeader, PageIntro, Paper, Screen, sharedStyles } from "./ui";

/** Browser-only capture. No native hooks, local photo files or automatic image requests. */
export function NetworkPhotoScreen() {
  const router = useRouter(),
    { t } = useLanguage(),
    { palette } = useAppTheme();
  const [phase, setPhase] = useState<"intro" | "camera" | "preview" | "result">("intro");
  const [jpeg, setJpeg] = useState<string>(),
    [result, setResult] = useState<Extract<NetworkResult, { status: "observed" }>>();
  const [error, setError] = useState<MessageKey>(),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [loadingKey, setLoadingKey] = useState<MessageKey>("webImagePreparing");
  const input = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | undefined>(undefined);
  const generation = useRef(0),
    locked = useRef(false),
    pending = useRef<AbortController | undefined>(undefined);
  const stop = useCallback(() => {
    stopBrowserCamera(stream.current);
    stream.current = undefined;
    if (video.current) video.current.srcObject = null;
    setReady(false);
  }, []);
  const clear = useCallback(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = undefined;
    locked.current = false;
    stop();
    setJpeg(undefined);
    setResult(undefined);
    setError(undefined);
    setBusy(false);
    setPhase("intro");
  }, [stop]);
  const attachVideo = useCallback(
    (element: HTMLVideoElement | null) => {
      video.current = element;
      if (element && stream.current) {
        element.srcObject = stream.current;
        void element.play().catch(() => {
          clear();
          setError("webCameraDenied");
        });
      }
    },
    [clear],
  );
  useFocusEffect(
    useCallback(() => {
      const hide = () => {
        if (document.visibilityState === "hidden") clear();
      };
      document.addEventListener("visibilitychange", hide);
      window.addEventListener("pagehide", clear);
      return () => {
        document.removeEventListener("visibilitychange", hide);
        window.removeEventListener("pagehide", clear);
        clear();
      };
    }, [clear]),
  );
  const choose = async (file: File) => {
    clear();
    setLoadingKey("webImagePreparing");
    locked.current = true;
    setBusy(true);
    const ticket = ++generation.current,
      controller = new AbortController();
    pending.current = controller;
    try {
      const image = await prepareBrowserFile(file, controller.signal);
      if (ticket === generation.current) {
        setJpeg(image);
        setPhase("preview");
      }
    } catch {
      if (ticket === generation.current && !controller.signal.aborted) setError("webImageInvalid");
    } finally {
      if (ticket === generation.current) {
        locked.current = false;
        setBusy(false);
        pending.current = undefined;
      }
    }
  };
  const open = async () => {
    if (locked.current) return;
    clear();
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("webCameraSecure");
      return;
    }
    locked.current = true;
    setLoadingKey("localVisionOpening");
    setBusy(true);
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
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } },
        audio: false,
      });
      if (ticket !== generation.current || controller.signal.aborted) {
        stopBrowserCamera(camera);
        return;
      }
      stream.current = camera;
      for (const track of camera.getTracks())
        track.addEventListener(
          "ended",
          () => {
            if (stream.current === camera) {
              clear();
              setError("webCameraDenied");
            }
          },
          { once: true },
        );
      setPhase("camera");
    } catch {
      if (ticket === generation.current && !controller.signal.aborted) setError("webCameraDenied");
    } finally {
      clearTimeout(timer);
      if (ticket === generation.current) {
        locked.current = false;
        setBusy(false);
        pending.current = undefined;
      }
    }
  };
  const capture = () => {
    if (locked.current || !ready || !video.current) return;
    try {
      const image = captureBrowserVideo(video.current);
      stop();
      setJpeg(image);
      setPhase("preview");
    } catch {
      clear();
      setError("webImageInvalid");
    }
  };
  const send = async () => {
    if (locked.current || !jpeg || phase !== "preview") return;
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
        setPhase("result");
        announceAccessibility(t("objectCandidateTitle"));
      } else
        setError(
          response.reason === "rate_limited" || response.reason === "busy"
            ? "networkRateLimited"
            : response.reason === "offline" ||
                response.reason === "timeout" ||
                response.reason === "cancelled"
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
  return (
    <Screen testID="network-photo-screen">
      <PageHeader
        onBack={() => {
          clear();
          router.canGoBack() ? router.back() : router.replace("/identify");
        }}
      />
      <PageIntro
        title={t("networkTitle")}
        {...(phase === "intro" ? { body: t("networkIntro") } : {})}
      />
      <View style={sharedStyles.stack}>
        {error && (
          <AppText accessibilityRole="alert" testID="network-photo-error">
            {t(error)}
          </AppText>
        )}
        {!origin ? (
          <AppText>{t("networkSetup")}</AppText>
        ) : (
          <>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("webChooseImage")}
              data-testid="web-image-input"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void choose(file);
              }}
            />
            {phase === "intro" && (
              <Paper>
                <AppText accessibilityRole="header" variant="heading">
                  {t("webImageStart")}
                </AppText>
                <AppText>{t("webImageHint")}</AppText>
                <Button
                  label={t("webChooseImage")}
                  onPress={() => input.current?.click()}
                  disabled={busy}
                  busy={busy && loadingKey === "webImagePreparing"}
                  testID="web-image-choose"
                />
                <Button
                  label={t("localVisionCamera")}
                  onPress={() => void open()}
                  variant="secondary"
                  disabled={busy}
                  busy={busy && loadingKey === "localVisionOpening"}
                  testID="web-camera-open"
                />
                <AppText variant="small" muted>
                  {t("networkRecipient")}: {origin}
                </AppText>
                {busy && <AppText accessibilityLiveRegion="polite">{t(loadingKey)}</AppText>}
              </Paper>
            )}
            {phase === "camera" && (
              <>
                <AppText>{t("networkCaptureGuidance")}</AppText>
                <video
                  ref={attachVideo}
                  autoPlay
                  muted
                  playsInline
                  aria-label={t("networkCameraLabel")}
                  onLoadedData={() => setReady(true)}
                  style={{
                    width: "100%",
                    maxHeight: 360,
                    objectFit: "contain",
                    background: palette.bgSurface,
                    borderRadius: radius.md,
                  }}
                />
                <Button
                  label={t("localVisionCapture")}
                  onPress={capture}
                  disabled={!ready}
                  testID="web-camera-capture"
                />
              </>
            )}
            {phase === "preview" && jpeg && (
              <Paper>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${jpeg}` }}
                  accessibilityLabel={t("localVisionPreview")}
                  resizeMode="contain"
                  style={{ width: "100%", height: 240 }}
                />
                <AppText variant="small" muted>
                  {t("networkRecipient")}: {origin}
                </AppText>
                <AppText>{t("networkConsent")}</AppText>
                {origin.startsWith("http:") && (
                  <AppText variant="small">{t("networkHttpNotice")}</AppText>
                )}
                <Button
                  label={t("networkSend")}
                  onPress={() => void send()}
                  busy={busy}
                  testID="network-photo-send"
                />
                {busy && <AppText accessibilityLiveRegion="polite">{t("networkSending")}</AppText>}
              </Paper>
            )}
            {result && (
              <ObjectCandidateResultView result={result} onGuide={() => router.push("/guide")} />
            )}
            {(phase !== "intro" || busy) && (
              <Button
                label={t("cancel")}
                onPress={clear}
                variant="secondary"
                testID="network-photo-cancel"
              />
            )}
            {phase === "result" && (
              <Button
                label={t("webChooseAnother")}
                onPress={() => input.current?.click()}
                testID="web-image-another"
              />
            )}
          </>
        )}
        <Button
          label={t("identifyScanAction")}
          variant="quiet"
          onPress={() => router.push("/scan")}
        />
        <Button
          label={t("expoGoManualTitle")}
          variant="quiet"
          onPress={() => router.push("/guide")}
        />
      </View>
    </Screen>
  );
}
