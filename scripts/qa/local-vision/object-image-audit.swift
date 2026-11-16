// macOS-only read-only audit decoder. Not the shipping model preprocessing.
import Foundation
import ImageIO
import CoreGraphics
import CryptoKit

func run() throws {
  var input = Data()
  while let chunk = try FileHandle.standardInput.read(upToCount: 65536), !chunk.isEmpty {
    guard input.count + chunk.count <= 8_000_000 else { throw NSError(domain: "byte_bound", code: 1) }
    input.append(chunk)
  }
  guard !input.isEmpty, input.count <= 8_000_000,
        let source = CGImageSourceCreateWithData(input as CFData, nil),
        CGImageSourceGetCount(source) == 1,
        let type = CGImageSourceGetType(source) as String?,
        ["public.jpeg", "public.png"].contains(type),
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
        let width = props[kCGImagePropertyPixelWidth as String] as? Int,
        let height = props[kCGImagePropertyPixelHeight as String] as? Int,
        width >= 32, height >= 32, width <= 4096, height <= 4096,
        width * height <= 8_000_000 else { throw NSError(domain: "image_bound", code: 1) }
  let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: max(width, height),
    kCGImageSourceShouldCacheImmediately: true
  ]
  guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
        let colour = CGColorSpace(name: CGColorSpace.sRGB) else { throw NSError(domain: "decode", code: 1) }
  let w = image.width, h = image.height
  var rgba = [UInt8](repeating: 0, count: w * h * 4)
  let decoded = rgba.withUnsafeMutableBytes { pointer -> Bool in
    guard let ctx = CGContext(data: pointer.baseAddress, width: w, height: h, bitsPerComponent: 8,
      bytesPerRow: w * 4, space: colour, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return true
  }
  guard decoded else { throw NSError(domain: "pixels", code: 1) }
  var grey = [UInt8](repeating: 0, count: 72)
  let reduced = grey.withUnsafeMutableBytes { pointer -> Bool in
    guard let ctx = CGContext(data: pointer.baseAddress, width: 9, height: 8, bitsPerComponent: 8,
      bytesPerRow: 9, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: 9, height: 8))
    return true
  }
  guard reduced else { throw NSError(domain: "thumbnail", code: 1) }
  var bits: UInt64 = 0
  for y in 0..<8 { for x in 0..<8 {
    bits = (bits << 1) | (grey[y * 9 + x] > grey[y * 9 + x + 1] ? 1 : 0)
  } }
  var canonical = Data("imageio-rgba-v1:\(w):\(h):".utf8)
  canonical.append(contentsOf: rgba)
  let metadataKeys = [kCGImagePropertyExifDictionary, kCGImagePropertyGPSDictionary,
    kCGImagePropertyIPTCDictionary, kCGImagePropertyTIFFDictionary]
  // Conservative flag, never print dictionary values or precise location.
  let metadataPresent = metadataKeys.contains { props[$0 as String] != nil }
    || CGImageSourceCopyMetadataAtIndex(source, 0, nil) != nil
  let result: [String: Any] = [
    "width": w, "height": h,
    "pixelSha256": SHA256.hash(data: canonical).map { String(format: "%02x", $0) }.joined(),
    "perceptualHash": String(format: "%016llx", bits), "metadataPresent": metadataPresent
  ]
  FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]))
}
do { try run() } catch {
  FileHandle.standardError.write(Data("image_decode_rejected\n".utf8))
  exit(1)
}
