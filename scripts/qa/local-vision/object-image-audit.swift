// macOS-only read-only audit decoder. Not the shipping model preprocessing.
import Foundation
import ImageIO
import CoreGraphics
import CryptoKit

// Inspect actual container blocks, not ImageIO's synthesized descriptive tags.
func embeddedMetadata(_ data: Data, png: Bool) throws -> Bool {
  let bytes = [UInt8](data)
  if png {
    var at = 8
    while at + 12 <= bytes.count {
      let length = Int(bytes[at]) << 24 | Int(bytes[at + 1]) << 16 | Int(bytes[at + 2]) << 8 | Int(bytes[at + 3])
      guard length <= bytes.count - at - 12 else { throw NSError(domain: "png_length", code: 1) }
      let type = String(bytes: bytes[(at + 4)..<(at + 8)], encoding: .ascii) ?? ""
      if ["eXIf", "tEXt", "iTXt", "zTXt"].contains(type) { return true }
      at += length + 12
      if type == "IEND" { break }
    }
    return false
  }
  var at = 2
  while at < bytes.count {
    guard bytes[at] == 255 else { throw NSError(domain: "jpeg_marker", code: 1) }
    while at < bytes.count && bytes[at] == 255 { at += 1 }
    guard at < bytes.count else { throw NSError(domain: "jpeg_marker", code: 1) }
    let marker = bytes[at]; at += 1
    if marker == 0xDA || marker == 0xD9 { break }
    if marker == 0xFE || (marker >= 0xE1 && marker <= 0xEF && marker != 0xE2 && marker != 0xEE) { return true }
    if marker == 0x01 || (marker >= 0xD0 && marker <= 0xD8) { continue }
    guard at + 2 <= bytes.count else { throw NSError(domain: "jpeg_length", code: 1) }
    let length = Int(bytes[at]) << 8 | Int(bytes[at + 1])
    guard length >= 2 && length <= bytes.count - at else { throw NSError(domain: "jpeg_length", code: 1) }
    at += length
  }
  return false
}

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
  let decoded = rgba.withUnsafeMutableBytes { pointer -> CGImage? in
    guard let ctx = CGContext(data: pointer.baseAddress, width: w, height: h, bitsPerComponent: 8,
      bytesPerRow: w * 4, space: colour, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return ctx.makeImage()
  }
  guard let decoded else { throw NSError(domain: "pixels", code: 1) }
  if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--clean" {
    let output = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(output, "public.png" as CFString, 1, nil) else {
      throw NSError(domain: "output", code: 1)
    }
    // Newly rendered pixels only; never copy original property dictionaries.
    CGImageDestinationAddImage(destination, decoded, nil)
    guard CGImageDestinationFinalize(destination), output.length <= 8_000_000 else {
      throw NSError(domain: "output_bound", code: 1)
    }
    FileHandle.standardOutput.write(output as Data)
    return
  }
  guard CommandLine.arguments.count == 1 else { throw NSError(domain: "arguments", code: 1) }
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
  let metadataPresent = try embeddedMetadata(input, png: type == "public.png")
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
