// The supported iOS photo flow must not start at Expo's full-resolution "Photo"
// preset while waiting for asynchronous size negotiation.
export const localPhotoInitialSize = "1280x720";

export function choosePhotoSize(sizes: readonly string[]): string | undefined {
  return sizes
    .map((value) => ({
      value,
      pixels: /^\d+x\d+$/u.test(value)
        ? Number(value.split("x")[0]) * Number(value.split("x")[1])
        : 0,
    }))
    .filter((size) => size.pixels >= 300_000 && size.pixels <= 2_000_000)
    .sort((a, b) => b.pixels - a.pixels)[0]?.value;
}

export async function resolvePhotoCaptureSize(
  getSizes: () => Promise<readonly string[]>,
): Promise<string> {
  try {
    const sizes = await getSizes();
    if (!Array.isArray(sizes)) return localPhotoInitialSize;
    const bounded = sizes
      .slice(0, 128)
      .filter((value) => typeof value === "string" && value.length <= 24);
    return choosePhotoSize(bounded) ?? localPhotoInitialSize;
  } catch {
    // Keep the explicit bounded preset, never reset to the native Photo default.
    return localPhotoInitialSize;
  }
}

export function canUsePhotoCapture(
  platform: string,
  runtime: {
    readonly executionEnvironment?: unknown;
    readonly platform?: {
      readonly ios?: { readonly buildNumber?: unknown };
      readonly android?: { readonly versionCode?: unknown };
    };
  },
): boolean {
  if (platform === "web") return true;
  // Read the installed binary, never the remotely replaceable expoConfig.
  // expo-constants removed its top-level nativeBuildVersion property.
  const build =
    platform === "ios"
      ? runtime.platform?.ios?.buildNumber
      : platform === "android"
        ? runtime.platform?.android?.versionCode
        : undefined;
  return (
    (runtime.executionEnvironment === "bare" || runtime.executionEnvironment === "standalone") &&
    (typeof build === "string" || typeof build === "number") &&
    /^\d+$/u.test(String(build)) &&
    Number.isSafeInteger(Number(build)) &&
    Number(build) >= 2
  );
}

/** Installed Android local-module capability replaces the absent native build
 * constant. Never trust the mutable JS manifest or a remotely mutable build claim.
 */
export function canUseLocalPhotoCapture(
  platform: string,
  runtime: Parameters<typeof canUsePhotoCapture>[1],
  nativeModuleAvailable: boolean,
): boolean {
  if (!nativeModuleAvailable) return false;
  if (platform === "android")
    return runtime.executionEnvironment === "bare" || runtime.executionEnvironment === "standalone";
  return canUsePhotoCapture(platform, runtime);
}
