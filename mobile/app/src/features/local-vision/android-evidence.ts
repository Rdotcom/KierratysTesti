import {
  normalizeAndroidVisionEvidence,
  type AndroidVisionEvidence,
} from "@kierratysappi/contracts/android-vision";
import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
export interface AndroidEvidenceReader {
  recognizeAndroidEvidence(base64: string, id: string, timeoutMs: number): Promise<unknown>;
  cancelAndroidEvidence(id: string): void;
}
export type AndroidEvidenceResponse =
  | { status: "observed"; observation: AndroidVisionEvidence }
  | { status: "unavailable"; reason: "unsupported" | "busy" | "failed" | "cancelled" | "timeout" };
export function createAndroidEvidenceRecognizer(
  getReader: () => AndroidEvidenceReader | undefined,
) {
  let running = false;
  return async (jpeg: string, signal: AbortSignal): Promise<AndroidEvidenceResponse> => {
    if (signal.aborted) return { status: "unavailable", reason: "cancelled" };
    if (running) return { status: "unavailable", reason: "busy" };
    const reader = getReader();
    if (!reader) return { status: "unavailable", reason: "unsupported" };
    let clean: string;
    try {
      clean = preparePhotoBase64(jpeg);
    } catch {
      return { status: "unavailable", reason: "failed" };
    }
    const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (c) => {
      const n = Math.floor(Math.random() * 16);
      return (c === "x" ? n : (n & 3) | 8).toString(16);
    });
    running = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      try {
        reader.cancelAndroidEvidence(id);
      } catch {}
    };
    let abort = () => {};
    const actual = Promise.resolve().then(async (): Promise<AndroidEvidenceResponse> => {
      try {
        if (signal.aborted) return { status: "unavailable", reason: "cancelled" };
        const raw = await reader.recognizeAndroidEvidence(clean, id, 12000);
        return signal.aborted
          ? { status: "unavailable", reason: "cancelled" }
          : { status: "observed", observation: normalizeAndroidVisionEvidence(raw) };
      } catch {
        return { status: "unavailable", reason: signal.aborted ? "cancelled" : "failed" };
      } finally {
        running = false;
      }
    });
    const stopped = new Promise<AndroidEvidenceResponse>((resolve) => {
      abort = () => {
        cancel();
        resolve({ status: "unavailable", reason: "cancelled" });
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      timer = setTimeout(() => {
        cancel();
        resolve({ status: "unavailable", reason: "timeout" });
      }, 13000);
    });
    try {
      return await Promise.race([actual, stopped]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
}
