import { encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCameraProductRecognizer,
  createObjectRecognizer,
  normalizeObjectCandidates,
  objectKinds,
  type ObjectNativeReader,
} from "../object-candidates";
import type { OfflinePhotoResponse } from "../offline-product";
const jpeg = encodePhotoBase64(
  new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42,
    255, 0, 17, 255, 217,
  ]),
);
const signal = () => new AbortController().signal;
const raw = (winner = "spoon") => ({
  schemaVersion: "siglip-object-candidates-v1",
  modelId: "google-siglip2-base224-block32-v1",
  modelRevision: "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2",
  preprocessing: "siglip2-jpeg-turbo3.2.1-islow-nosimd-srgb-aa22-224-nchw-v2",
  verification: "unverified",
  confidence: "uncalibrated",
  scope: "object_form_only",
  checkedOn: "2026-11-16",
  observedAt: "2026-11-16T12:00:00Z",
  scores: objectKinds.map((kind) => ({ kind, similarity: kind === winner ? 0.2 : 0.01 })),
});
const reader = (): ObjectNativeReader => ({
  recognizeObjectCandidates: vi.fn(async () => JSON.stringify(raw())),
  cancelObjectCandidates: vi.fn(),
});
afterEach(() => vi.useRealTimers());
describe("SigLIP camera candidates are bounded unverified object hints", () => {
  it("accepts the explicitly paired Android runtime identity, never mixed iOS preprocessing", () => {
    const android = {
      ...raw(),
      modelId: "google-siglip2-base224-onnx-weight-int8-v1",
      preprocessing: "siglip2-android-bitmap-srgb-aa22-224-nchw-v1",
    };
    expect(normalizeObjectCandidates(JSON.stringify(android))).toMatchObject({
      candidates: ["spoon", "cup", "fork"],
      source: { modelId: android.modelId, verification: "unverified" },
    });
    expect(() =>
      normalizeObjectCandidates(JSON.stringify({ ...android, preprocessing: raw().preprocessing })),
    ).toThrow();
    expect(() =>
      normalizeObjectCandidates(JSON.stringify({ ...raw(), preprocessing: android.preprocessing })),
    ).toThrow();
  });
  it("normalizes top3 without probability, material, bin or verified product", () => {
    const result = normalizeObjectCandidates(JSON.stringify(raw()));
    expect(result.candidates[0]).toBe("spoon");
    expect(result.candidates).toHaveLength(3);
    expect(result.source).toMatchObject({
      verification: "unverified",
      confidence: "uncalibrated",
      scope: "object_form_only",
    });
    expect(result).not.toHaveProperty("material");
    expect(result).not.toHaveProperty("probability");
  });
  for (const winner of ["other", "multiple-cups", "spoon-and-fork"])
    it(`does not force a single object for ${winner}`, () => {
      const r = normalizeObjectCandidates(JSON.stringify(raw(winner)));
      expect(r.focus).toBe(winner === "other" ? "unknown" : "multiple");
      expect(r.candidates).toEqual([]);
    });
  for (const change of [
    (v: ReturnType<typeof raw>) => ({ ...v, modelId: "siglip2-server-onnx-weight-int8-v1" }),
    (v: ReturnType<typeof raw>) => ({ ...v, verification: "verified" }),
    (v: ReturnType<typeof raw>) => ({ ...v, modelRevision: "new" }),
    (v: ReturnType<typeof raw>) => ({ ...v, scope: "sorting" }),
    (v: ReturnType<typeof raw>) => ({
      ...v,
      preprocessing: "siglip2-rgb-bilinear-aa22-224-nchw-rescale-double-f32-normalize-v1",
    }),
    (v: ReturnType<typeof raw>) => ({ ...v, scores: [] }),
    (v: ReturnType<typeof raw>) => ({ ...v, scores: v.scores.slice().reverse() }),
    (v: ReturnType<typeof raw>) => ({ ...v, unsafe: "photo" }),
    (v: ReturnType<typeof raw>) => ({ ...v, observedAt: "bad" }),
    (v: ReturnType<typeof raw>) => ({
      ...v,
      scores: v.scores.map((s) => ({ ...s, similarity: 2 })),
    }),
  ])
    it("rejects malformed or unsupported native identity/claims", () =>
      expect(() => normalizeObjectCandidates(JSON.stringify(change(raw())))).toThrow());
  it("rejects oversized, malformed and non-string payloads", () => {
    for (const v of [null, {}, "{", " ".repeat(8193)])
      expect(() => normalizeObjectCandidates(v)).toThrow();
  });
  it("dispatches only bounded local JPEG and validates returned native data", async () => {
    const r = reader(),
      run = createObjectRecognizer(() => r);
    expect(await run.recognize(jpeg, signal())).toMatchObject({
      status: "observed",
      observation: { candidates: ["spoon", "cup", "fork"] },
    });
    expect(await run.recognize("https://example.com/photo", signal())).toMatchObject({
      reason: "failed",
    });
    expect(r.recognizeObjectCandidates).toHaveBeenCalledOnce();
  });
  it("older clients fail safely without paid/remote fallback", async () => {
    expect(await createObjectRecognizer(() => undefined).recognize(jpeg, signal())).toMatchObject({
      reason: "unsupported",
    });
  });
  it("cancellation suppresses late results and keeps busy until native settles", async () => {
    let finish: (value: string) => void = () => {};
    const r = reader();
    r.recognizeObjectCandidates = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const run = createObjectRecognizer(() => r),
      controller = new AbortController(),
      first = run.recognize(jpeg, controller.signal);
    await Promise.resolve();
    controller.abort();
    expect(await first).toMatchObject({ reason: "cancelled" });
    expect(run.isBusy()).toBe(true);
    expect(r.cancelObjectCandidates).toHaveBeenCalledOnce();
    expect(await run.recognize(jpeg, signal())).toMatchObject({ reason: "busy" });
    finish(JSON.stringify(raw()));
    await vi.waitFor(() => expect(run.isBusy()).toBe(false));
  });
  it("timeout cancels native but does not release the gate early", async () => {
    vi.useFakeTimers();
    let finish: (value: string) => void = () => {};
    const r = reader();
    r.recognizeObjectCandidates = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const run = createObjectRecognizer(() => r),
      first = run.recognize(jpeg, signal(), 10);
    await vi.advanceTimersByTimeAsync(1011);
    expect(await first).toMatchObject({ reason: "timeout" });
    expect(run.isBusy()).toBe(true);
    finish(JSON.stringify(raw()));
    await vi.advanceTimersByTimeAsync(0);
    expect(run.isBusy()).toBe(false);
  });
  it("does not dispatch cancelled queued calls or expired budgets", async () => {
    const r = reader(),
      run = createObjectRecognizer(() => r),
      controller = new AbortController(),
      first = run.recognize(jpeg, controller.signal);
    controller.abort();
    expect(await first).toMatchObject({ reason: "cancelled" });
    await vi.waitFor(() => expect(run.isBusy()).toBe(false));
    expect(await run.recognize(jpeg, signal(), 0)).toMatchObject({ reason: "timeout" });
    expect(r.recognizeObjectCandidates).not.toHaveBeenCalled();
  });
  it("native failures do not become successful hints", async () => {
    const r = reader();
    r.recognizeObjectCandidates = async () => {
      throw { code: "ERR_LOCAL_VISION_UNAVAILABLE" };
    };
    expect(await createObjectRecognizer(() => r).recognize(jpeg, signal())).toMatchObject({
      reason: "unsupported",
    });
  });
  it("uses SigLIP only after unknown/unavailable catalogue result", async () => {
    const r = reader(),
      objects = createObjectRecognizer(() => r),
      primary = vi.fn(
        async (): Promise<OfflinePhotoResponse> => ({
          status: "observed",
          result: { status: "unknown" },
        }),
      );
    expect(await createCameraProductRecognizer(primary, objects)(jpeg, signal())).toMatchObject({
      status: "observed",
      result: { status: "unknown" },
      objectHint: { status: "observed" },
    });
    expect(primary).toHaveBeenCalledOnce();
  });
  for (const status of [
    "ambiguous_barcode",
    "invalid_barcode",
    "product_not_in_catalogue",
    "catalogue_match",
    "confirmation_required",
  ])
    it(`does not override ${status}`, async () => {
      // Control only the discriminator; no counterfeit product data reaches UI.
      const value = { status: "observed", result: { status } } as OfflinePhotoResponse;
      const r = reader(),
        primary = vi.fn(async () => value);
      expect(
        await createCameraProductRecognizer(
          primary,
          createObjectRecognizer(() => r),
        )(jpeg, signal()),
      ).toBe(value);
      expect(r.recognizeObjectCandidates).not.toHaveBeenCalled();
    });
  it("preserves primary failure and remaining overall time budget", async () => {
    const r = reader(),
      objects = createObjectRecognizer(() => r),
      bad: OfflinePhotoResponse = { status: "unavailable", reason: "busy" };
    expect(await createCameraProductRecognizer(async () => bad, objects)(jpeg, signal())).toBe(bad);
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(16000);
    expect(
      await createCameraProductRecognizer(
        async () => ({ status: "observed", result: { status: "unknown" } }),
        objects,
        now,
      )(jpeg, signal()),
    ).toMatchObject({ objectHint: { reason: "timeout" } });
    expect(r.recognizeObjectCandidates).not.toHaveBeenCalled();
  });
});
