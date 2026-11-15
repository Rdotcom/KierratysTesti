import { OfflineProductEvidenceSchema } from "@kierratysappi/contracts/offline-product";
import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import type {
  OfflineCatalogueRuntime,
  OfflineProductResult,
} from "@kierratysappi/domain/offline-product";

export interface OfflineProductReader {
  recognizeProductEvidence(base64: string): Promise<unknown>;
}
export type OfflinePhotoResponse =
  | { status: "observed"; result: OfflineProductResult }
  | { status: "unavailable"; reason: "unsupported" | "failed" | "cancelled" | "timeout" | "busy" };

/** Shared by actual app and genuine-inference QA; ranking is diagnostic only,
 * never shown as a confidence percentage or accepted identity. */
export function resolveOfflineEvidence(catalogue: OfflineCatalogueRuntime, serialized: unknown) {
  if (typeof serialized !== "string" || serialized.length > 65536) throw Error("invalid_evidence");
  const evidence = OfflineProductEvidenceSchema.parse(JSON.parse(serialized));
  let result: OfflineProductResult;
  const ranking =
    evidence.embedding.status === "observed"
      ? catalogue.rank(
          evidence.embedding.vector,
          evidence.embedding.encoderSha256,
          evidence.embedding.preprocessingSha256,
        )
      : null;
  if (!evidence.barcodeComplete) result = { status: "ambiguous_barcode" };
  else if (evidence.barcodes.length)
    result = catalogue.lookup(evidence.barcodes.map((b) => b.value));
  else if (evidence.embedding.status === "unavailable") result = { status: "unavailable" };
  else if (
    !ranking ||
    evidence.ocr.some((view) => !view.complete) ||
    Math.min(evidence.width, evidence.height) < 160
  )
    result = { status: "unknown" };
  else
    result = catalogue.suggest(
      evidence.ocr[0].lines.map((line) => line.text),
      evidence.ocr[1].lines.map((line) => line.text),
      ranking.map((r) => r.productId),
    );
  return {
    result,
    ranking,
    imageSha256: evidence.imageSha256,
    durationMs: evidence.durationMs,
    embeddingStatus: evidence.embedding.status,
    ocrLanguages: evidence.ocrLanguages,
  };
}

export function createOfflineProductRecognizer(
  getReader: () => OfflineProductReader | undefined,
  catalogue: OfflineCatalogueRuntime | null,
  deadlineMs = 15000,
) {
  let running = false;
  return async (jpeg: string, signal: AbortSignal): Promise<OfflinePhotoResponse> => {
    const fail = (
      reason: Extract<OfflinePhotoResponse, { status: "unavailable" }>["reason"],
    ): OfflinePhotoResponse => ({ status: "unavailable", reason });
    if (signal.aborted) return fail("cancelled");
    if (running) return fail("busy");
    let reader: OfflineProductReader | undefined, clean: string;
    try {
      reader = getReader();
      if (!reader || typeof reader.recognizeProductEvidence !== "function" || !catalogue)
        return fail("unsupported");
      clean = preparePhotoBase64(jpeg);
    } catch {
      return fail("failed");
    }
    const operationReader = reader;
    running = true;
    const actual = Promise.resolve()
      .then(async (): Promise<OfflinePhotoResponse> => {
        if (signal.aborted) return fail("cancelled");
        const raw = await operationReader.recognizeProductEvidence(clean);
        if (signal.aborted) return fail("cancelled");
        return { status: "observed", result: resolveOfflineEvidence(catalogue, raw).result };
      })
      .catch(() => fail("failed"))
      .finally(() => {
        running = false;
      });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    const stop = new Promise<OfflinePhotoResponse>((resolve) => {
      abort = () => resolve(fail("cancelled"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      timer = setTimeout(() => resolve(fail("timeout")), deadlineMs);
    });
    try {
      return await Promise.race([actual, stop]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
}
