import { fetch as streamingFetch } from "expo/fetch";
import { createNetworkRecognitionClient, networkOrigin } from "./api";
export const networkRecognitionOrigin = networkOrigin(
  process.env.EXPO_PUBLIC_SIGLIP_BASE_URL,
  process.env.EXPO_PUBLIC_APP_ENV !== "production",
);
export const networkRecognitionClient = createNetworkRecognitionClient(
  networkRecognitionOrigin,
  (url, init) => streamingFetch(url, init),
);
