import type { AndroidVisionEvidence } from "@kierratysappi/contracts/android-vision";
import {
  type networkModelId,
  objectKinds,
  objectSuggestionsFromScores,
} from "@kierratysappi/contracts/network-recognition";
import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import type { OfflinePhotoResponse } from "./offline-product";

export { objectKinds };
export type ObjectKind = (typeof objectKinds)[number];
export interface ObjectCandidates {
  focus: "single" | "multiple" | "unknown";
  candidates: ObjectKind[];
  /** UI ordering only; neither mode is verified or calibrated confidence. */
  presentation?: "confirm" | "alternatives";
  source: {
    modelId:
      | "google-siglip2-base224-block32-v1"
      | "google-siglip2-base224-onnx-weight-int8-v1"
      | typeof networkModelId;
    revision: string;
    checkedOn: "2026-11-16";
    observedAt: string;
    verification: "unverified";
    confidence: "uncalibrated";
    scope: "object_form_only";
  };
}
export type ObjectPhotoResponse =
  | { status: "observed"; observation: ObjectCandidates }
  | { status: "unavailable"; reason: "unsupported" | "busy" | "failed" | "timeout" | "cancelled" };
export interface ObjectNativeReader {
  recognizeObjectCandidates(base64: string, requestId: string, timeoutMs: number): Promise<unknown>;
  cancelObjectCandidates(requestId: string): void;
}
const keys = (v: object, expected: string[]) =>
  Object.keys(v).sort().join("|") === expected.sort().join("|");
const record = (v: unknown): Record<string, unknown> => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.getPrototypeOf(v) !== Object.prototype
  )
    throw Error("invalid_object");
  return v as Record<string, unknown>;
};
export function normalizeObjectCandidates(raw: unknown): ObjectCandidates {
  if (typeof raw !== "string" || raw.length > 8192) throw Error("invalid_object");
  const v = record(JSON.parse(raw));
  if (
    !keys(v, [
      "schemaVersion",
      "modelId",
      "modelRevision",
      "preprocessing",
      "verification",
      "confidence",
      "scope",
      "checkedOn",
      "observedAt",
      "scores",
    ]) ||
    v.schemaVersion !== "siglip-object-candidates-v1" ||
    !(
      (v.modelId === "google-siglip2-base224-block32-v1" &&
        v.preprocessing === "siglip2-jpeg-turbo3.2.1-islow-nosimd-srgb-aa22-224-nchw-v2") ||
      (v.modelId === "google-siglip2-base224-onnx-weight-int8-v1" &&
        v.preprocessing === "siglip2-android-bitmap-srgb-aa22-224-nchw-v1")
    ) ||
    v.modelRevision !== "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2" ||
    v.verification !== "unverified" ||
    v.confidence !== "uncalibrated" ||
    v.scope !== "object_form_only" ||
    v.checkedOn !== "2026-11-16" ||
    typeof v.observedAt !== "string" ||
    v.observedAt.length > 32 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(v.observedAt) ||
    !Number.isFinite(Date.parse(v.observedAt)) ||
    !Array.isArray(v.scores) ||
    v.scores.length !== objectKinds.length
  )
    throw Error("invalid_object");
  return {
    ...objectSuggestionsFromScores(v.scores),
    source: {
      modelId: v.modelId as ObjectCandidates["source"]["modelId"],
      revision: v.modelRevision,
      checkedOn: "2026-11-16",
      observedAt: v.observedAt,
      verification: "unverified",
      confidence: "uncalibrated",
      scope: "object_form_only",
    },
  };
}
// Correlation only, not authentication; never persisted or logged.
const requestId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (c) => {
    const value = Math.floor(Math.random() * 16);
    return (c === "x" ? value : (value & 3) | 8).toString(16);
  });
export function createObjectRecognizer(
  getReader: () => ObjectNativeReader | undefined,
  makeId = requestId,
) {
  let running = false;
  const fail = (
    reason: Extract<ObjectPhotoResponse, { status: "unavailable" }>["reason"],
  ): ObjectPhotoResponse => ({ status: "unavailable", reason });
  return {
    isBusy: () => running,
    async recognize(
      jpeg: string,
      signal: AbortSignal,
      deadlineMs = 12000,
    ): Promise<ObjectPhotoResponse> {
      if (signal.aborted) return fail("cancelled");
      if (running) return fail("busy");
      let reader: ObjectNativeReader, clean: string;
      try {
        const candidate = getReader();
        if (
          !candidate ||
          typeof candidate.recognizeObjectCandidates !== "function" ||
          typeof candidate.cancelObjectCandidates !== "function"
        )
          return fail("unsupported");
        reader = candidate;
        clean = preparePhotoBase64(jpeg);
      } catch {
        return fail("failed");
      }
      const timeoutMs = Math.min(12000, Math.floor(deadlineMs));
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1) return fail("timeout");
      const id = makeId();
      running = true;
      const cancelNative = () => {
        try {
          reader.cancelObjectCandidates(id);
        } catch {
          /* do not expose native errors */
        }
      };
      const actual = Promise.resolve()
        .then(async (): Promise<ObjectPhotoResponse> => {
          if (signal.aborted) return fail("cancelled");
          const raw = await reader.recognizeObjectCandidates(clean, id, timeoutMs);
          return signal.aborted
            ? fail("cancelled")
            : { status: "observed", observation: normalizeObjectCandidates(raw) };
        })
        .catch((error: unknown) => {
          let code: unknown;
          try {
            code = error && typeof error === "object" && "code" in error ? error.code : undefined;
          } catch {
            /* untrusted rejection */
          }
          return fail(
            signal.aborted
              ? "cancelled"
              : code === "ERR_LOCAL_VISION_UNAVAILABLE"
                ? "unsupported"
                : code === "ERR_LOCAL_VISION_TIMEOUT"
                  ? "timeout"
                  : code === "ERR_LOCAL_VISION_BUSY"
                    ? "busy"
                    : "failed",
          );
        })
        .finally(() => {
          running = false;
        });
      let timer: ReturnType<typeof setTimeout> | undefined,
        abort = () => {};
      const stopped = new Promise<ObjectPhotoResponse>((resolve) => {
        abort = () => {
          cancelNative();
          resolve(fail("cancelled"));
        };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        timer = setTimeout(() => {
          cancelNative();
          resolve(fail("timeout"));
        }, timeoutMs + 1000);
      });
      try {
        return await Promise.race([actual, stopped]);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
    },
  };
}
export type CameraProductResponse = OfflinePhotoResponse & {
  objectHint?: ObjectPhotoResponse;
  androidEvidence?: AndroidVisionEvidence;
};
/** Exact barcode/catalogue and text-confirmation evidence precede shape hints. */
export function createCameraProductRecognizer(
  primary: (jpeg: string, signal: AbortSignal) => Promise<OfflinePhotoResponse>,
  objects: ReturnType<typeof createObjectRecognizer>,
  now = () => performance.now(),
) {
  return async (jpeg: string, signal: AbortSignal): Promise<CameraProductResponse> => {
    if (objects.isBusy()) return { status: "unavailable", reason: "busy" };
    const started = now(),
      result = await primary(jpeg, signal);
    if (signal.aborted) return { status: "unavailable", reason: "cancelled" };
    if (result.status !== "observed" || !["unknown", "unavailable"].includes(result.result.status))
      return result;
    const objectHint = await objects.recognize(
      jpeg,
      signal,
      Math.min(12000, 15000 - (now() - started)),
    );
    return signal.aborted
      ? { status: "unavailable", reason: "cancelled" }
      : { ...result, objectHint };
  };
}
