import type { MessageKey } from "@kierratysappi/localization";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  AppText,
  Button,
  ChoiceIndicator,
  PageHeader,
  PageIntro,
  Paper,
  Rule,
  Screen,
  SectionHeader,
  sharedStyles,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { formatHistoryDate } from "@/features/history/presentation";
import {
  emptyRecyclingSummary,
  materialBreakdown,
  type OverviewMaterial,
  overviewMaterials,
  type RecyclingEntry,
  type RecyclingSummary,
  totalRecycled,
} from "@/features/overview/model";
import { recyclingIntentIsSaved, saveRecyclingIntent } from "@/features/overview/save-intent";
import {
  clearRecyclingSummary,
  readRecyclingSummary,
  removeRecyclingEntry,
} from "@/features/overview/storage";
import { useLanguage } from "@/i18n/language-context";
import type { AppPalette } from "@/theme/palettes";
import { controls, focusRing, interaction, radius, spacing, useAppTheme } from "@/theme/tokens";

const materialKeys = {
  plastic: "overviewMaterialPlastic",
  carton: "overviewMaterialCarton",
  glass: "overviewMaterialGlass",
  metal: "overviewMaterialMetal",
  paper: "overviewMaterialPaper",
  wood: "overviewMaterialWood",
  composite: "overviewMaterialComposite",
  other: "overviewMaterialOther",
} as const satisfies Record<OverviewMaterial, MessageKey>;

type OverviewState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly summary: RecyclingSummary }
  | { readonly status: "error" };

type Confirmation =
  | { readonly kind: "clear" }
  | { readonly kind: "remove"; readonly entry: RecyclingEntry };

function materialColor(material: OverviewMaterial, palette: AppPalette): string {
  const colors = {
    plastic: palette.pine,
    carton: palette.amber,
    glass: palette.cobalt,
    metal: palette.textSecondary,
    paper: palette.actionLink,
    wood: palette.brick,
    composite: palette.textTertiary,
    other: palette.borderStrong,
  };
  return colors[material];
}

