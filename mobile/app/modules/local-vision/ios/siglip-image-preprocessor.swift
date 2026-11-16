import Foundation

enum SiglipInputFailure: Error {
  case invalidImage, unsupportedImage, invalidTensor, invalidModel, invalidEmbedding
}

// Independent Swift implementation of separable antialiased bilinear sampling.
// Fixed-point coefficient/rounding convention matches Pillow12 Resample.c.
// See Resources/Notices/pillow-mit-cmu.txt for attribution and licence.
enum SiglipImagePreprocessor {
  static let side = 224
  static let tensorCount = 3 * side * side
  static let identity = "siglip2-rgb-bilinear-aa22-224-nchw-rescale-double-f32-normalize-v1"

  struct RGB {
    let pixels: [UInt8]
    let width: Int
    let height: Int
  }

  static func orient(_ input: RGB, exif: Int) throws -> RGB {
    guard input.width > 0, input.height > 0, input.width <= 4096, input.height <= 4096,
          input.width * input.height <= 8_000_000,
          input.pixels.count == input.width * input.height * 3,
          (1...8).contains(exif) else { throw SiglipInputFailure.invalidImage }
    if exif == 1 { return input }
    let swapped = exif >= 5
    let w = swapped ? input.height : input.width
    let h = swapped ? input.width : input.height
    var result = [UInt8](repeating: 0, count: w * h * 3)
    for y in 0..<h { for x in 0..<w {
      let sx: Int, sy: Int
      switch exif {
      case 2: (sx, sy) = (input.width - 1 - x, y)
      case 3: (sx, sy) = (input.width - 1 - x, input.height - 1 - y)
      case 4: (sx, sy) = (x, input.height - 1 - y)
      case 5: (sx, sy) = (y, x)
      case 6: (sx, sy) = (y, input.height - 1 - x)
      case 7: (sx, sy) = (input.width - 1 - y, input.height - 1 - x)
      case 8: (sx, sy) = (input.width - 1 - y, x)
      default: throw SiglipInputFailure.invalidImage
      }
      for c in 0..<3 { result[(y * w + x) * 3 + c] = input.pixels[(sy * input.width + sx) * 3 + c] }
    } }
    return RGB(pixels: result, width: w, height: h)
  }

  private struct Kernel {
    let first: Int
    let weights: [Int]
  }

  private static func kernels(_ input: Int) -> [Kernel] {
    let scale = Double(input) / Double(side), support = max(1, scale)
    return (0..<side).map { out in
      let center = (Double(out) + 0.5) * scale
      let first = max(0, Int(center - support + 0.5))
      let last = min(input, Int(center + support + 0.5))
      let weights = (first..<last).map { max(0, 1 - abs((Double($0) - center + 0.5) / support)) }
      let sum = weights.reduce(0, +)
      return Kernel(first: first, weights: weights.map { Int(0.5 + $0 / sum * Double(1 << 22)) })
    }
  }

  static func tensor(rgb input: RGB, exif: Int = 1) throws -> [Float] {
    let image = try orient(input, exif: exif)
    let xs = kernels(image.width), ys = kernels(image.height)
    var horizontal = [UInt8](repeating: 0, count: side * image.height * 3)
    for y in 0..<image.height { for x in 0..<side { for c in 0..<3 {
      var sum = 1 << 21
      for (i, weight) in xs[x].weights.enumerated() {
        sum += Int(image.pixels[(y * image.width + xs[x].first + i) * 3 + c]) * weight
      }
      horizontal[(y * side + x) * 3 + c] = UInt8(clamping: sum >> 22)
    } } }
    var result = [Float](repeating: 0, count: tensorCount)
    for y in 0..<side { for x in 0..<side { for c in 0..<3 {
      var sum = 1 << 21
      for (i, weight) in ys[y].weights.enumerated() {
        sum += Int(horizontal[((ys[y].first + i) * side + x) * 3 + c]) * weight
      }
      let pixel = UInt8(clamping: sum >> 22)
      // HF rescale multiplies in Double, casts to Float32, then normalizes.
      result[c * side * side + y * side + x] = (Float(Double(pixel) / 255.0) - 0.5) / 0.5
    } } }
    return result
  }
}
