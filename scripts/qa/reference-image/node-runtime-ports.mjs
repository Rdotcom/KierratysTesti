import { createHash } from "node:crypto";

export const NODE_REFERENCE_DECODE_POLICY = "single-frame-jpeg-png-srgb-white-auto-orient-v1";

// Build-time QA adapter only. The caller must supply and pin a trusted Sharp
// implementation. No file/URL/network/native-mobile access is implemented here.
// Reject oversized originals BEFORE pixel decoding rather than silently resize
// them into a different, unrecorded reference. This is not a phone-photo adapter.
export function createNodeReferencePorts(sharp) {
  if (typeof sharp !== "function") throw new Error("trusted_decoder_required");
  return Object.freeze({
    async sha256(bytes) {
      return createHash("sha256").update(bytes).digest("hex");
    },
    async decodeRgb(bytes, limits) {
      if (
        !(bytes instanceof Uint8Array) ||
        Object.getPrototypeOf(bytes) !== Uint8Array.prototype ||
        bytes.byteLength === 0 ||
        bytes.byteLength > 2 * 1024 * 1024 ||
        limits.maximumDimension !== 1024 ||
        limits.maximumPixels !== 1048576
      )
        throw new Error("decode_input_invalid");
      const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
      const isPng = pngMagic.every((byte, index) => bytes[index] === byte);
      if (!isJpeg && !isPng) throw new Error("decode_signature_invalid");
      const options = { limitInputPixels: 1048576, failOn: "warning", sequentialRead: true };
      const metadata = await sharp(bytes, options).metadata();
      if (
        !["jpeg", "png"].includes(metadata.format) ||
        (metadata.pages !== undefined && metadata.pages !== 1) ||
        !Number.isInteger(metadata.width) ||
        !Number.isInteger(metadata.height) ||
        metadata.width < 32 ||
        metadata.height < 32 ||
        metadata.width > 1024 ||
        metadata.height > 1024 ||
        metadata.width * metadata.height > 1048576
      )
        throw new Error("decode_metadata_invalid");
      const decoded = await sharp(bytes, options)
        .rotate()
        .flatten({ background: "#ffffff" })
        .toColourspace("srgb")
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (
        decoded.info.channels !== 3 ||
        !Number.isInteger(decoded.info.width) ||
        !Number.isInteger(decoded.info.height) ||
        decoded.info.width < 32 ||
        decoded.info.height < 32 ||
        decoded.info.width > 1024 ||
        decoded.info.height > 1024 ||
        decoded.data.byteLength !== decoded.info.width * decoded.info.height * 3
      )
        throw new Error("decode_rgb_invalid");
      return {
        width: decoded.info.width,
        height: decoded.info.height,
        data: new Uint8Array(decoded.data),
      };
    },
  });
}
