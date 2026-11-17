import { describe, expect, it } from "vitest";
import { localPhotoInitialSize, resolvePhotoCaptureSize } from "../capture";

describe("bounded local camera startup", () => {
  it("starts at the same720p preset previously negotiated on iOS, not full Photo", async () => {
    expect(localPhotoInitialSize).toBe("1280x720");
    expect(
      await resolvePhotoCaptureSize(async () => [
        "Photo",
        "High",
        "3840x2160",
        "1920x1080",
        "1280x720",
        "640x480",
      ]),
    ).toBe(localPhotoInitialSize);
  });
  it("keeps bounded initial preset on rejection or unusable sizes", async () => {
    expect(
      await resolvePhotoCaptureSize(async () => {
        throw Error("native_failure");
      }),
    ).toBe(localPhotoInitialSize);
    expect(await resolvePhotoCaptureSize(async () => ["Photo", "4000x3000", "garbage"])).toBe(
      localPhotoInitialSize,
    );
  });
  it("preserves the existing under2MP selection if other bounded sizes are offered", async () => {
    expect(await resolvePhotoCaptureSize(async () => ["1280x960", "640x480"])).toBe("1280x960");
  });
  it("does not report size resolution complete before asynchronous negotiation", async () => {
    let finish: (sizes: string[]) => void = () => {};
    let resolved = false;
    const pending = resolvePhotoCaptureSize(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    finish(["1280x720"]);
    await pending;
    expect(resolved).toBe(true);
  });
});
