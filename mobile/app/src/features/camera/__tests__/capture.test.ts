import { describe, expect, it } from "vitest";
import { canUseLocalPhotoCapture, canUsePhotoCapture, choosePhotoSize } from "../capture";

describe("bounded camera capture compatibility", () => {
  it("uses installed Android local capability without enabling cloud or Expo Go", () => {
    const runtime = { executionEnvironment: "bare", platform: { android: {} } };
    expect(canUseLocalPhotoCapture("android", runtime, true)).toBe(true);
    expect(canUseLocalPhotoCapture("android", runtime, false)).toBe(false);
    expect(canUsePhotoCapture("android", runtime)).toBe(false);
    for (const executionEnvironment of ["storeClient", "unknown", undefined])
      expect(canUseLocalPhotoCapture("android", { ...runtime, executionEnvironment }, true)).toBe(
        false,
      );
    expect(
      canUseLocalPhotoCapture(
        "ios",
        { executionEnvironment: "bare", platform: { ios: { buildNumber: "20" } } },
        true,
      ),
    ).toBe(true);
    expect(
      canUseLocalPhotoCapture("ios", { executionEnvironment: "bare", platform: { ios: {} } }, true),
    ).toBe(false);
  });
  it("requires a new purpose-matched native build but not a web/native simulator claim", () => {
    expect(canUsePhotoCapture("web", {})).toBe(true);
    for (const buildNumber of ["1", null, undefined, "2.0", "invalid", "9007199254740992"])
      expect(
        canUsePhotoCapture("ios", {
          executionEnvironment: "bare",
          platform: { ios: { buildNumber } },
        }),
      ).toBe(false);
    expect(canUsePhotoCapture("ios", { executionEnvironment: "bare" })).toBe(false);
    for (const executionEnvironment of ["bare", "standalone"])
      expect(
        canUsePhotoCapture("ios", {
          executionEnvironment,
          platform: { ios: { buildNumber: "2" } },
        }),
      ).toBe(true);
    expect(
      canUsePhotoCapture("android", {
        executionEnvironment: "bare",
        platform: { android: { versionCode: 2 } },
      }),
    ).toBe(true);
    for (const executionEnvironment of ["storeClient", undefined, "unknown"])
      expect(
        canUsePhotoCapture("ios", {
          executionEnvironment,
          platform: { ios: { buildNumber: "200" } },
        }),
      ).toBe(false);
  });
  it("uses the current native constants shape, not removed or mutable manifest build fields", () => {
    // Current iOS EXConstantsService exports only platform.ios.buildNumber.
    const runtime = {
      executionEnvironment: "bare",
      platform: { ios: { buildNumber: "2" } },
      expoConfig: { ios: { buildNumber: "1" } },
    };
    expect(canUsePhotoCapture("ios", runtime)).toBe(true);
    const staleBinary = {
      ...runtime,
      platform: { ios: { buildNumber: "1" } },
      expoConfig: { ios: { buildNumber: "2" } },
    };
    expect(canUsePhotoCapture("ios", staleBinary)).toBe(false);
    // The installed Android constants adapter currently exports no versionCode.
    // Do not trust a JS manifest version as evidence of updated native purpose.
    expect(
      canUsePhotoCapture("android", {
        executionEnvironment: "bare",
        platform: { android: {} },
      }),
    ).toBe(false);
  });
  it("accepts patched iOS client 4 only from its installed native build metadata", () => {
    const runtime = {
      executionEnvironment: "bare",
      platform: { ios: { buildNumber: "4" } },
      expoConfig: { ios: { buildNumber: "3" } },
    };
    expect(canUsePhotoCapture("ios", runtime)).toBe(true);
    const missingNativeBuild = {
      ...runtime,
      platform: { ios: {} },
      expoConfig: { ios: { buildNumber: "4" } },
    };
    expect(canUsePhotoCapture("ios", missingNativeBuild)).toBe(false);
  });
  it("chooses a bounded camera size and ignores malformed or excessive sizes", () => {
    expect(choosePhotoSize(["invalid", "4000x3000", "1920x1080", "1280x960", "640x480"])).toBe(
      "1280x960",
    );
    expect(choosePhotoSize(["0x0", "huge", "10000x10000"])).toBeUndefined();
  });
});
