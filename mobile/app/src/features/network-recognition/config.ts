import { fetch as streamingFetch } from "expo/fetch";
import { createNetworkRecognitionClient, networkOrigin } from "./api";
export const networkRecognitionOrigin = networkOrigin(
  process.env.EXPO_PUBLIC_SIGLIP_BASE_URL,
  process.env.EXPO_PUBLIC_APP_ENV === "development" ||
    (!process.env.EXPO_PUBLIC_APP_ENV && process.env.NODE_ENV === "development"),
);
export const networkRecognitionClient = createNetworkRecognitionClient(
  networkRecognitionOrigin,
  (url, init) => streamingFetch(url, init),
);
