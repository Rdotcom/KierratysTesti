import { safeWebUrl } from "@kierratysappi/domain";
import { Linking } from "react-native";

// Reviewed publishers/maps/licences used by the bundled rules and providers.
// Adding a data source requires reviewing its destination, not accepting arbitrary HTTPS.
const reviewedHosts = new Set([
  "autokierratys.fi",
  "creativecommons.org",
  "developers.google.com",
  "developer.apple.com",
  "eur-lex.europa.eu",
  "github.com",
  "huggingface.co",
  "hsy.fi",
  "kiertokaari.fi",
  "lsjh.fi",
  "opendatacommons.org",
  "rinkiin.fi",
  "serkierratys.fi",
  "palpa.fi",
  "paristokierratys.fi",
  "openstreetmap.org",
  "world.openfoodfacts.org",
  "world.openbeautyfacts.org",
  "world.openpetfoodfacts.org",
  "world.openproductsfacts.org",
  "cs.ubc.ca",
]);

/** The only platform openURL boundary. Never accept arbitrary native URL schemes. */
export async function openExternalUrl(value: unknown): Promise<void> {
  const url = safeWebUrl(value);
  if (!url || !reviewedHosts.has(new URL(url).hostname.replace(/\.$/u, "").replace(/^www\./u, "")))
    throw new Error("unsafe_external_link");
  await Linking.openURL(url);
}
