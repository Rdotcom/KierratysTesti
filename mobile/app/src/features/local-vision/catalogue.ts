import { createOfflineCatalogue } from "@kierratysappi/domain/offline-product";
import data from "../../../assets/offline-product-catalogue.json";

// A deployment-versioned, immutable local asset. No cache eviction, network
// updater or partial write can replace it during inference. App rollback also
// rolls back model/index identity. Remote catalogue updates are not enabled.
export const offlineCatalogue = createOfflineCatalogue(data);
