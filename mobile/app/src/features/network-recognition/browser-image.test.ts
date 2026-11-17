import { describe, expect, it, vi } from "vitest";
import { preparePhotoBase64, encodePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import {
  browserImageSize,
  inspectBrowserImage,
  maxBrowserFileBytes,
  prepareBrowserFile,
  stopBrowserCamera,
} from "./browser-image";
// Marker-stream fixture only. Real decoding/model evidence is in the browser E2E.
const jpeg = new Uint8Array([
  255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 42,
  255, 217,
]);
describe("bounded browser image preparation (Chrome/Edge, OS-independent)", () => {
  it("reads JPEG geometry without trusting filename/type", () => {
    const info = inspectBrowserImage(jpeg);
    expect(info.mime).toBe("image/jpeg");
    expect(info.width * info.height).toBeGreaterThan(0);
  });
  it("bounds target geometry while preserving aspect ratio", () => {
    expect(browserImageSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(browserImageSize(640, 480)).toEqual({ width: 640, height: 480 });
    for (const value of [0, -1, NaN, Infinity]) expect(() => browserImageSize(value, 10)).toThrow();
  });
  it("rejects non-images, truncated headers and oversized files", () => {
    for (const bytes of [
      new Uint8Array(8),
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      new Uint8Array(maxBrowserFileBytes + 1),
    ])
      expect(() => inspectBrowserImage(bytes)).toThrow();
  });
  it("checks PNG dimensions before decode and rejects animation", () => {
    const bytes = new Uint8Array(45),
      view = new DataView(bytes.buffer);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    view.setUint32(8, 13);
    view.setUint32(12, 0x49484452);
    view.setUint32(16, 100);
    view.setUint32(20, 100);
    expect(inspectBrowserImage(bytes)).toEqual({ width: 100, height: 100, mime: "image/png" });
    view.setUint32(37, 0x6163544c);
    expect(() => inspectBrowserImage(bytes)).toThrow();
    view.setUint32(37, 0);
    view.setUint32(16, 16384);
    view.setUint32(20, 16384);
    expect(() => inspectBrowserImage(bytes)).toThrow();
  });
  it("bounds WebP dimensions and refuses animated input", () => {
    const bytes = new Uint8Array(30),
      view = new DataView(bytes.buffer);
    view.setUint32(0, 0x52494646);
    view.setUint32(4, 22, true);
    view.setUint32(8, 0x57454250);
    view.setUint32(12, 0x56503858);
    bytes[24] = 99;
    bytes[27] = 99;
    expect(inspectBrowserImage(bytes)).toEqual({ width: 100, height: 100, mime: "image/webp" });
    bytes[20] = 2;
    expect(() => inspectBrowserImage(bytes)).toThrow();
  });
  it("preserves pinned bounded JPEG pixels, stripping metadata without a browser decode", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);
    try {
      const file = new File([jpeg], "untrusted-name.png", { type: "image/png" });
      expect(await prepareBrowserFile(file, new AbortController().signal)).toBe(
        preparePhotoBase64(encodePhotoBase64(jpeg)),
      );
      expect(decoder).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects cancellation before file access", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareBrowserFile(new File([jpeg], "photo.jpg"), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("stops every camera track on cleanup", () => {
    const first = vi.fn(),
      second = vi.fn();
    stopBrowserCamera({ getTracks: () => [{ stop: first }, { stop: second }] });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    stopBrowserCamera(undefined);
  });
});
