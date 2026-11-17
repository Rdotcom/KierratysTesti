import { useFocusEffect, useRouter } from "expo-router";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { AppState, Image, Keyboard, StyleSheet, TextInput } from "react-native";
import { useScanSession } from "@/features/scan/session-context";
import { useLanguage } from "@/i18n/language-context";
import { radius, useAppTheme } from "@/theme/tokens";
import { AppText, Button, InlineLink, PageIntro, Paper } from "./ui";

/** Shared app-owned presentation. Hosts supply capture/inference, not another design. */
export const recognitionStyles = StyleSheet.create({
  camera: { width: "100%", height: 300, borderRadius: radius.lg },
  codeInput: { minHeight: 52, borderWidth: 2, borderRadius: radius.lg, padding: 16, fontSize: 18 },
});

export function RecognitionHeading({ intro }: { readonly intro: boolean }) {
  const { t } = useLanguage();
  return (
    <PageIntro title={t("networkTitle")} {...(intro ? { body: t("objectCandidateIntro") } : {})} />
  );
}

export function RecognitionDetails({ children }: { readonly children: ReactNode }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <InlineLink
        label={t("recognitionDetails")}
        role="button"
        expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        testID="recognition-details-toggle"
      />
      {expanded && <Paper testID="recognition-details">{children}</Paper>}
    </>
  );
}

export function RecognitionStart({
  cameraAction,
  fileAction,
  beforeNavigate,
  details,
  busy,
}: {
  readonly cameraAction: ReactNode;
  readonly fileAction?: ReactNode;
  readonly beforeNavigate: () => void;
  readonly details: ReactNode;
  readonly busy: boolean;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  return (
    <>
      {cameraAction}
      {fileAction}
      <Button
        label={t("materialCodeAction")}
        disabled={busy}
        variant="secondary"
        onPress={() => {
          beforeNavigate();
          router.push("/material-code");
        }}
        testID="recognition-material-code"
      />
      <RecognitionManualBarcode beforeNavigate={beforeNavigate} captureBusy={busy} />
      <RecognitionDetails>{details}</RecognitionDetails>
    </>
  );
}

function RecognitionManualBarcode({
  beforeNavigate,
  captureBusy,
}: {
  readonly beforeNavigate: () => void;
  readonly captureBusy: boolean;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const { palette } = useAppTheme();
  const { lookupBarcode } = useScanSession();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const generation = useRef(0),
    locked = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setBusy(false);
      setValue("");
      setInvalid(false);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") return;
        generation.current++;
        locked.current = false;
        setValue("");
        setInvalid(false);
        setBusy(false);
      });
      return () => {
        subscription.remove();
        generation.current++;
        locked.current = false;
      };
    }, []),
  );
  const lookup = async () => {
    if (locked.current || captureBusy || !value.trim()) return;
    Keyboard.dismiss();
    locked.current = true;
    setBusy(true);
    setInvalid(false);
    const ticket = generation.current;
    try {
      const attempt = await lookupBarcode(value, "manual");
      if (ticket !== generation.current) return;
      if (attempt.accepted) {
        beforeNavigate();
        router.push("/result");
      } else if (attempt.reason === "invalid") setInvalid(true);
    } finally {
      if (ticket === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <Paper testID="recognition-manual-card">
      <AppText accessibilityRole="header" variant="heading">
        {t("offlineProductManual")}
      </AppText>
      <TextInput
        value={value}
        editable={!captureBusy && !busy}
        onChangeText={(next) => {
          setValue(next);
          setInvalid(false);
        }}
        onSubmitEditing={() => void lookup()}
        maxLength={32}
        accessibilityLabel={t("gtinLabel")}
        accessibilityHint={t("gtinHint")}
        keyboardType="number-pad"
        autoCorrect={false}
        autoComplete="off"
        returnKeyType="done"
        testID="offline-product-manual-input"
        style={[
          recognitionStyles.codeInput,
          {
            color: palette.textPrimary,
            borderColor: palette.borderSubtle,
            backgroundColor: palette.bgSurface,
          },
        ]}
      />
      {invalid && (
        <AppText accessibilityRole="alert" testID="recognition-manual-error">
          {t("offlineProductInvalid")}
        </AppText>
      )}
      <Button
        label={t("offlineProductLookup")}
        disabled={captureBusy || !value.trim()}
        busy={busy}
        onPress={() => void lookup()}
        testID="offline-product-manual-submit"
      />
    </Paper>
  );
}

export function RecognitionPreview({
  jpeg,
  onRecognize,
  onRetake,
  busy,
}: {
  readonly jpeg: string;
  readonly onRecognize: () => void;
  readonly onRetake: () => void;
  readonly busy: boolean;
}) {
  const { t } = useLanguage();
  return (
    <>
      <AppText accessibilityRole="header" variant="heading" testID="network-photo-preview-title">
        {t("localVisionPreview")}
      </AppText>
      <Image
        source={{ uri: `data:image/jpeg;base64,${jpeg}` }}
        style={recognitionStyles.camera}
        accessibilityLabel={t("localVisionPreview")}
        resizeMode="contain"
      />
      <Button
        label={t("recognitionAction")}
        onPress={onRecognize}
        busy={busy}
        testID="local-photo-recognize"
      />
      <Button
        label={t("localVisionAgain")}
        variant="secondary"
        onPress={onRetake}
        disabled={busy}
        testID="local-photo-retake"
      />
    </>
  );
}

export function RecognitionRecovery({
  beforeNavigate,
  showBarcode,
  showMarking,
}: {
  readonly beforeNavigate: () => void;
  readonly showBarcode: boolean;
  readonly showMarking: boolean;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const navigate = (route: "/scan" | "/material-code" | "/component") => {
    beforeNavigate();
    router.push(route);
  };
  return (
    <>
      {showBarcode && (
        <Button
          label={t("identifyScanAction")}
          variant="secondary"
          onPress={() => navigate("/scan")}
          testID="local-photo-barcode-action"
        />
      )}
      {showMarking && (
        <Button
          label={t("materialCodeAction")}
          variant="secondary"
          onPress={() => navigate("/material-code")}
          testID="local-photo-marking-action"
        />
      )}
      <Button
        label={t("manualComponentAction")}
        variant="secondary"
        onPress={() => navigate("/component")}
        testID="recognition-component-action"
      />
    </>
  );
}

export function RecognitionConsent({
  origin,
  onConfirm,
  onCancel,
  busy,
}: {
  readonly origin: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly busy: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Paper testID="network-photo-consent">
      <AppText accessibilityRole="header" variant="heading">
        {t("recognitionSendTitle")}
      </AppText>
      <AppText variant="small">
        {t("networkRecipient")}: {origin}
      </AppText>
      <AppText>{t("networkConsent")}</AppText>
      {origin.startsWith("http:") && <AppText variant="small">{t("networkHttpNotice")}</AppText>}
      <Button
        label={t("networkSend")}
        onPress={onConfirm}
        busy={busy}
        testID="network-photo-send"
      />
      <Button
        label={t("back")}
        variant="secondary"
        onPress={onCancel}
        disabled={busy}
        testID="network-consent-back"
      />
      {busy && <AppText accessibilityLiveRegion="polite">{t("networkSending")}</AppText>}
    </Paper>
  );
}
