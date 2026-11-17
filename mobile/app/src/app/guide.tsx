import { localizedText } from "@kierratysappi/localization";
import { searchGuideItems, searchGuideLibrary } from "@kierratysappi/recycling-engine";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Linking,
  Pressable,
  type ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { ObjectSortingFlowView } from "@/components/object-sorting-flow";
import { RecyclingRecordAction } from "@/components/recycle-action";
import { SortingRegionPicker } from "@/components/sorting-region-picker";
import { SourceGuideResult } from "@/components/source-guide-result";
import {
  AppText,
  Button,
  DocumentSection,
  InlineLink,
  PageHeader,
  PageIntro,
  Paper,
  Screen,
  sharedStyles,
} from "@/components/ui";
import { announceAccessibility } from "@/features/accessibility/announcements";
import { guideLibrary } from "@/features/guide/library";
import {
  filterGuideMaterials,
  GUIDE_SEARCH_MAX_LENGTH,
  type GuideMaterial,
  parseGuideSearchParams,
} from "@/features/guide/search";
import { recyclingIntent } from "@/features/overview/recording";
import { useSortingRegion } from "@/features/region/context";
import { useLanguage } from "@/i18n/language-context";
import { appFontFamily } from "@/theme/fonts";
import { controls, interaction, radius, spacing, useAppTheme } from "@/theme/tokens";

const GUIDE = [
  ["materialPlastic", "guidePlastic", "plastic"],
  ["materialCarton", "guideCarton", "carton"],
  ["materialGlass", "guideGlass", "glass"],
  ["materialMetal", "guideMetal", "metal"],
] as const;

