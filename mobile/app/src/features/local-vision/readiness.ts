import {
  type LocalVisionReadiness,
  localVisionReadinessSchemaVersion,
  normalizeLocalVisionReadiness,
} from "@kierratysappi/contracts/local-vision-readiness";
import type { MessageKey } from "@kierratysappi/localization";
import type { LocalVisionNativeReader } from "./recognizer";

type UnavailableReason = Extract<LocalVisionReadiness, { status: "unavailable" }>["reason"];
const unavailable = (reason: UnavailableReason): LocalVisionReadiness => ({
  schemaVersion: localVisionReadinessSchemaVersion,
  status: "unavailable",
  reason,
});

/** Integrity/interface readiness only, never an image, permission or quality test. */
export function createLocalReadinessInspector(
  getReader: () =>
    | (Pick<LocalVisionNativeReader, "inspectReadiness"> &
        Partial<Pick<LocalVisionNativeReader, "recognize">>)
    | undefined,
  deadlineMs = 15_000,
) {
  let running = false;
  return async (signal: AbortSignal): Promise<LocalVisionReadiness> => {
    if (signal.aborted) return unavailable("cancelled");
    if (running) return unavailable("busy");
    let inspectReadiness: (() => Promise<unknown>) | undefined;
    try {
      const reader = getReader();
      if (!reader) return unavailable("native_unavailable");
      const method = reader.inspectReadiness;
      if (method !== undefined && typeof method !== "function")
        return unavailable("invalid_response");
      inspectReadiness = method?.bind(reader);
    } catch {
      return unavailable("native_unavailable");
    }
    if (!inspectReadiness)
      return {
        schemaVersion: localVisionReadinessSchemaVersion,
        status: "primary_only",
        reason: "legacy_not_reported",
        evidence: "not_reported",
      };
    running = true;
    const operation = Promise.resolve()
      .then(async (): Promise<LocalVisionReadiness> => {
        if (signal.aborted) return unavailable("cancelled");
        const result = await inspectReadiness();
        if (signal.aborted) return unavailable("cancelled");
        return normalizeLocalVisionReadiness(result);
      })
      .catch((error: unknown): LocalVisionReadiness => {
        let code: unknown;
        try {
          code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        } catch {
          // Native/SDK error objects need not have safe property accessors.
        }
        return unavailable(code === "ERR_LOCAL_VISION_BUSY" ? "busy" : "processing_failed");
      })
      .finally(() => {
        // A UI deadline/abort is not native cancellation. Keep the gate until settled.
        running = false;
      });
    let abort = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<LocalVisionReadiness>((resolve) => {
      abort = () => resolve(unavailable("cancelled"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      timer = setTimeout(() => resolve(unavailable("timeout")), deadlineMs);
    });
    try {
      return await Promise.race([operation, cancelled]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
}

export function localReadinessMessage(readiness: LocalVisionReadiness): MessageKey | undefined {
  if (readiness.status === "full") return undefined;
  if (readiness.status === "primary_only" && readiness.reason === "android_local")
    return "localVisionAndroidReady";
  if (readiness.status === "primary_only")
    return readiness.reason === "legacy_not_reported"
      ? "localVisionReadinessLegacy"
      : readiness.reason === "unsupported_model_platform"
        ? "localVisionReadinessPlatform"
        : "localVisionReadinessPartial";
  if (readiness.reason === "cancelled") return undefined;
  if (readiness.reason === "busy") return "localVisionReadinessBusy";
  if (readiness.reason === "timeout") return "localVisionReadinessTimeout";
  if (
    ["unsupported_platform", "native_unavailable", "primary_unavailable"].includes(readiness.reason)
  )
    return "localVisionUnavailable";
  return "localVisionReadinessError";
}
