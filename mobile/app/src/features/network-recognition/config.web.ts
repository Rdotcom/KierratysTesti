import { createNetworkRecognitionClient, networkOrigin } from "./api";
const development = process.env.EXPO_PUBLIC_APP_ENV !== "production";
const configured = process.env.EXPO_PUBLIC_SIGLIP_BASE_URL;
const fallback =
  process.env.NODE_ENV !== "production" && development ? "http://127.0.0.1:3004" : undefined;
export const networkRecognitionOrigin = networkOrigin(configured ?? fallback, development);
export const networkRecognitionClient = createNetworkRecognitionClient(
  networkRecognitionOrigin,
  (url, options) => globalThis.fetch(url, options),
);
