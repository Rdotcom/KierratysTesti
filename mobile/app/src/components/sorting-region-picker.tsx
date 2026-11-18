import { searchMunicipalities, sortingRegionSource } from "@kierratysappi/recycling-engine";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useSortingRegion } from "@/features/region/context";
import { openExternalUrl } from "@/features/security/external-links";
import { useLanguage } from "@/i18n/language-context";
import { controls, spacing, useAppTheme } from "@/theme/tokens";
import { AppText, Button, InlineLink, sharedStyles } from "./ui";
export function SortingRegionPicker() {
  const region = useSortingRegion(),
    { t } = useLanguage(),
    { palette } = useAppTheme();
  const [editing, setEditing] = useState(false),
    [query, setQuery] = useState("");
  const matches = searchMunicipalities(query);
  return (
    <View style={sharedStyles.tightStack} testID="sorting-region-picker">
      <AppText variant="small" accessibilityLiveRegion="polite" testID="sorting-region-current">
        {region.selection
          ? `${region.selection.municipalityName} · ${region.selection.regionId === "unsupported" ? t("regionUnsupported") : region.selection.regionName}`
          : t("regionNotSelected")}
      </AppText>
      <Button
        variant="quiet"
        label={t("regionLocate")}
        busy={region.busy}
        onPress={() => void region.locate()}
        testID="sorting-region-locate"
      />
      <Button
        variant="quiet"
        label={t("regionManual")}
        onPress={() => setEditing((v) => !v)}
        testID="sorting-region-manual"
      />
      {region.issue && (
        <AppText accessibilityRole="alert">
          {t(region.issue === "boundary" ? "regionBoundary" : "regionUnavailable")}
        </AppText>
      )}
      {region.suggestion && (
        <Button
          variant="secondary"
          label={`${t("regionConfirm")}: ${region.suggestion.municipalityName}`}
          onPress={() => region.suggestion && region.select(region.suggestion.municipalityCode)}
          testID="sorting-region-confirm"
        />
      )}
      {editing && (
        <>
          <TextInput
            accessibilityLabel={t("regionMunicipality")}
            placeholder={t("regionMunicipality")}
            value={query}
            maxLength={80}
            onChangeText={setQuery}
            autoCorrect={false}
            autoComplete="off"
            style={{
              minHeight: controls.inputMinHeight,
              padding: spacing.sm,
              borderWidth: 1,
              borderColor: palette.borderStrong,
              color: palette.textPrimary,
              backgroundColor: palette.bgSurface,
              fontSize: 16,
            }}
            testID="sorting-region-input"
          />
          {matches.map((m) => (
            <Button
              key={m.municipalityCode}
              variant="secondary"
              label={m.municipalityName}
              onPress={() => {
                region.select(m.municipalityCode);
                setQuery("");
                setEditing(false);
              }}
              testID={`sorting-region-${m.municipalityCode}`}
            />
          ))}
          {query.length >= 2 && matches.length === 0 && <AppText>{t("regionNoMatch")}</AppText>}
        </>
      )}
      <AppText variant="small" muted>
        {t("regionPrivacy")}
      </AppText>
      {(editing || region.issue) && (
        <View>
          <InlineLink
            label={`${sortingRegionSource.name} · ${sortingRegionSource.license}`}
            onPress={() => void openExternalUrl(sortingRegionSource.url).catch(() => undefined)}
          />
          <AppText variant="small" muted>
            {sortingRegionSource.name} · {sortingRegionSource.license} ·{" "}
            {sortingRegionSource.checkedAt}
          </AppText>
        </View>
      )}
    </View>
  );
}
