import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import {
  type LocalVisionObservation,
  normalizeLocalVisionResult,
} from "@kierratysappi/contracts/local-vision";

export type LocalVisionNativeReader = {
  recognize(jpegBase64: string): Promise<unknown>;
  inspectReadiness?(): Promise<unknown>;
};
export type LocalPhotoResponse =
  | { readonly status: "observed"; readonly observation: LocalVisionObservation }
  | {
      readonly status: "unavailable";
      readonly reason:
        | "unsupported"
        | "invalid_image"
        | "busy"
        | "failed"
        | "timeout"
        | "cancelled";
    };

/** Keep the JS gate until its native promise settles. Native timeout delivery may
 * precede worker settlement; native itself retains the worker's in-flight gate. */
export function createLocalRecognizer(
  getReader: () => LocalVisionNativeReader | undefined,
  deadlineMs = 15_000,
) {
  let running = false;
  return async (jpeg: string, signal: AbortSignal): Promise<LocalPhotoResponse> => {
    const failure = (reason: Extract<LocalPhotoResponse, { status: "unavailable" }>["reason"]) =>
      ({ status: "unavailable", reason }) as const;
    if (signal.aborted) return failure("cancelled");
    if (running) return failure("busy");
    let recognize: (jpegBase64: string) => Promise<unknown>;
    try {
      const reader = getReader();
      const method = reader?.recognize;
      if (!reader || typeof method !== "function") return failure("unsupported");
      recognize = method.bind(reader);
    } catch {
      return failure("unsupported");
    }
    let prepared: string;
    try {
      prepared = preparePhotoBase64(jpeg);
    } catch {
      return failure("invalid_image");
    }
    running = true;
    const operation = Promise.resolve()
      .then(async (): Promise<LocalPhotoResponse> => {
        if (signal.aborted) return failure("cancelled");
        const raw = await recognize(prepared);
        if (signal.aborted) return failure("cancelled");
        const result = normalizeLocalVisionResult(raw);
        return result.status === "observed"
          ? { status: "observed", observation: result }
          : failure("failed");
      })
      .catch((error: unknown): LocalPhotoResponse => {
        let code: unknown;
        try {
          code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        } catch {
          // SDK rejection objects may have throwing accessors; never leak them.
        }
        return failure(
          code === "ERR_LOCAL_VISION_BUSY"
            ? "busy"
            : code === "ERR_LOCAL_VISION_INVALID_IMAGE"
              ? "invalid_image"
              : code === "ERR_LOCAL_VISION_TIMEOUT"
                ? "timeout"
                : code === "ERR_LOCAL_VISION_UNAVAILABLE"
                  ? "unsupported"
                  : "failed",
        );
      })
      .finally(() => {
        running = false;
      });
    let abort = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<LocalPhotoResponse>((resolve) => {
      abort = () => resolve(failure("cancelled"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      timer = setTimeout(() => resolve(failure("timeout")), deadlineMs);
    });
    try {
      return await Promise.race([operation, cancelled]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
}

export function isLocalCaptureUri(uri: string, cacheUri: string): boolean {
  try {
    const image = new URL(uri);
    const cache = new URL(cacheUri);
    // Expo Go scopes cache roots with encoded experience identifiers. Trust only
    // the exact OS-provided root; reject encoded traversal in the relative leaf.
    const prefix = `${cacheUri.replace(/\/$/u, "")}/`;
    if (!uri.startsWith(prefix)) return false;
    const leaf = uri.slice(prefix.length);
    return (
      image.protocol === "file:" &&
      cache.protocol === "file:" &&
      image.host === cache.host &&
      !image.search &&
      !image.hash &&
      !/[\p{Cc}\p{Cf}\\]/u.test(uri) &&
      !cache.search &&
      !cache.hash &&
      !/%(?:00|25|2e|2f|5c)/iu.test(leaf) &&
      !leaf.split("/").some((part) => part === "." || part === "..") &&
      image.pathname.startsWith(`${cache.pathname.replace(/\/$/u, "")}/`) &&
      /\.jpe?g$/iu.test(image.pathname)
    );
  } catch {
    return false;
  }
}
