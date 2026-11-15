import type { OfflineProduct, OfflineProductResult } from "@kierratysappi/domain/offline-product";
import { Linking, View } from "react-native";
import { useLanguage } from "@/i18n/language-context";
import { AppText, InlineLink, Paper, StatusPill, sharedStyles } from "./ui";

function SourceProduct({ product }: { product: OfflineProduct }) {
  const { t } = useLanguage();
  return (
    <Paper>
      <AppText variant="heading" accessibilityRole="header">
        {product.name}
      </AppText>
      <AppText>{[product.brands, product.quantity].filter(Boolean).join(" · ")}</AppText>
      <AppText variant="small" muted>
        {t("offlineProductCommunity")}
      </AppText>
      <AppText variant="small" muted>
        {product.source.publisher} · {product.source.checkedOn}
      </AppText>
      <AppText variant="small" muted>
        {product.source.licence}
      </AppText>
      <InlineLink
        label={t("offlineProductSource")}
        onPress={() => void Linking.openURL(product.source.url).catch(() => undefined)}
      />
    </Paper>
  );
}

export function OfflineProductResultView({ result }: { result: OfflineProductResult }) {
  const { t } = useLanguage();
  return (
    <View style={sharedStyles.stack} testID="offline-product-result">
      <StatusPill label={t("offlineProductLocal")} tone="amber" />
      <AppText accessibilityRole="header" accessibilityLiveRegion="polite" variant="heading">
        {t(
          result.status === "catalogue_match"
            ? "offlineProductFound"
            : result.status === "confirmation_required"
              ? "offlineProductSuggestion"
              : result.status === "ambiguous_barcode"
                ? "offlineProductConflict"
                : result.status === "invalid_barcode"
                  ? "offlineProductInvalid"
                  : result.status === "unavailable"
                    ? "localVisionUnavailable"
                    : "offlineProductUnknown",
        )}
      </AppText>
      {result.status === "catalogue_match" && (
        <>
          <AppText>
            {t(
              result.evidence === "barcode"
                ? "offlineProductCodeRead"
                : "offlineProductCodeEntered",
            )}{" "}
            {result.gtin}
          </AppText>
          <SourceProduct product={result.product} />
        </>
      )}
      {result.status === "product_not_in_catalogue" && (
        <AppText>
          {t("offlineProductMissingCode")} {result.gtin}
        </AppText>
      )}
      {result.status === "confirmation_required" && (
        <>
          <AppText>{t("offlineProductCompare")}</AppText>
          {result.products.map((p) => (
            <SourceProduct key={p.id} product={p} />
          ))}
        </>
      )}
      {(result.status === "unknown" || result.status === "product_not_in_catalogue") && (
        <AppText>{t("offlineProductRetake")}</AppText>
      )}
      <AppText>{t("offlineProductSorting")}</AppText>
    </View>
  );
}
