import type { ProductLookupResult } from "@kierratysappi/contracts/lookup-schema";
import type { Gtin, Language } from "@kierratysappi/domain";
import type { OfflineCatalogueRuntime } from "@kierratysappi/domain/offline-product";
import { isExpoGoEnvironment } from "../runtime/environment";
import { createLocalFirstLookup } from "./local-first-lookup";

type Lookup = (gtin: Gtin, language: Language) => Promise<ProductLookupResult>;
/** Expo Go must not depend on a private Mac API. Normal builds retain backend/provider resolution. */
export function createRuntimeBarcodeLookup(
  catalogue: OfflineCatalogueRuntime | null,
  executionEnvironment: unknown,
  backend: Lookup,
  publicIdentity: Lookup,
): Lookup {
  return isExpoGoEnvironment(executionEnvironment)
    ? createLocalFirstLookup(catalogue, publicIdentity)
    : createLocalFirstLookup(catalogue, backend, publicIdentity);
}
