import { encodePhotoBase64, preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";

export const maxBrowserFileBytes = 12_000_000;
export const maxBrowserPixels = 16_000_000;
type ImageInfo = { width: number; height: number; mime: "image/jpeg" | "image/png" | "image/webp" };
const invalid = () => new Error("invalid_browser_image");
/** Inspect dimensions before browser decode; names/extensions/MIME supplied by users are not trusted. */
export function inspectBrowserImage(bytes: Uint8Array): ImageInfo {
  if (bytes.length < 24 || bytes.length > maxBrowserFileBytes) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0,
    mime: ImageInfo["mime"];
  if (bytes[0] === 255 && bytes[1] === 216) {
    mime = "image/jpeg";
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) throw invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw invalid();
      if (marker !== undefined && [192, 193, 194].includes(marker)) {
        if (width || length < 8) throw invalid();
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
      }
      offset += length;
    }
  } else if (bytes.slice(0, 8).every((b, i) => b === [137, 80, 78, 71, 13, 10, 26, 10][i])) {
    mime = "image/png";
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw invalid();
    width = view.getUint32(16);
    height = view.getUint32(20);
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) throw invalid();
      if (view.getUint32(offset + 4) === 0x6163544c) throw invalid(); // APNG not admitted.
      offset += length + 12;
    }
  } else if (view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    mime = "image/webp";
    if (view.getUint32(4, true) + 8 !== bytes.length) throw invalid();
    const kind = view.getUint32(12);
    if (kind === 0x56503858 && bytes.length >= 30) {
      if (view.getUint8(20) & 2) throw invalid(); // Animated WebP not admitted.
      width = 1 + view.getUint8(24) + (view.getUint8(25) << 8) + (view.getUint8(26) << 16);
      height = 1 + view.getUint8(27) + (view.getUint8(28) << 8) + (view.getUint8(29) << 16);
    } else if (kind === 0x56503820 && bytes.length >= 30) {
      if (bytes[23] !== 157 || bytes[24] !== 1 || bytes[25] !== 42) throw invalid();
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === 0x5650384c && bytes.length >= 25 && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else throw invalid();
  } else throw invalid();
  if (!width || !height || width > 16384 || height > 16384 || width * height > maxBrowserPixels)
    throw invalid();
  return { width, height, mime };
}
export function browserImageSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw invalid();
  const scale = Math.min(
    1,
    1600 / Math.max(width, height),
    Math.sqrt(2_000_000 / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
export function stopBrowserCamera(stream: { getTracks(): { stop(): void }[] } | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
const active = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
};
export function jpegFromCanvas(canvas: HTMLCanvasElement): string {
  for (const quality of [0.85, 0.65, 0.45, 0.3]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    try {
      return preparePhotoBase64(data.replace(/^data:image\/jpeg;base64,/u, ""));
    } catch {
      /* Try a smaller bounded JPEG, never upload the original. */
    }
  }
  throw invalid();
}
export async function prepareBrowserFile(file: File, signal: AbortSignal): Promise<string> {
  active(signal);
  if (file.size > maxBrowserFileBytes || file.size < 24) throw invalid();
  const bytes = new Uint8Array(await file.arrayBuffer());
  active(signal);
  const info = inspectBrowserImage(bytes),
    size = browserImageSize(info.width, info.height);
  // Keep already-bounded JPEG pixels unchanged, stripping metadata before preview/transport.
  if (info.mime === "image/jpeg" && size.width === info.width && size.height === info.height) {
    try {
      return preparePhotoBase64(encodePhotoBase64(bytes));
    } catch {
      /* Re-encode larger supported input. */
    }
  }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }), {
    imageOrientation: "from-image",
  });
  try {
    active(signal);
    const target = browserImageSize(bitmap.width, bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw invalid();
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return jpegFromCanvas(canvas);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
}
export function captureBrowserVideo(video: HTMLVideoElement): string {
  const size = browserImageSize(video.videoWidth, video.videoHeight),
    canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw invalid();
    context.drawImage(video, 0, 0, size.width, size.height);
    return jpegFromCanvas(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
