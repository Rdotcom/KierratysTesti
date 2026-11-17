import { afterEach, describe, expect, it, vi } from "vitest";
import { encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import { createAndroidEvidenceRecognizer } from "../android-evidence";
const jpeg = encodePhotoBase64(
  new Uint8Array([
    255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42,
    255, 0, 17, 255, 217,
  ]),
);
const raw = JSON.stringify({
  schemaVersion: "android-local-evidence-v1",
  engine: "mlkit-bundled-latin-v1",
  observedAt: "2026-11-17T00:00:00Z",
  width: 720,
  height: 1280,
  codes: [],
  markings: ["PAP 21"],
});
afterEach(() => vi.useRealTimers());
describe("Android local evidence lifecycle", () => {
  it("rejects unsupported and aborted calls without invoking native", async () => {
    const absent = createAndroidEvidenceRecognizer(() => undefined);
    expect(await absent(jpeg, new AbortController().signal)).toMatchObject({
      status: "unavailable",
      reason: "unsupported",
    });
    const controller = new AbortController();
    controller.abort();
    expect(await absent(jpeg, controller.signal)).toMatchObject({ reason: "cancelled" });
  });
  it("validates actual boundary and never invents an observation on malformed output", async () => {
    const reader = {
      recognizeAndroidEvidence: vi.fn(async () => raw),
      cancelAndroidEvidence: vi.fn(),
    };
    expect(
      await createAndroidEvidenceRecognizer(() => reader)(jpeg, new AbortController().signal),
    ).toMatchObject({ status: "observed", observation: { markings: { status: "candidates" } } });
    reader.recognizeAndroidEvidence.mockResolvedValue("{}");
    expect(
      await createAndroidEvidenceRecognizer(() => reader)(jpeg, new AbortController().signal),
    ).toMatchObject({ status: "unavailable", reason: "failed" });
  });
  it("cancels matching ID and holds its gate until native settles", async () => {
    let finish: (raw: string) => void = () => {};
    const reader = {
      recognizeAndroidEvidence: vi.fn(
        (_data: string, _id: string, _timeout: number) =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      ),
      cancelAndroidEvidence: vi.fn(),
    };
    const run = createAndroidEvidenceRecognizer(() => reader),
      controller = new AbortController();
    const pending = run(jpeg, controller.signal);
    await Promise.resolve();
    controller.abort();
    expect(await pending).toMatchObject({ reason: "cancelled" });
    expect(reader.cancelAndroidEvidence).toHaveBeenCalledWith(
      reader.recognizeAndroidEvidence.mock.calls[0]?.[1],
    );
    expect(await run(jpeg, new AbortController().signal)).toMatchObject({ reason: "busy" });
    finish(raw);
    await Promise.resolve();
    await Promise.resolve();
  });
});
