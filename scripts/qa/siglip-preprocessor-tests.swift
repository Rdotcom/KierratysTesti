import Foundation

@main struct SiglipPreprocessorTests {
  static func main() throws {
    var assertions = 0
    func check(_ condition: Bool) { precondition(condition); assertions += 1 }
    func rejects(_ work: () throws -> Void) {
      do { try work(); preconditionFailure("expected_rejection") } catch { assertions += 1 }
    }
    let black = try SiglipImagePreprocessor.tensor(rgb: .init(pixels: [0, 0, 0], width: 1, height: 1))
    check(black.count == 150528 && black.allSatisfy { $0 == -1 })
    let white = try SiglipImagePreprocessor.tensor(rgb: .init(pixels: [255, 255, 255], width: 1, height: 1))
    check(white.allSatisfy { $0 == 1 })
    let red = try SiglipImagePreprocessor.tensor(rgb: .init(pixels: [255, 0, 0], width: 1, height: 1))
    check(red[0] == 1 && red[50176] == -1 && red[100352] == -1)
    let original = SiglipImagePreprocessor.RGB(pixels: [1,1,1, 2,2,2, 3,3,3, 4,4,4, 5,5,5, 6,6,6], width: 3, height: 2)
    let expected: [[UInt8]] = [[1,2,3,4,5,6],[3,2,1,6,5,4],[6,5,4,3,2,1],[4,5,6,1,2,3],[1,4,2,5,3,6],[4,1,5,2,6,3],[6,3,5,2,4,1],[3,6,2,5,1,4]]
    for exif in 1...8 {
      let image = try SiglipImagePreprocessor.orient(original, exif: exif)
      check(stride(from: 0, to: image.pixels.count, by: 3).map { image.pixels[$0] } == expected[exif - 1])
      check(image.width == (exif >= 5 ? 2 : 3))
    }
    rejects { _ = try SiglipImagePreprocessor.orient(original, exif: 0) }
    rejects { _ = try SiglipImagePreprocessor.tensor(rgb: .init(pixels: [], width: 0, height: 1)) }
    rejects { _ = try SiglipImagePreprocessor.tensor(rgb: .init(pixels: [], width: 4097, height: 1)) }
    rejects { _ = try SiglipImagePreprocessor.tensor(rgb: .init(pixels: [1], width: 1, height: 1)) }
    print("\(assertions) native preprocessing assertions passed")
  }
}
