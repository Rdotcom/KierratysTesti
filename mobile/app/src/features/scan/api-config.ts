import { isLocalDevelopmentHost } from "@kierratysappi/domain";

type ApiPlatform = "android" | "ios" | "web" | string;

type ApiBaseUrlInput = {
  readonly platform: ApiPlatform;
  readonly appEnvironment: string | undefined;
  readonly configuredUrl: string | undefined;
};

export function resolveApiBaseUrl(input: ApiBaseUrlInput): string {
  const environment = input.appEnvironment ?? "production";
  const fallback = input.platform === "android" ? "http://10.0.2.2:3000" : "http://127.0.0.1:3000";
  const candidate = input.configuredUrl?.trim() || fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must contain only an origin");
  }
  if (environment !== "development" && !input.configuredUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is required outside development");
  }
  if (environment !== "development" && parsed.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTPS outside development");
  }
  if (parsed.protocol === "http:" && !isLocalDevelopmentHost(parsed.hostname)) {
    throw new Error("Development HTTP must use loopback or a private IP address");
  }
  return parsed.origin;
}
