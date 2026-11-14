import { encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import {
  decodeReferenceRgbBase64,
  parseReferenceNativeJson,
  ReferenceNativeCapabilitiesSchema,
  ReferenceNativeEmbeddingSchema,
  ReferenceNativeRgbSchema,
  referenceNativeIdentity,
} from "@kierratysappi/contracts/reference-native";
import type { MaxMarginRuntimePorts } from "@kierratysappi/domain/reference-vision";

export interface ReferenceNativeReader {
  inspectReferenceCapabilities(): Promise<unknown>;
  hashReferenceBytes(base64: string): Promise<unknown>;
  encodeReferenceImage(base64: string): Promise<unknown>;
  decodeReferenceRgb(base64: string): Promise<unknown>;
}
export type ReferencePortAvailability =
  | {
      status: "available";
      ports: MaxMarginRuntimePorts;
      identity: typeof referenceNativeIdentity;
      integrationAllowed: false;
    }
  | { status: "unavailable"; reason: "unsupported" | "cancelled" | "busy" | "failed" };

// Shared across all adapter instances. Native independently shares its worker
// with the old OCR/coarse path and keeps its gate after watchdog delivery.
let running = false;
async function invoke(operation: () => Promise<unknown>, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new Error("cancelled");
  if (running) throw new Error("busy");
  running = true;
  const actual = Promise.resolve()
    .then(() => {
      if (signal?.aborted) throw new Error("cancelled");
      return operation();
    })
    .finally(() => {
      running = false;
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("failed")), 15000);
    cancel = () => reject(new Error("cancelled"));
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
  try {
    const result = await Promise.race([actual, deadline]);
    if (signal?.aborted) throw new Error("cancelled");
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArray, "byteLength")?.get;
const backingBuffer = Object.getOwnPropertyDescriptor(typedArray, "buffer")?.get;
const resizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
function input(bytes: Uint8Array): string {
  if (Object.getPrototypeOf(bytes) !== Uint8Array.prototype || !byteLength || !backingBuffer)
    throw new Error("invalid_input");
  const length: unknown = byteLength.call(bytes),
    buffer: unknown = backingBuffer.call(bytes);
  if (
    !buffer ||
    Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
    resizable?.call(buffer) ||
    typeof length !== "number" ||
    !length ||
    length > 1500000
  )
    throw new Error("invalid_input");
  const owned = new Uint8Array(length);
  Uint8Array.prototype.set.call(owned, bytes);
  try {
    return encodePhotoBase64(owned);
  } finally {
    owned.fill(0);
  }
}

/** Experimental factory, not a default recognizer or an integration permission.
 * All JS/native payloads are bounded; no URI, photo history or network accepted. */
export async function createNativeReferenceRuntimePorts(
  getReader: () => ReferenceNativeReader | undefined,
  signal?: AbortSignal,
): Promise<ReferencePortAvailability> {
  try {
    if (signal?.aborted) return { status: "unavailable", reason: "cancelled" };
    const reader = getReader();
    if (
      !reader ||
      [
        reader.inspectReferenceCapabilities,
        reader.hashReferenceBytes,
        reader.encodeReferenceImage,
        reader.decodeReferenceRgb,
      ].some((m) => typeof m !== "function")
    )
      return { status: "unavailable", reason: "unsupported" };
    const inspect = reader.inspectReferenceCapabilities.bind(reader),
      hash = reader.hashReferenceBytes.bind(reader),
      encode = reader.encodeReferenceImage.bind(reader),
      decode = reader.decodeReferenceRgb.bind(reader);
    ReferenceNativeCapabilitiesSchema.parse(
      parseReferenceNativeJson(await invoke(inspect, signal), 2048),
    );
    const ports: MaxMarginRuntimePorts = {
      async sha256(bytes) {
        const encoded = input(bytes);
        const result = await invoke(() => hash(encoded));
        if (typeof result !== "string" || !/^[a-f0-9]{64}$/u.test(result))
          throw new Error("invalid_response");
        return result;
      },
      async encode(bytes, querySignal) {
        const encoded = input(bytes);
        const raw = await invoke(() => encode(encoded), querySignal);
        const value = ReferenceNativeEmbeddingSchema.parse(parseReferenceNativeJson(raw, 32768));
        if (querySignal?.aborted) throw new Error("cancelled");
        const expected = await invoke(() => hash(encoded), querySignal);
        if (value.imageSha256 !== expected || querySignal?.aborted)
          throw new Error("invalid_response");
        return raw;
      },
      async decodeRgb(bytes, limits) {
        if (limits.maximumDimension !== 1024 || limits.maximumPixels !== 1048576)
          throw new Error("invalid_input");
        const encoded = input(bytes);
        const raw = await invoke(() => decode(encoded));
        const value = ReferenceNativeRgbSchema.parse(parseReferenceNativeJson(raw, 4200000));
        const expected = await invoke(() => hash(encoded));
        if (value.imageSha256 !== expected) throw new Error("invalid_response");
        return {
          width: value.width,
          height: value.height,
          data: decodeReferenceRgbBase64(value.rgbBase64, value.width * value.height * 3),
        };
      },
    };
    return {
      status: "available",
      ports,
      identity: referenceNativeIdentity,
      integrationAllowed: false,
    };
  } catch (error: unknown) {
    return {
      status: "unavailable",
      reason: signal?.aborted
        ? "cancelled"
        : error instanceof Error && error.message === "busy"
          ? "busy"
          : "failed",
    };
  }
}
