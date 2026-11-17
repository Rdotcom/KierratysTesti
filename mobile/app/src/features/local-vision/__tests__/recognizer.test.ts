import { encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalRecognizer, isLocalCaptureUri } from "../recognizer";

// Marker-stream codec fixture only; no fake native image-decoder or accuracy claim.
const jpeg = encodePhotoBase64(
  new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42,
    255, 0, 17, 255, 217,
  ]),
);
const raw = () => ({
  schemaVersion: "local-vision-v2",
  engine: "apple-vision",
  classificationPolicy: "apple-class-operating-point-v1",
  minimumPrecision: 0.9,
  minimumRecall: 0.01,
  classificationRevision: 2,
  ocrRevision: 3,
  ocrLanguages: ["en-US"],
  osVersion: "26.5",
  observedAt: "2026-11-03T10:00:00.000Z",
  classifications: [
    "bottle",
    "wine_bottle",
    "jar",
    "carton",
    "cardboard_box",
    "paper_bag",
    "cup",
  ].map((identifier) => ({
    identifier,
    score: identifier === "bottle" ? 0.9 : 0,
    hasPrecisionRecallCurve: true,
    passesOperatingPoint: identifier === "bottle",
  })),
  textLines: ["PET 1"],
  durationMs: 30,
});
const signal = () => new AbortController().signal;
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());

describe("local-only recognizer", () => {
  it("returns bounded inferred observations from the native engine, never a bin/material/brand", async () => {
    const recognize = vi.fn(async () => raw());
    const result = await createLocalRecognizer(() => ({ recognize }))(jpeg, signal());
    expect(recognize).toHaveBeenCalledOnce();
    expect(recognize).toHaveBeenCalledWith(jpeg);
    expect(result.status).toBe("observed");
    if (result.status === "observed") {
      expect(result.observation.source.execution).toBe("on_device");
      expect(result.observation.source.verificationStatus).toBe("inferred");
      expect(result.observation.object).toMatchObject({
        kind: "bottle",
        matches: [
          {
            identifier: "bottle",
            engineScore: 0.9,
            scoreMeaning: "class_specific_not_probability",
          },
        ],
      });
      expect(result.observation).not.toHaveProperty("material");
      expect(result.observation).not.toHaveProperty("destination");
      expect(result.observation).not.toHaveProperty("risk");
    }
  });
  it("rejects unavailable engines and malformed images without calling native", async () => {
    expect(await createLocalRecognizer(() => undefined)(jpeg, signal())).toMatchObject({
      reason: "unsupported",
    });
    const recognize = vi.fn(async () => raw());
    for (const image of ["", "http://example.com/private.jpg", "file:///private.jpg", "AA=="])
      expect(await createLocalRecognizer(() => ({ recognize }))(image, signal())).toMatchObject({
        reason: "invalid_image",
      });
    expect(recognize).not.toHaveBeenCalled();
  });
  it("rejects invalid native payloads and fixed native errors without exposing raw content", async () => {
    expect(
      await createLocalRecognizer(() => ({
        recognize: async () => ({ ...raw(), brand: "wrong" }),
      }))(jpeg, signal()),
    ).toMatchObject({ reason: "failed" });
    for (const [code, reason] of [
      ["ERR_LOCAL_VISION_BUSY", "busy"],
      ["ERR_LOCAL_VISION_INVALID_IMAGE", "invalid_image"],
      ["ERR_LOCAL_VISION_TIMEOUT", "timeout"],
      ["ERR_LOCAL_VISION_UNAVAILABLE", "unsupported"],
      ["unexpected", "failed"],
    ]) {
      const run = createLocalRecognizer(() => ({
        recognize: async () => {
          throw { code, message: "must not escape" };
        },
      }));
      expect(await run(jpeg, signal())).toEqual({ status: "unavailable", reason });
    }
  });
  it("does not start an already-cancelled request", async () => {
    const recognize = vi.fn(async () => raw());
    const controller = new AbortController();
    controller.abort();
    expect(
      await createLocalRecognizer(() => ({ recognize }))(jpeg, controller.signal),
    ).toMatchObject({ reason: "cancelled" });
    expect(recognize).not.toHaveBeenCalled();
  });
  it("does not start native work when cancelled before its queued turn", async () => {
    const recognize = vi.fn(async () => raw());
    const controller = new AbortController();
    const result = createLocalRecognizer(() => ({ recognize }))(jpeg, controller.signal);
    controller.abort();
    expect(await result).toMatchObject({ reason: "cancelled" });
    expect(recognize).not.toHaveBeenCalled();
  });
  it("contains module-loader failures without invoking any fallback", async () => {
    const result = await createLocalRecognizer(() => {
      throw new Error("native missing");
    })(jpeg, signal());
    expect(result).toEqual({ status: "unavailable", reason: "unsupported" });
  });
  it("contains a throwing SDK recognition accessor before invoking native", async () => {
    const result = await createLocalRecognizer(() => ({
      get recognize(): (jpegBase64: string) => Promise<unknown> {
        throw new Error("SDK accessor must not escape");
      },
    }))(jpeg, signal());
    expect(result).toEqual({ status: "unavailable", reason: "unsupported" });
  });
  it("contains a throwing native error-code accessor as a typed failure", async () => {
    const result = await createLocalRecognizer(() => ({
      recognize: async () => {
        throw {
          get code(): string {
            throw new Error("error accessor must not escape");
          },
        };
      },
    }))(jpeg, signal());
    expect(result).toEqual({ status: "unavailable", reason: "failed" });
  });
  it("preserves native timeout then native busy until the worker permits retry", async () => {
    const recognize = vi
      .fn()
      .mockRejectedValueOnce({ code: "ERR_LOCAL_VISION_TIMEOUT" })
      .mockRejectedValueOnce({ code: "ERR_LOCAL_VISION_BUSY" })
      .mockResolvedValue(raw());
    const run = createLocalRecognizer(() => ({ recognize }));
    expect(await run(jpeg, signal())).toEqual({ status: "unavailable", reason: "timeout" });
    expect(await run(jpeg, signal())).toEqual({ status: "unavailable", reason: "busy" });
    expect((await run(jpeg, signal())).status).toBe("observed");
    expect(recognize).toHaveBeenCalledTimes(3);
  });
  it("keeps single-flight through cancellation, ignores late output and then permits retry", async () => {
    const native = deferred();
    const recognize = vi.fn(() => native.promise);
    const run = createLocalRecognizer(() => ({ recognize }));
    const controller = new AbortController();
    const first = run(jpeg, controller.signal);
    await Promise.resolve();
    controller.abort();
    expect(await first).toMatchObject({ reason: "cancelled" });
    expect(await run(jpeg, signal())).toMatchObject({ reason: "busy" });
    expect(recognize).toHaveBeenCalledOnce();
    native.resolve(raw());
    await new Promise((done) => setTimeout(done, 0));
    expect((await run(jpeg, signal())).status).toBe("observed");
    expect(recognize).toHaveBeenCalledTimes(2);
  });
  it("keeps single-flight after UI deadline until native work settles", async () => {
    vi.useFakeTimers();
    const native = deferred();
    const recognize = vi.fn(() => native.promise);
    const run = createLocalRecognizer(() => ({ recognize }), 100);
    const first = run(jpeg, signal());
    await vi.advanceTimersByTimeAsync(100);
    expect(await first).toMatchObject({ reason: "timeout" });
    expect(await run(jpeg, signal())).toMatchObject({ reason: "busy" });
    native.resolve(raw());
    await vi.advanceTimersByTimeAsync(0);
    expect((await run(jpeg, signal())).status).toBe("observed");
  });
});

