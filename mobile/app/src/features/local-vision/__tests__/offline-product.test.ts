import { encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import { afterEach, describe, expect, it, vi } from "vitest";
import { offlineCatalogue } from "../catalogue";
import { createOfflineProductRecognizer, resolveOfflineEvidence } from "../offline-product";

const jpeg = encodePhotoBase64(
  new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42,
    255, 0, 17, 255, 217,
  ]),
);
const raw = () => ({
  schemaVersion: "offline-product-evidence-v1",
  imageSha256: "a".repeat(64),
  barcodeComplete: true,
  barcodes: [{ symbology: "VNBarcodeSymbologyEAN13", value: "3017620422003" }],
  ocrLanguages: ["en-US"],
  ocrPolicy: "accurate-v3-no-correction-full-and-center-v1",
  ocr: [
    { view: "full", complete: true, lines: [] },
    { view: "center", complete: true, lines: [] },
  ],
  detailRoi: [0.1, 0.1, 0.8, 0.8],
  embedding: { status: "skipped_barcode" },
  width: 400,
  height: 400,
  durationMs: 100,
});
const signal = () => new AbortController().signal;
function catalogue() {
  if (!offlineCatalogue) throw Error("bundled_catalogue_invalid");
  return offlineCatalogue;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("actual app offline product adapter (fixture contracts, not accuracy)", () => {
  it("loads actual bundled source catalogue without network and resolves a local code", async () => {
    const fetch = vi.fn(() => {
      throw Error("network_forbidden");
    });
    vi.stubGlobal("fetch", fetch);
    const result = await createOfflineProductRecognizer(
      () => ({ recognizeProductEvidence: async () => JSON.stringify(raw()) }),
      catalogue(),
    )(jpeg, signal());
    expect(result).toMatchObject({
      status: "observed",
      result: { status: "catalogue_match", product: { name: "Nutella", quantity: "400 g e" } },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(catalogue().count).toBe(5);
  });
  it("preserves unsupported clients instead of falling back to a remote service", async () => {
    expect(
      await createOfflineProductRecognizer(() => undefined, catalogue())(jpeg, signal()),
    ).toEqual({ status: "unavailable", reason: "unsupported" });
  });
  it("rejects oversized/malformed/unknown native fields and invalid model schemas", () => {
    for (const value of [
      null,
      {},
      "{",
      " ".repeat(65537),
      JSON.stringify({ ...raw(), unsafe: 1 }),
      JSON.stringify({ ...raw(), embedding: { status: "observed", vector: [] } }),
    ])
      expect(() => resolveOfflineEvidence(catalogue(), value)).toThrow();
  });
  it("never resolves truncated/conflicting barcode sets to the first result", () => {
    expect(
      resolveOfflineEvidence(catalogue(), JSON.stringify({ ...raw(), barcodeComplete: false }))
        .result.status,
    ).toBe("ambiguous_barcode");
    expect(
      resolveOfflineEvidence(
        catalogue(),
        JSON.stringify({
          ...raw(),
          barcodes: [
            ...raw().barcodes,
            { symbology: "VNBarcodeSymbologyEAN13", value: "4008400404127" },
          ],
        }),
      ).result.status,
    ).toBe("ambiguous_barcode");
  });
  it("keeps single-flight until native settles after cancellation or timeout", async () => {
    vi.useFakeTimers();
    let finish: (s: string) => void = () => {};
    const native = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const run = createOfflineProductRecognizer(
      () => ({ recognizeProductEvidence: native }),
      catalogue(),
      10,
    );
    const first = run(jpeg, signal());
    await vi.advanceTimersByTimeAsync(11);
    expect(await first).toMatchObject({ reason: "timeout" });
    expect(await run(jpeg, signal())).toMatchObject({ reason: "busy" });
    finish(JSON.stringify(raw()));
    await vi.advanceTimersByTimeAsync(0);
    expect(native).toHaveBeenCalledOnce();
    const aborted = new AbortController();
    aborted.abort();
    expect(await run(jpeg, aborted.signal)).toMatchObject({ reason: "cancelled" });
  });
  it("does not dispatch malformed JPEG or cancelled queued requests", async () => {
    const native = vi.fn(async () => JSON.stringify(raw()));
    const run = createOfflineProductRecognizer(
      () => ({ recognizeProductEvidence: native }),
      catalogue(),
    );
    expect(await run("https://example.com/image", signal())).toMatchObject({ reason: "failed" });
    const controller = new AbortController(),
      pending = run(jpeg, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ reason: "cancelled" });
    expect(native).not.toHaveBeenCalled();
  });
});
