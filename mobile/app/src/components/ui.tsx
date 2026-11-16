import { usePathname } from "expo-router";
import {
  type ComponentRef,
  type PropsWithChildren,
  type ReactNode,
  type Ref,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { activeTab } from "@/features/navigation/routes";
import { useLanguage } from "@/i18n/language-context";
import {
  controls,
  focusRing,
  interaction,
  radius,
  spacing,
  typography,
  useAppTheme,
} from "@/theme/tokens";
import { navigationTileMinimumWidth, screenLayout } from "./navigation-layout";
import { LeafBrandMark } from "./reference-artwork";

type TextVariant = "display" | "title" | "heading" | "body" | "small" | "label" | "mono";

export function AppText({
  variant = "body",
  muted = false,
  style,
  ...props
}: TextProps & { readonly variant?: TextVariant; readonly muted?: boolean }) {
  const { palette } = useAppTheme();
  return (
    <Text
      {...props}
      style={[
        textStyles[variant],
        { color: muted ? palette.textSecondary : palette.textPrimary },
        style,
      ]}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  style,
  testID,
  scrollRef,
}: PropsWithChildren<{
  readonly scroll?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  readonly scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
}>) {
  const { palette } = useAppTheme();
  const { language } = useLanguage();
  const path = usePathname();
  const content = <View style={[styles.content, style]}>{children}</View>;
  return (
    <SafeAreaView
      nativeID="app-screen-surface"
      accessibilityLanguage={language === "fi" ? "fi-FI" : "en"}
      style={[styles.safeArea, { backgroundColor: palette.bgCanvas }]}
      edges={activeTab(path) ? ["top"] : ["top", "bottom"]}
      testID={testID}
    >
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function BrandLockup({ compact = false }: { readonly compact?: boolean }) {
  const { t } = useLanguage();
  return (
    <View
      style={styles.brand}
      accessible
      accessibilityLabel={compact ? t("appName") : `${t("appName")}. ${t("tagline")}`}
    >
      <LeafBrandMark size={compact ? 30 : 42} />
      <View style={styles.sectionTitle}>
        <AppText variant={compact ? "heading" : "title"}>{t("appName")}</AppText>
        {!compact && (
          <AppText variant="small" muted>
            {t("tagline")}
          </AppText>
        )}
      </View>
    </View>
  );
}

/** Quiet navigation for subpages; the main wordmark belongs on Home. */
export function PageHeader({
  onBack,
  label,
  testID,
}: {
  readonly onBack: () => void;
  readonly label?: string;
  readonly testID?: string;
}) {
  const { palette } = useAppTheme();
  const { t } = useLanguage();
  const backLabel = label ?? t("back");
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.pageHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
        style={({ pressed }) => [
          styles.backAction,
          {
            backgroundColor: palette.bgSurface,
            borderColor: focused ? palette.actionLink : "transparent",
            boxShadow: focused ? focusRing(palette) : "none",
            opacity: pressed ? interaction.pressedOpacity : 1,
          },
        ]}
      >
        <Chevron back />
        <AppText variant="label">{backLabel}</AppText>
      </Pressable>
      <View style={styles.headerBrand}>
        <LeafBrandMark size={26} />
        <AppText variant="small" style={styles.headerWordmark}>
          {t("appName")}
        </AppText>
      </View>
    </View>
  );
}

export function PageIntro({ title, body }: { readonly title: string; readonly body?: string }) {
  return (
    <View style={styles.pageIntro}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {body && <AppText muted>{body}</AppText>}
    </View>
  );
}

export function DocumentSection({
  children,
  style,
  testID,
}: PropsWithChildren<{
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}>) {
  const { palette } = useAppTheme();
  return (
    <View
      style={[styles.documentSection, { borderColor: palette.borderSubtle }, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function Chevron({ back = false }: { readonly back?: boolean }) {
  const { palette } = useAppTheme();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <View
        style={[
          styles.chevron,
          {
            borderColor: palette.textSecondary,
            transform: [{ rotate: back ? "135deg" : "-45deg" }],
          },
        ]}
      />
    </View>
  );
}

export function ActionRow({
  label,
  detail,
  leading,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly detail?: string;
  readonly leading?: ReactNode;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const { palette } = useAppTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      testID={testID}
      style={({ pressed }) => [
        styles.actionRow,
        {
          borderColor: focused ? palette.actionLink : palette.borderSubtle,
          backgroundColor: pressed ? palette.pineSoft : "transparent",
          boxShadow: focused ? focusRing(palette) : "none",
          opacity: pressed ? interaction.pressedOpacity : 1,
        },
      ]}
    >
      {leading && (
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          {leading}
        </View>
      )}
      <View style={sharedStyles.grow}>
        <AppText variant="label">{label}</AppText>
        {detail && (
          <AppText variant="small" muted>
            {detail}
          </AppText>
        )}
      </View>
      <Chevron />
    </Pressable>
  );
}

/** A real navigation action, with flexible height and a single accessible name. */
export function NavigationTile({
  label,
  detail,
  icon,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly detail: string;
  readonly icon: ReactNode;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const { palette } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const minimumWidth = navigationTileMinimumWidth(width, fontScale);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.navigationTile,
        {
          minWidth: minimumWidth,
          flexBasis: minimumWidth,
          backgroundColor: pressed ? palette.pineSoft : palette.surface,
          borderColor: focused ? palette.actionLink : palette.borderSubtle,
        },
      ]}
    >
      <View style={styles.tileTop}>
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          {icon}
        </View>
        <Chevron />
      </View>
      <View style={sharedStyles.tightStack}>
        <AppText variant="heading" style={styles.tileTitle}>
          {label}
        </AppText>
        <AppText variant="small" muted>
          {detail}
        </AppText>
      </View>
    </Pressable>
  );
}

export function ChoiceIndicator({ selected }: { readonly selected: boolean }) {
  const { palette } = useAppTheme();
  return (
    <View
      style={[
        styles.choiceIndicator,
        { borderColor: selected ? palette.actionPrimary : palette.borderStrong },
      ]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {selected && <View style={[styles.choiceDot, { backgroundColor: palette.actionPrimary }]} />}
    </View>
  );
}

type ButtonProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: "primary" | "secondary" | "quiet" | "danger";
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly accessibilityHint?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { palette } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const backgrounds = {
    primary: palette.actionPrimary,
    secondary: palette.actionSecondary,
    quiet: "transparent",
    danger: palette.brickSoft,
  };
  const foregrounds = {
    primary: palette.onStrong,
    secondary: palette.textPrimary,
    quiet: palette.actionLink,
    danger: palette.statusError,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      aria-busy={busy}
      aria-disabled={disabled || busy}
      disabled={disabled || busy}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        style,
        {
          backgroundColor: backgrounds[variant],
          boxShadow: focused ? focusRing(palette) : "none",
          borderColor: focused
            ? palette.actionLink
            : variant === "secondary"
              ? palette.borderStrong
              : backgrounds[variant],
          opacity:
            disabled || busy
              ? interaction.disabledOpacity
              : pressed
                ? interaction.pressedOpacity
                : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foregrounds[variant]} />
      ) : (
        <AppText variant="label" style={{ color: foregrounds[variant], textAlign: "center" }}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

export function Paper({
  children,
  style,
  testID,
}: PropsWithChildren<{ readonly style?: StyleProp<ViewStyle>; readonly testID?: string }>) {
  const { palette } = useAppTheme();
  return (
    <View
      style={[
        styles.paper,
        { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function Eyebrow({ children, color }: PropsWithChildren<{ readonly color?: string }>) {
  const { palette } = useAppTheme();
  return (
    <AppText variant="mono" style={{ color: color ?? palette.pine }}>
      {children}
    </AppText>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  readonly title: string;
  readonly action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="heading" style={styles.sectionTitle}>
        {title}
      </AppText>
      {action}
    </View>
  );
}

export function Rule({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  const { palette } = useAppTheme();
  return <View style={[styles.rule, { backgroundColor: palette.borderSubtle }, style]} />;
}

export function StatusPill({
  label,
  tone = "pine",
}: {
  readonly label: string;
  readonly tone?: "pine" | "amber" | "brick" | "cobalt";
}) {
  const { palette } = useAppTheme();
  const colors = {
    pine: [palette.pineSoft, palette.pine],
    amber: [palette.amberSoft, palette.amber],
    brick: [palette.brickSoft, palette.brick],
    cobalt: [palette.cobaltSoft, palette.cobalt],
  } as const;
  return (
    <View style={[styles.pill, { backgroundColor: colors[tone][0] }]}>
      <View style={[styles.pillDot, { backgroundColor: colors[tone][1] }]} />
      <AppText variant="small" style={{ color: colors[tone][1], fontWeight: "600", flexShrink: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

export function InlineLink({
  label,
  onPress,
  accessibilityHint,
  testID,
  color,
  role = "link",
  expanded,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly color?: string;
  readonly role?: "link" | "button";
  readonly expanded?: boolean;
}) {
  const { palette } = useAppTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      aria-expanded={expanded}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => ({
        opacity: pressed ? interaction.pressedOpacity : 1,
        minHeight: controls.minimumTouchTarget,
        minWidth: controls.minimumTouchTarget,
        borderWidth: 2,
        borderColor: focused ? palette.actionLink : "transparent",
        boxShadow: focused ? focusRing(palette) : "none",
        borderRadius: radius.sm,
        justifyContent: "center",
      })}
    >
      <AppText variant="label" style={{ color: color ?? palette.actionLink }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export const sharedStyles = StyleSheet.create({
  stack: { gap: spacing.md },
  tightStack: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
});

const textStyles = StyleSheet.create<Record<TextVariant, TextStyle>>({
  display: typography.display,
  title: typography.title,
  heading: typography.heading,
  body: typography.body,
  small: typography.small,
  label: typography.label,
  mono: typography.mono,
});

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: "center" },
  content: {
    width: "100%",
    maxWidth: screenLayout.maxWidth,
    flex: 1,
    paddingHorizontal: screenLayout.horizontalPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  button: {
    minHeight: controls.buttonMinHeight,
    borderRadius: radius.pill,
    borderWidth: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  paper: { borderWidth: 1, borderRadius: radius.lg, padding: 20, gap: spacing.md },
  pageHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  backAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: controls.minimumTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 2,
    flexShrink: 1,
  },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  headerWordmark: { flexShrink: 1, fontWeight: "700", letterSpacing: -0.5 },
  pageIntro: { paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  documentSection: { borderTopWidth: 1, paddingVertical: 20, gap: spacing.sm },
  chevron: {
    width: 8,
    height: 8,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    marginHorizontal: 3,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    minHeight: 60,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxs,
  },
  navigationTile: {
    flexBasis: 160,
    flexGrow: 1,
    minWidth: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
    minHeight: 152,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileTitle: { fontSize: 17, lineHeight: 23 },
  choiceIndicator: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceDot: { width: 8, height: 8, borderRadius: 4 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionTitle: { flexShrink: 1 },
  rule: { height: StyleSheet.hairlineWidth, width: "100%" },
  pill: {
    alignSelf: "flex-start",
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
});
