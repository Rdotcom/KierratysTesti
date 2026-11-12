import type { SortingResult } from "@kierratysappi/recycling-engine";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { announceAccessibility } from "@/features/accessibility/announcements";
import type { OverviewMaterial, RecyclingEntry } from "@/features/overview/model";
import { recordableMaterial } from "@/features/overview/recording";
import { readRecyclingSummary, recordRecycling } from "@/features/overview/storage";
import { useSoundFeedback } from "@/features/sound-feedback/context";
import { useLanguage } from "@/i18n/language-context";
import { useAppTheme } from "@/theme/tokens";
import { AppText, Button, InlineLink, Paper, sharedStyles } from "./ui";

const materialKeys = {
  plastic: "overviewMaterialPlastic",
  carton: "overviewMaterialCarton",
  glass: "overviewMaterialGlass",
  metal: "overviewMaterialMetal",
  paper: "overviewMaterialPaper",
  wood: "overviewMaterialWood",
  composite: "overviewMaterialComposite",
  other: "overviewMaterialOther",
} as const;

export function RecycleAction({
  sorting,
  material,
  recordId,
  label,
}: {
  readonly sorting: SortingResult;
  readonly material: unknown;
  readonly recordId: string;
  readonly label?: string;
}) {
  const knownMaterial = recordableMaterial(sorting, material);
  if (!knownMaterial) return null;
  return (
    <RecordAction
      key={`${recordId}:${knownMaterial}`}
      material={knownMaterial}
      recordId={recordId}
      label={label}
    />
  );
}

function RecordAction({
  material,
  recordId,
  label,
}: {
  readonly material: OverviewMaterial;
  readonly recordId: string;
  readonly label: string | undefined;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const { palette } = useAppTheme();
  const [state, setState] = useState<"loading" | "ready" | "saved" | "error">("loading");
  const [savedMaterial, setSavedMaterial] = useState<OverviewMaterial>();
  const { play } = useSoundFeedback();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadVersion = useRef(0);
  const locked = useRef(false);
  const active = useRef(false);
  const pending = useRef<RecyclingEntry | undefined>(undefined);

  const refresh = useCallback(() => {
    const request = ++loadVersion.current;
    setState("loading");
    setConfirming(false);
    void readRecyclingSummary()
      .then((summary) => {
        if (active.current && request === loadVersion.current) {
          const entry = summary.recent.find((item) => item.id === recordId);
          setSavedMaterial(entry?.material);
          setState(entry ? "saved" : "ready");
        }
      })
      .catch(() => {
        if (active.current && request === loadVersion.current) setState("error");
      });
  }, [recordId]);

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setSaving(locked.current);
      refresh();
      return () => {
        loadVersion.current++;
        active.current = false;
      };
    }, [refresh]),
  );

  const save = async () => {
    if (locked.current || !confirming || state !== "ready") return;
    locked.current = true;
    setSaving(true);
    const savedLabel = label
      ?.replace(/\p{Cc}/gu, "")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 80);
    pending.current ??= {
      id: recordId,
      material,
      quantity: 1,
      recycledAt: new Date().toISOString(),
      ...(savedLabel ? { label: savedLabel } : {}),
    };
    try {
      const summary = await recordRecycling(pending.current);
      if (active.current) {
        setSavedMaterial(summary.recent.find((entry) => entry.id === recordId)?.material);
        setState("saved");
        setConfirming(false);
        play("confirm");
        announceAccessibility(t("recyclingSaved"));
      }
    } catch {
      if (active.current) {
        setState("error");
        setConfirming(false);
        play("attention");
        announceAccessibility(t("recyclingSaveError"), "high");
      }
    } finally {
      locked.current = false;
      if (active.current) setSaving(false);
    }
  };

  return (
    <View style={sharedStyles.tightStack} testID={`recycle-action-${recordId}`}>
      {state === "saved" ? (
        <View style={sharedStyles.tightStack} accessibilityLiveRegion="polite">
          <AppText style={{ color: palette.actionLink }}>
            {t("recyclingAlreadySaved")}
            {savedMaterial ? ` · ${t(materialKeys[savedMaterial])}` : ""}
          </AppText>
          {savedMaterial && savedMaterial !== material && (
            <AppText variant="small" muted>
              {t("recyclingCorrectionNote")}
            </AppText>
          )}
        </View>
      ) : state === "error" ? (
        <>
          <AppText accessibilityRole="alert" style={{ color: palette.brick }}>
            {t("recyclingSaveError")}
          </AppText>
          <Button label={t("retry")} variant="secondary" onPress={refresh} />
        </>
      ) : confirming ? (
        <Paper testID="recycle-confirm-panel">
          <AppText variant="heading" accessibilityRole="header">
            {t("recyclingConfirmTitle")}
          </AppText>
          <AppText>{t("recyclingConfirmBody")}</AppText>
          <AppText variant="label">
            {t(materialKeys[material])} · 1 {t("overviewPartSingular")}
          </AppText>
          <Button
            label={t("recyclingConfirmAction")}
            disabled={saving}
            busy={saving}
            onPress={() => void save()}
            testID="recycle-confirm-action"
          />
          <Button
            label={t("cancel")}
            variant="secondary"
            disabled={saving}
            onPress={() => setConfirming(false)}
            testID="recycle-confirm-cancel"
          />
        </Paper>
      ) : (
        <Button
          label={t("recyclingMarkAction")}
          variant="secondary"
          disabled={state === "loading"}
          onPress={() => setConfirming(true)}
          testID="recycle-mark-action"
        />
      )}
      <InlineLink
        label={t("overviewOpenAction")}
        onPress={() => router.push("/overview")}
        role="button"
        testID="recycle-overview-action"
      />
    </View>
  );
}