export default function OverviewScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { palette } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const [state, setState] = useState<OverviewState>({ status: "loading" });
  const [material, setMaterial] = useState<OverviewMaterial>();
  const [quantity, setQuantity] = useState("1");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveUnconfirmed, setSaveUnconfirmed] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [operationError, setOperationError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [focused, setFocused] = useState<string>();
  const generation = useRef(0);
  const active = useRef(false);
  const operationLocked = useRef(false);
  const pendingEntry = useRef<RecyclingEntry | undefined>(undefined);

  const resetForm = useCallback(() => {
    pendingEntry.current = undefined;
    setSaveUnconfirmed(false);
    setMaterial(undefined);
    setQuantity("1");
    setLabel("");
  }, []);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setState({ status: "loading" });
    setOperationError(undefined);
    try {
      const summary = await readRecyclingSummary();
      if (active.current && request === generation.current) {
        setState({ status: "ready", summary });
        if (
          !operationLocked.current &&
          pendingEntry.current &&
          recyclingIntentIsSaved(summary, pendingEntry.current)
        ) {
          resetForm();
          setNotice(t("recyclingSaved"));
        }
      }
    } catch {
      if (active.current && request === generation.current) setState({ status: "error" });
    }
  }, [resetForm, t]);

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setBusy(operationLocked.current);
      setConfirmation(undefined);
      setNotice(undefined);
      void refresh();
      return () => {
        active.current = false;
        generation.current++;
      };
    }, [refresh]),
  );

  const runMutation = async (
    work: () => Promise<RecyclingSummary>,
    success: string,
    afterSuccess?: () => void,
    failureMessage?: string,
  ) => {
    if (operationLocked.current) return;
    operationLocked.current = true;
    const request = generation.current;
    setBusy(true);
    setOperationError(undefined);
    setNotice(undefined);
    try {
      const summary = await work();
      afterSuccess?.();
      if (active.current && request === generation.current) {
        setState({ status: "ready", summary });
        setConfirmation(undefined);
        setNotice(success);

        announceAccessibility(success);
      }
    } catch {
      if (active.current && request === generation.current) {
        const message = failureMessage ?? t("overviewStorageError");
        setOperationError(message);

        announceAccessibility(message, "high");
      }
    } finally {
      operationLocked.current = false;
      if (active.current) setBusy(false);
    }
  };

  const formDisabled = busy || saveUnconfirmed || confirmation !== undefined;
  const validQuantity = /^[1-9]\d?$/u.test(quantity);
  const addRecord = () => {
    if (
      !material ||
      !validQuantity ||
      state.status !== "ready" ||
      confirmation ||
      operationLocked.current
    )
      return;
    Keyboard.dismiss();
    const name = label
      .replace(/\p{Cc}/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    const entry = pendingEntry.current ?? {
      id: `recycled-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
      material,
      quantity: Number(quantity),
      ...(name ? { label: name } : {}),
      recycledAt: new Date().toISOString(),
    };
    pendingEntry.current = entry;
    void runMutation(
      async () => {
        const result = await saveRecyclingIntent(entry);
        if (result.status === "saved") return result.summary;
        setSaveUnconfirmed(true);
        throw new Error("recycling_save_unconfirmed");
      },
      t("recyclingSaved"),
      resetForm,
      t("overviewSaveUnconfirmed"),
    );
  };

  const confirmMutation = () => {
    if (!confirmation) return;
    if (confirmation.kind === "remove") {
      void runMutation(() => removeRecyclingEntry(confirmation.entry.id), t("overviewRemoved"));
    } else {
      void runMutation(
        async () => {
          await clearRecyclingSummary();
          return emptyRecyclingSummary();
        },
        t("overviewCleared"),
        resetForm,
      );
    }
  };

  const requestConfirmation = (next: Confirmation) => {
    if (operationLocked.current) return;
    setOperationError(undefined);
    setNotice(undefined);
    setConfirmation(next);
  };

  const summary = state.status === "ready" ? state.summary : undefined;
  const total = summary ? totalRecycled(summary) : 0;
  const rows = summary
    ? materialBreakdown(summary)
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count)
    : [];
  const number = (value: number) => value.toLocaleString(language === "fi" ? "fi-FI" : "en-GB");
  const partCount = (value: number) =>
    `${number(value)} ${t(value === 1 ? "overviewPartSingular" : "overviewPartPlural")}`;

  return (
    <Screen testID="overview-screen">
      <PageHeader onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <PageIntro title={t("overviewTitle")} body={t("overviewIntro")} />
      {notice && (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: palette.pine }}
          testID="overview-notice"
        >
          {notice}
        </AppText>
      )}
      {state.status === "loading" && (
        <Paper>
          <ActivityIndicator
            color={palette.actionPrimary}
            accessibilityLabel={t("overviewLoading")}
          />
          <AppText muted>{t("overviewLoading")}</AppText>
        </Paper>
      )}
      {state.status === "error" && (
        <Paper testID="overview-read-error">
          <AppText variant="heading" accessibilityRole="alert">
            {t("overviewReadErrorTitle")}
          </AppText>
          <AppText>{t("overviewReadErrorBody")}</AppText>
          <Button
            label={t("retry")}
            onPress={() => void refresh()}
            disabled={busy}
            testID="overview-retry-action"
          />
          <Button
            label={t("overviewClearAction")}
            variant="danger"
            onPress={() => requestConfirmation({ kind: "clear" })}
            disabled={busy}
            testID="overview-clear-action"
          />
          {confirmation?.kind === "clear" && (
            <ConfirmationPanel
              kind="clear"
              busy={busy}
              error={operationError}
              onConfirm={confirmMutation}
              onCancel={() => setConfirmation(undefined)}
            />
          )}
        </Paper>
      )}
      {summary && (
        <View style={styles.sections}>
          <Paper
            style={{ backgroundColor: palette.pineSoft, borderColor: palette.borderSubtle }}
            testID="overview-summary"
          >
            <AppText variant="small" muted>
              {t("overviewLifetime")}
            </AppText>
            <View style={styles.totalBlock}>
              <AppText
                variant="display"
                style={[styles.total, total >= 1_000_000 && styles.longTotal]}
                accessibilityLabel={`${t("overviewTotal")}: ${number(total)}`}
                testID="overview-total"
              >
                {number(total)}
              </AppText>
              <AppText variant="label">{t("overviewTotal")}</AppText>
            </View>
            <AppText variant="small" muted>
              {t("overviewSelfReported")}
            </AppText>
          </Paper>

          {total === 0 ? (
            <View style={sharedStyles.tightStack} testID="overview-empty">
              <AppText variant="heading" accessibilityRole="header">
                {t("overviewEmptyTitle")}
              </AppText>
              <AppText muted>{t("overviewEmptyBody")}</AppText>
            </View>
          ) : (
            <Paper testID="overview-breakdown">
              <SectionHeader title={t("overviewBreakdown")} />
              <View
                style={styles.segmentBar}
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${t("overviewChartLabel")}: ${rows.map((row) => `${t(materialKeys[row.material])} ${row.percentage}%`).join(", ")}`}
                testID="overview-material-chart"
              >
                {rows.map((row) => (
                  <View
                    key={row.material}
                    style={{
                      flex: row.count,
                      backgroundColor: materialColor(row.material, palette),
                    }}
                  />
                ))}
              </View>
              <AppText variant="small" muted>
                {t("overviewBasis")}
              </AppText>
              {rows.map((row) => (
                <View
                  key={row.material}
                  style={styles.materialRow}
                  testID={`overview-row-${row.material}`}
                >
                  <View
                    style={[
                      styles.materialDot,
                      { backgroundColor: materialColor(row.material, palette) },
                    ]}
                    accessible={false}
                    aria-hidden
                  />
                  <View style={sharedStyles.grow}>
                    <AppText variant="label">{t(materialKeys[row.material])}</AppText>
                    <AppText variant="small" muted>
                      {partCount(row.count)}
                    </AppText>
                  </View>
                  <AppText variant="heading" testID={`overview-percent-${row.material}`}>
                    {row.percentage}%
                  </AppText>
                </View>
              ))}
            </Paper>
          )}

          <Paper testID="overview-record-form">
            <SectionHeader title={t("overviewFormTitle")} />
            <AppText muted>{t("overviewFormBody")}</AppText>
            <View
              style={sharedStyles.tightStack}
              accessibilityRole="radiogroup"
              accessibilityLabel={t("overviewMaterialLabel")}
            >
              <AppText variant="label">{t("overviewMaterialLabel")}</AppText>
              <View style={styles.materialChoices}>
                {overviewMaterials.map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={t(materialKeys[value])}
                    accessibilityState={{ checked: material === value, disabled: formDisabled }}
                    aria-checked={material === value}
                    disabled={formDisabled}
                    onFocus={() => setFocused(value)}
                    onBlur={() => setFocused(undefined)}
                    onPress={() => {
                      if (formDisabled) return;
                      setMaterial(value);
                      pendingEntry.current = undefined;
                    }}
                    testID={`overview-material-${value}`}
                    style={({ pressed }) => [
                      styles.materialChoice,
                      {
                        flexBasis: width < 360 || fontScale >= 1.5 ? "100%" : "46%",
                        backgroundColor: material === value ? palette.pineSoft : palette.bgSurface,
                        borderColor:
                          focused === value
                            ? palette.actionLink
                            : material === value
                              ? palette.actionPrimary
                              : palette.borderSubtle,
                        boxShadow: focused === value ? focusRing(palette) : "none",
                        opacity: formDisabled
                          ? interaction.disabledOpacity
                          : pressed
                            ? interaction.pressedOpacity
                            : 1,
                      },
                    ]}
                  >
                    <ChoiceIndicator selected={material === value} />
                    <AppText variant="label" style={sharedStyles.grow}>
                      {t(materialKeys[value])}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={sharedStyles.tightStack}>
              <AppText variant="label" nativeID="overview-quantity-label">
                {t("overviewQuantityLabel")}
              </AppText>
              <TextInput
                accessibilityLabel={t("overviewQuantityLabel")}
                accessibilityLabelledBy="overview-quantity-label"
                accessibilityHint={t("overviewQuantityHint")}
                inputMode="numeric"
                keyboardType="number-pad"
                autoComplete="off"
                maxLength={3}
                editable={!formDisabled}
                value={quantity}
                onChangeText={(value) => {
                  if (formDisabled) return;
                  setQuantity(value);
                  pendingEntry.current = undefined;
                }}
                onFocus={() => setFocused("quantity")}
                onBlur={() => setFocused(undefined)}
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.bgSurface,
                    color: palette.textPrimary,
                    borderColor: focused === "quantity" ? palette.actionLink : palette.borderStrong,
                  },
                ]}
                testID="overview-quantity-input"
              />
              <AppText variant="small" muted>
                {t("overviewQuantityHint")}
              </AppText>
            </View>
            <View style={sharedStyles.tightStack}>
              <AppText variant="label" nativeID="overview-label-label">
                {t("overviewLabelLabel")}
              </AppText>
              <TextInput
                accessibilityLabel={t("overviewLabelLabel")}
                accessibilityLabelledBy="overview-label-label"
                accessibilityHint={t("overviewLabelHint")}
                autoComplete="off"
                editable={!formDisabled}
                maxLength={80}
                value={label}
                onChangeText={(value) => {
                  if (formDisabled) return;
                  setLabel(value);
                  pendingEntry.current = undefined;
                }}
                onFocus={() => setFocused("label")}
                onBlur={() => setFocused(undefined)}
                placeholder={t("overviewLabelPlaceholder")}
                placeholderTextColor={palette.textTertiary}
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.bgSurface,
                    color: palette.textPrimary,
                    borderColor: focused === "label" ? palette.actionLink : palette.borderStrong,
                  },
                ]}
                testID="overview-label-input"
              />
              <AppText variant="small" muted>
                {t("overviewLabelHint")}
              </AppText>
            </View>
            {!saveUnconfirmed && !confirmation && operationError && (
              <AppText accessibilityRole="alert" style={{ color: palette.statusError }}>
                {operationError}
              </AppText>
            )}
            {saveUnconfirmed && (
              <AppText accessibilityRole="alert" testID="overview-save-unconfirmed">
                {t("overviewSaveUnconfirmed")}
              </AppText>
            )}
            <Button
              label={t(saveUnconfirmed ? "overviewRetrySave" : "overviewAddAction")}
              onPress={addRecord}
              busy={busy && !confirmation}
              disabled={!material || !validQuantity || busy || confirmation !== undefined}
              testID="overview-add-action"
            />
          </Paper>

          {summary.recent.length > 0 && (
            <Paper testID="overview-recent">
              <SectionHeader title={t("overviewRecent")} />
              <AppText variant="small" muted>
                {t("overviewRecentBody")}
              </AppText>
              {summary.recent.map((entry) => (
                <View key={entry.id} style={styles.recentEntry} testID="overview-recent-entry">
                  <View style={styles.materialRow}>
                    <View
                      style={[
                        styles.materialDot,
                        { backgroundColor: materialColor(entry.material, palette) },
                      ]}
                      accessible={false}
                      aria-hidden
                    />
                    <View style={sharedStyles.grow}>
                      <AppText variant="label">
                        {entry.label ?? t(materialKeys[entry.material])}
                      </AppText>
                      <AppText variant="small" muted>
                        {t(materialKeys[entry.material])} · {partCount(entry.quantity)}
                      </AppText>
                      <AppText variant="small" muted>
                        {formatHistoryDate(entry.recycledAt, language)}
                      </AppText>
                    </View>
                  </View>
                  <Button
                    label={t("overviewRemoveAction")}
                    variant="quiet"
                    disabled={busy}
                    accessibilityHint={`${entry.label ?? t(materialKeys[entry.material])}, ${partCount(entry.quantity)}`}
                    onPress={() => requestConfirmation({ kind: "remove", entry })}
                    testID={`overview-remove-${entry.id}`}
                  />
                  {confirmation?.kind === "remove" && confirmation.entry.id === entry.id && (
                    <ConfirmationPanel
                      kind="remove"
                      busy={busy}
                      error={operationError}
                      onConfirm={confirmMutation}
                      onCancel={() => setConfirmation(undefined)}
                    />
                  )}
                </View>
              ))}
            </Paper>
          )}

          {(total > 0 || saveUnconfirmed) && (
            <View style={sharedStyles.tightStack}>
              <Rule />
              <Button
                label={t("overviewClearAction")}
                variant="danger"
                disabled={busy}
                onPress={() => requestConfirmation({ kind: "clear" })}
                testID="overview-clear-action"
              />
              {confirmation?.kind === "clear" && (
                <ConfirmationPanel
                  kind="clear"
                  busy={busy}
                  error={operationError}
                  onConfirm={confirmMutation}
                  onCancel={() => setConfirmation(undefined)}
                />
              )}
            </View>
          )}
        </View>
      )}
      <AppText variant="small" muted>
        {t("recyclingPrivacyNote")}
      </AppText>
    </Screen>
  );
}