export default function GuideScreen() {
  const router = useRouter();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const route = useLocalSearchParams();
  const initialSearch = parseGuideSearchParams(route);
  const { palette } = useAppTheme();
  const { t, language } = useLanguage();
  const [query, setQuery] = useState(initialSearch.query);
  const [material, setMaterial] = useState<GuideMaterial | null>(initialSearch.material);
  const [invalid, setInvalid] = useState(initialSearch.invalid);
  const [focused, setFocused] = useState(false);
  const [recordingScope] = useState(() => ({}));
  const [focusedFilter, setFocusedFilter] = useState<GuideMaterial | "all" | null>(null);
  const [itemChoice, setItemChoice] = useState<{ id: string; query: string }>();
  const [sourceChoice, setSourceChoice] = useState<{ id: string; query: string }>();
  const { selection: region } = useSortingRegion();
  const itemMatches = searchGuideItems(invalid || material ? "" : query);
  const visibleMaterials = invalid ? [] : filterGuideMaterials(query, material);
  const sourceMatches =
    guideLibrary && !invalid && !material && !itemMatches.exact && visibleMaterials.length === 0
      ? searchGuideLibrary(guideLibrary, query)
      : { items: [], exact: false };
  const sourceAvailable = sourceMatches.items.length > 0;
  const sourceActive = sourceAvailable && region?.regionId === "hsy";
  const sourceItem = sourceActive
    ? (sourceMatches.items.find((i) => sourceChoice?.query === query && sourceChoice.id === i.id) ??
      (sourceMatches.exact ? sourceMatches.items[0] : undefined))
    : undefined;
  const selectedItem =
    itemMatches.items.find((entry) => itemChoice?.query === query && itemChoice.id === entry.id) ??
    (itemMatches.exact ? itemMatches.items[0] : undefined);
  const sourceItemId = sourceItem?.id;

  useEffect(() => {
    // Municipality/ambiguity controls can be below a newly inserted long answer.
    // Reveal its beginning immediately; do not leave the user at its footer.
    if (sourceItemId) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [sourceItemId]);

  useEffect(() => {
    setQuery(initialSearch.query);
    setMaterial(initialSearch.material);
    setInvalid(initialSearch.invalid);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [initialSearch.query, initialSearch.material, initialSearch.invalid]);

  const resultCount = t(
    sourceAvailable || itemMatches.items.length ? "guideItemResultCount" : "guideSearchResultCount",
  ).replace(
    "{count}",
    String(
      sourceActive
        ? sourceMatches.items.length
        : itemMatches.items.length ||
            (sourceAvailable ? sourceMatches.items.length : visibleMaterials.length),
    ),
  );
  const resetSearch = () => {
    Keyboard.dismiss();
    setQuery("");
    setMaterial(null);
    setInvalid(false);
  };

  return (
    <Screen testID="guide-screen" scrollRef={scrollRef}>
      <PageHeader onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <PageIntro
        title={t("materialGuideTitle")}
        body={query.trim() ? undefined : t("materialGuideBody")}
      />
      <View style={styles.search}>
        <AppText variant="label" nativeID="guide-search-label">
          {t("guideSearchLabel")}
        </AppText>
        <TextInput
          accessibilityLabel={t("guideSearchLabel")}
          accessibilityLabelledBy="guide-search-label"
          accessibilityHint={t("guideSearchHint")}
          placeholder={t("guideSearchPlaceholder")}
          placeholderTextColor={palette.textSecondary}
          value={query}
          onChangeText={(text) => {
            const next = parseGuideSearchParams({ query: text });
            setQuery(text);
            setInvalid(next.invalid);
            setMaterial(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => {
            Keyboard.dismiss();
            scrollRef.current?.scrollTo({ y: 0, animated: false });
            announceAccessibility(invalid ? t("guideSearchInvalid") : resultCount);
          }}
          maxLength={GUIDE_SEARCH_MAX_LENGTH}
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          style={[
            styles.input,
            {
              backgroundColor: palette.bgSurface,
              color: palette.textPrimary,
              borderColor: focused ? palette.actionLink : palette.borderStrong,
            },
          ]}
          testID="guide-search-input"
        />
        {!query.trim() && (
          <>
            <AppText variant="small" muted>
              {t("guideSearchHint")}
            </AppText>
            <View
              style={styles.filters}
              accessibilityRole="radiogroup"
              accessibilityLabel={t("guideSearchFilters")}
            >
              {([null, "plastic", "carton", "glass", "metal"] as const).map((option) => {
                const title = GUIDE.find(([, , value]) => value === option)?.[0];
                const label = title ? t(title) : t("guideSearchAll");
                return (
                  <Pressable
                    key={option ?? "all"}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    accessibilityState={{ checked: material === option }}
                    aria-checked={material === option}
                    onFocus={() => setFocusedFilter(option ?? "all")}
                    onBlur={() => setFocusedFilter(null)}
                    onPress={() => {
                      setQuery("");
                      setMaterial(option);
                      setInvalid(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [
                      styles.filter,
                      {
                        backgroundColor: material === option ? palette.pineSoft : palette.bgSurface,
                        borderColor:
                          material === option || focusedFilter === (option ?? "all")
                            ? palette.actionLink
                            : palette.borderSubtle,
                        opacity: pressed ? interaction.pressedOpacity : 1,
                      },
                    ]}
                    testID={`guide-material-${option ?? "all"}`}
                  >
                    <AppText variant="small" style={{ flexShrink: 1 }}>
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        <AppText variant="small" muted accessibilityLiveRegion="polite" testID="guide-search-count">
          {resultCount}
        </AppText>
      </View>
      {sourceActive && (
        <View style={sharedStyles.stack} testID="source-guide-matches">
          {sourceItem ? (
            <SourceGuideResult item={sourceItem} />
          ) : (
            <>
              <AppText variant="heading">{t("guideSourceChoices")}</AppText>
              {sourceMatches.items.map((i) => (
                <Button
                  key={i.id}
                  variant="secondary"
                  label={i[language].title}
                  onPress={() => setSourceChoice({ id: i.id, query })}
                  testID={`source-guide-choice-${i.id}`}
                />
              ))}
            </>
          )}
        </View>
      )}
      {sourceAvailable && !region && (
        <Paper>
          <AppText>{t("guideSourceChooseRegion")}</AppText>
          <SortingRegionPicker />
        </Paper>
      )}
      {itemMatches.items.length > 0 && !sourceActive && (
        <View style={sharedStyles.stack} testID="guide-item-results">
          {selectedItem ? (
            <Paper>
              <AppText accessibilityRole="header" variant="heading">
                {localizedText(language, selectedItem.label)}
              </AppText>
              <ObjectSortingFlowView
                key={`${query}:${selectedItem.id}`}
                kind={selectedItem.kind}
                label={localizedText(language, selectedItem.label)}
                showRegionControl={false}
                onChangeObject={() => {
                  setItemChoice(undefined);
                  resetSearch();
                }}
              />
            </Paper>
          ) : (
            itemMatches.items.map((entry) => (
              <Button
                key={entry.id}
                label={localizedText(language, entry.label)}
                variant="secondary"
                onPress={() => setItemChoice({ id: entry.id, query })}
                testID={`guide-item-${entry.id}`}
              />
            ))
          )}
        </View>
      )}
      {visibleMaterials.length === 0 &&
        itemMatches.items.length === 0 &&
        !sourceActive &&
        !(sourceAvailable && !region) && (
          <DocumentSection testID="guide-search-empty">
            <AppText accessibilityRole={invalid ? "alert" : "header"} variant="heading">
              {invalid ? t("guideSearchInvalid") : t("guideSearchEmpty")}
            </AppText>
            <AppText>{t("itemSearchEmpty")}</AppText>
            <AppText variant="small" muted>
              {t("itemSearchScope")}
            </AppText>
          </DocumentSection>
        )}
      <View style={styles.grid}>
        {GUIDE.filter(([, , value]) => visibleMaterials.includes(value)).map(
          ([title, body, value]) => (
            <DocumentSection key={title} testID={`guide-section-${value}`}>
              <AppText variant="heading" accessibilityRole="header">
                {t(title)}
              </AppText>
              <AppText>{t(body)}</AppText>
              <RecyclingRecordAction
                material={value}
                recordId={recyclingIntent(recordingScope, value)}
                label={t(title)}
              />
            </DocumentSection>
          ),
        )}
      </View>
      {(query.length > 0 || material !== null || invalid) && (
        <Button
          label={t("guideSearchReset")}
          variant="quiet"
          onPress={resetSearch}
          testID="guide-search-reset"
        />
      )}
      {!(sourceAvailable && !region) && (
        <Paper>
          <SortingRegionPicker />
        </Paper>
      )}
      {visibleMaterials.length > 0 && (
        <>
          <Paper
            style={{ backgroundColor: palette.amberSoft, borderWidth: 0, marginBottom: spacing.lg }}
          >
            <AppText style={{ color: palette.amber }}>{t("depositCaution")}</AppText>
          </Paper>
          <View style={sharedStyles.tightStack}>
            <AppText variant="small" muted>
              {t("ruleSourceLabel")}
            </AppText>
            <InlineLink
              label="Suomen Pakkauskierrätys RINKI Oy"
              onPress={() =>
                void Linking.openURL("https://rinkiin.fi/lajittelu-kotona/lajitteluohjeet/")
              }
            />
            <AppText variant="small" muted>
              {t("checkedLabel")}: 2026-08-10
            </AppText>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { gap: spacing.sm, paddingBottom: spacing.lg },
  input: {
    minHeight: controls.inputMinHeight,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: appFontFamily,
    fontSize: 16,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  filter: {
    maxWidth: "100%",
    minHeight: controls.minimumTouchTarget,
    minWidth: controls.minimumTouchTarget,
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    justifyContent: "center",
  },
  grid: { paddingBottom: spacing.sm },
});
