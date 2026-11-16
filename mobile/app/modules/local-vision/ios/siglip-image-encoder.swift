import Foundation
import CoreML
import CoreGraphics
import ImageIO

// Candidate consumer used by the optional, serial object-suggestion worker.
// Embeddings are observations, never product/material/bin verification.
@available(iOS 18.0, macOS 15.0, *)
final class SiglipImageEncoder {
  private let model: MLModel
  static let computeIdentity = "siglip2-block32-fp32-cpu-only-v1"
  static let preprocessingIdentity = "siglip2-jpeg-turbo3.2.1-islow-nosimd-srgb-aa22-224-nchw-v2"

  init(compiledModelURL: URL) throws {
    let config = MLModelConfiguration()
    config.computeUnits = .cpuOnly
    model = try MLModel(contentsOf: compiledModelURL, configuration: config)
    let inputs = model.modelDescription.inputDescriptionsByName
    let outputs = model.modelDescription.outputDescriptionsByName
    guard inputs.count == 1, outputs.count == 1,
          let input = inputs["pixel_values"]?.multiArrayConstraint,
          let output = outputs["embedding"]?.multiArrayConstraint,
          input.shape.map(\.intValue) == [1, 3, 224, 224], input.dataType == .float32,
          output.shape.map(\.intValue) == [1, 768], output.dataType == .float32 else {
      throw SiglipInputFailure.invalidModel
    }
  }

  static func preprocess(imageData: Data) throws -> [Float] {
    guard !imageData.isEmpty, imageData.count <= 8_000_000,
      let source = CGImageSourceCreateWithData(imageData as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
      CGImageSourceGetCount(source) == 1,
      let type = CGImageSourceGetType(source) as String? else { throw SiglipInputFailure.invalidImage }
    if type != "public.jpeg" { return try preprocessImageIO(imageData: imageData, cpuPreferred: false) }
#if KIG_PINNED_JPEG
    guard let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
      let w = props[kCGImagePropertyPixelWidth as String] as? Int,
      let h = props[kCGImagePropertyPixelHeight as String] as? Int,
      w > 0, h > 0, w <= 4096, h <= 4096, w * h <= 8_000_000 else { throw SiglipInputFailure.invalidImage }
    if let profile = props[kCGImagePropertyProfileName as String] as? String,
      !profile.lowercased().contains("srgb") { throw SiglipInputFailure.unsupportedImage }
    var rgb = [UInt8](repeating: 0, count: w * h * 3)
    let ok = rgb.withUnsafeMutableBufferPointer { output in
      imageData.withUnsafeBytes { input in
        kig_jpeg_decode(input.bindMemory(to: UInt8.self).baseAddress, imageData.count,
          output.baseAddress, output.count, Int32(w), Int32(h))
      }
    }
    guard ok == 1 else { throw SiglipInputFailure.invalidImage }
    let exif = (props[kCGImagePropertyOrientation as String] as? Int) ?? 1
    return try SiglipImagePreprocessor.tensor(rgb: .init(pixels: rgb, width: w, height: h), exif: exif)
#else
    // No silent return to OS-dependent JPEG pixels when the pinned dependency is absent.
    throw SiglipInputFailure.unsupportedImage
#endif
  }

#if LOCAL_VISION_QA
  // Diagnostic only: do not promote this preference to a cross-OS guarantee.
  static func preprocessCPUPreferred(imageData: Data) throws -> [Float] {
    try preprocessImageIO(imageData: imageData, cpuPreferred: true)
  }
  static func preprocessSystemDefault(imageData: Data) throws -> [Float] {
    try preprocessImageIO(imageData: imageData, cpuPreferred: false)
  }
#endif

  private static func preprocessImageIO(imageData: Data, cpuPreferred: Bool) throws -> [Float] {
    var options: [CFString: Any] = [kCGImageSourceShouldCache: false]
    if cpuPreferred { options["kCGImageSourceUseHardwareAcceleration" as CFString] = false }
    guard !imageData.isEmpty, imageData.count <= 8_000_000,
          let source = CGImageSourceCreateWithData(imageData as CFData, options as CFDictionary),
          CGImageSourceGetCount(source) == 1,
          let type = CGImageSourceGetType(source) as String?, ["public.jpeg", "public.png"].contains(type),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
          let w = props[kCGImagePropertyPixelWidth as String] as? Int,
          let h = props[kCGImagePropertyPixelHeight as String] as? Int,
          w > 0, h > 0, w <= 4096, h <= 4096, w * h <= 8_000_000,
          let image = CGImageSourceCreateImageAtIndex(source, 0, cpuPreferred ? options as CFDictionary : nil), image.width == w, image.height == h,
          let color = CGColorSpace(name: CGColorSpace.sRGB) else { throw SiglipInputFailure.invalidImage }
    let exif = (props[kCGImagePropertyOrientation as String] as? Int) ?? 1
    var rgba = [UInt8](repeating: 0, count: w * h * 4)
    let success = rgba.withUnsafeMutableBytes { pointer -> Bool in
      guard let context = CGContext(data: pointer.baseAddress, width: w, height: h, bitsPerComponent: 8,
        bytesPerRow: w * 4, space: color,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    guard success else { throw SiglipInputFailure.invalidImage }
    var rgb = [UInt8](repeating: 0, count: w * h * 3)
    for i in 0..<(w * h) {
      // Avoid silently choosing black/white compositing for transparent input.
      guard rgba[i * 4 + 3] == 255 else { throw SiglipInputFailure.unsupportedImage }
      for c in 0..<3 { rgb[i * 3 + c] = rgba[i * 4 + c] }
    }
    return try SiglipImagePreprocessor.tensor(rgb: .init(pixels: rgb, width: w, height: h), exif: exif)
  }

  func encode(tensor: [Float]) throws -> [Double] {
    guard tensor.count == SiglipImagePreprocessor.tensorCount,
          tensor.allSatisfy({ $0.isFinite && $0 >= -1 && $0 <= 1 }) else { throw SiglipInputFailure.invalidTensor }
    let input = try MLMultiArray(shape: [1, 3, 224, 224], dataType: .float32)
    guard input.strides.map(\.intValue) == [150528, 50176, 224, 1] else { throw SiglipInputFailure.invalidTensor }
    tensor.withUnsafeBufferPointer { buffer in
      input.dataPointer.assumingMemoryBound(to: Float.self).update(from: buffer.baseAddress!, count: buffer.count)
    }
    let output = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["pixel_values": MLFeatureValue(multiArray: input)]))
    guard let values = output.featureValue(for: "embedding")?.multiArrayValue,
          values.dataType == .float32, values.shape.map(\.intValue) == [1, 768], values.count == 768 else {
      throw SiglipInputFailure.invalidEmbedding
    }
    let vector = (0..<768).map { values[$0].doubleValue }
    let norm = sqrt(vector.reduce(0) { $0 + $1 * $1 })
    guard vector.allSatisfy(\.isFinite), norm.isFinite, norm > 0.000001 else { throw SiglipInputFailure.invalidEmbedding }
    return vector.map { $0 / norm }
  }
}