function ConfirmationPanel({
  kind,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  readonly kind: "clear" | "remove";
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLanguage();
  const { palette } = useAppTheme();
  return (
    <View
      style={[styles.confirmation, { borderColor: palette.statusError }]}
      accessibilityLiveRegion="polite"
      testID="overview-confirm-panel"
    >
      <AppText variant="heading" accessibilityRole="header">
        {t(kind === "clear" ? "overviewClearConfirmTitle" : "overviewRemoveConfirmTitle")}
      </AppText>
      <AppText>
        {t(kind === "clear" ? "overviewClearConfirmBody" : "overviewRemoveConfirmBody")}
      </AppText>
      {error && (
        <AppText accessibilityRole="alert" style={{ color: palette.statusError }}>
          {error}
        </AppText>
      )}
      <Button
        label={t(kind === "clear" ? "overviewClearConfirmAction" : "overviewRemoveConfirmAction")}
        variant="danger"
        onPress={onConfirm}
        busy={busy}
        testID="overview-confirm-action"
      />
      <Button
        label={t("cancel")}
        variant="secondary"
        onPress={onCancel}
        disabled={busy}
        testID="overview-confirm-cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: spacing.lg },
  totalBlock: { gap: spacing.xs },
  total: { fontSize: 48, lineHeight: 58, letterSpacing: -1.5 },
  longTotal: { fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  segmentBar: {
    minHeight: 22,
    borderRadius: radius.pill,
    overflow: "hidden",
    flexDirection: "row",
  },
  materialRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  materialDot: { width: 12, height: 12, borderRadius: 6 },
  materialChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  materialChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    minHeight: controls.minimumTouchTarget,
    flexGrow: 1,
    borderWidth: 2,
    borderRadius: radius.md,
  },
  input: {
    minHeight: controls.inputMinHeight,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  recentEntry: { paddingTop: spacing.md, gap: spacing.xs },
  confirmation: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
