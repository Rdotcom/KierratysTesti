export const maxPhotoBytes = 1_500_000;
export const maxPhotoBase64Length = 2_000_000;

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Strict, bounded portable codec; no Buffer dependency in the mobile/shared graph. */
export function decodePhotoBase64(value: string): Uint8Array {
  if (
    !value.length ||
    value.length > maxPhotoBase64Length ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)
  )
    throw new Error("invalid_image");
  const size = (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  if (size > maxPhotoBytes) throw new Error("invalid_image");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (let i = 0; i < value.length; i += 4) {
    const a = alphabet.indexOf(value.charAt(i));
    const b = alphabet.indexOf(value.charAt(i + 1));
    const c = value.charAt(i + 2) === "=" ? 0 : alphabet.indexOf(value.charAt(i + 2));
    const d = value.charAt(i + 3) === "=" ? 0 : alphabet.indexOf(value.charAt(i + 3));
    if (offset < size) bytes[offset++] = (a << 2) | (b >> 4);
    if (offset < size) bytes[offset++] = ((b & 15) << 4) | (c >> 2);
    if (offset < size) bytes[offset++] = ((c & 3) << 6) | d;
  }
  if (encodePhotoBase64(bytes) !== value) throw new Error("invalid_image");
  return bytes;
}

export function encodePhotoBase64(bytes: Uint8Array): string {
  if (bytes.length > maxPhotoBytes) throw new Error("invalid_image");
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0,
      b = bytes[i + 1] ?? 0,
      c = bytes[i + 2] ?? 0;
    chunks.push(
      alphabet.charAt(a >> 2) +
        alphabet.charAt(((a & 3) << 4) | (b >> 4)) +
        (i + 1 < bytes.length ? alphabet.charAt(((b & 15) << 2) | (c >> 6)) : "=") +
        (i + 2 < bytes.length ? alphabet.charAt(c & 63) : "="),
    );
  }
  return chunks.join("");
}

/** Strip all APP/COM metadata, including EXIF/GPS/ICC/XMP, before any upload.
 * Supports baseline/progressive JPEG marker streams. Not a full pixel decoder. */
export function stripPhotoMetadata(bytes: Uint8Array): Uint8Array {
  const fail = (): never => {
    throw new Error("invalid_image");
  };
  if (bytes.length < 12 || bytes.length > maxPhotoBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    return fail();
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2,
    inScan = false,
    frameSeen = false,
    scanSeen = false,
    complete = false;
  while (offset < bytes.length) {
    if (inScan) {
      const start = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const next = bytes[offset + 1];
        if (next === 0 || (next !== undefined && next >= 0xd0 && next <= 0xd7)) {
          offset += 2;
          continue;
        }
        break;
      }
      chunks.push(bytes.subarray(start, offset));
      inScan = false;
    }
    const start = offset;
    if (bytes[offset++] !== 0xff) return fail();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!frameSeen || !scanSeen || offset !== bytes.length) return fail();
      chunks.push(new Uint8Array([0xff, 0xd9]));
      complete = true;
      break;
    }
    if (
      marker === undefined ||
      marker === 0 ||
      marker === 0xd8 ||
      marker === 1 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      return fail();
    const length = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
    const end = offset + length;
    if (length < 2 || end > bytes.length) return fail();
    const frame = marker === 0xc0 || marker === 0xc1 || marker === 0xc2;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && !frame) return fail();
    if (frame) {
      if (frameSeen || length < 8) return fail();
      const height = (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0);
      const width = (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0);
      if (!height || !width || height > 4096 || width > 4096 || height * width > 16_000_000)
        return fail();
      frameSeen = true;
    }
    if (marker === 0xda) {
      if (!frameSeen) return fail();
      scanSeen = true;
      inScan = true;
    }
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      chunks.push(bytes.subarray(start, end));
    offset = end;
  }
  if (!complete) return fail();
  const output = new Uint8Array(chunks.reduce((size, part) => size + part.length, 0));
  let cursor = 0;
  for (const part of chunks) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

export function preparePhotoBase64(value: string): string {
  return encodePhotoBase64(stripPhotoMetadata(decodePhotoBase64(value)));
}