describe("camera cache cleanup boundary", () => {
  it("accepts Expo Go's exact encoded OS cache root, never an encoded leaf escape", () => {
    const cache = "file:///app/cache/ExperienceData/%2540anonymous%252Fkeepitgreen/";
    expect(isLocalCaptureUri(`${cache}Camera/new.jpg`, cache)).toBe(true);
    for (const leaf of [
      "Camera/%252e%252e%252foutside.jpg",
      "../other.jpg",
      "Camera/../other.jpg",
      "Camera/%2foutside.jpg",
    ])
      expect(isLocalCaptureUri(cache + leaf, cache)).toBe(false);
    expect(
      isLocalCaptureUri(
        "file:///app/cache/ExperienceData/%2540anonymous%252Fother/Camera/new.jpg",
        cache,
      ),
    ).toBe(false);
  });
  it("permits only canonical JPEG paths beneath this app's cache", () => {
    const cache = "file:///app/cache/";
    expect(isLocalCaptureUri("file:///app/cache/Camera/picture.jpg", cache)).toBe(true);
    for (const uri of [
      "https://example.com/picture.jpg",
      "file:///app/Documents/picture.jpg",
      "file:///app/cache/../Documents/picture.jpg",
      "file:///app/cache-fake/picture.jpg",
      "file:///app/cache/%2e%2e/Documents/picture.jpg",
      "file:///app/cache/file.png",
      "file:///app/cache/picture.jpg?token=private",
      "file:///app/cache/picture.jpg#other",
      "file:///app/cache/Camera/%00.jpg",
      "file:///app/cache/Camera/%252e%252e%252foutside.jpg",
      "file:///app/cache/Camera/pic\n.jpg",
      "file:///app/cache/Camera\\picture.jpg",
    ])
      expect(isLocalCaptureUri(uri, cache)).toBe(false);
  });
});
