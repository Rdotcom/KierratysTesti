// Local CPU-only QA, fresh class prompts. Not shipping inference or calibrated confidence.
import Foundation
@preconcurrency import CoreML
import CoreImage
import CoreGraphics
import CoreVideo
import ImageIO
import CryptoKit

func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
func unit(_ array: MLMultiArray) throws -> [Double] {
  guard array.count == 512 else { throw MobileClipFailure.invalidModel }
  let v = (0..<512).map { array[$0].doubleValue }, n = sqrt((0..<512).reduce(0.0) { $0 + v[$1] * v[$1] })
  guard n.isFinite, n > 0 else { throw MobileClipFailure.invalidModel }
  return v.map { $0 / n }
}
func runObjectSmoke() throws {
  guard CommandLine.arguments.count == 2 else { throw MobileClipFailure.invalidArguments }
  let base = URL(fileURLWithPath: CommandLine.arguments[1]), raw = try boundedData(base.appendingPathComponent("lock.json"), maximum: 2_000_000)
  guard let lock = try JSONSerialization.jsonObject(with: raw) as? [String: Any],
        let assetsPath = lock["assets"] as? String, let compiledPath = lock["compiled"] as? String,
        let prompts = lock["prompts"] as? [String], let groups = lock["classes"] as? [String],
        let rows = lock["rows"] as? [[String: String]], rows.count == 4, prompts.count == groups.count, groups.count == 15,
        let pins = lock["pins"] as? [String: String] else { throw MobileClipFailure.invalidArguments }
  let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  for (file, expected) in pins where !file.hasSuffix("model.safetensors") && !file.contains("/model/") {
    guard hash(try boundedData(root.appendingPathComponent(file), maximum: 100_000_000)) == expected else { throw MobileClipFailure.invalidAssets }
  }
  let config = MLModelConfiguration(); config.computeUnits = .cpuOnly
  let text = try MLModel(contentsOf: root.appendingPathComponent(compiledPath).appendingPathComponent("mobileclip_s0_text.mlmodelc"), configuration: config)
  let tokenizer = try MobileClipTokenizer(assets: root.appendingPathComponent(assetsPath))
  var prototypes: [[Double]] = []
  for prompt in prompts {
    let tokens = try tokenizer.encode(prompt), input = try MLMultiArray(shape: [1, 77], dataType: .int32)
    for (i, value) in tokens.enumerated() { input[i] = NSNumber(value: value) }
    let result = try text.prediction(from: MLDictionaryFeatureProvider(dictionary: ["text": input]))
    guard let array = result.featureValue(for: "final_emb_1")?.multiArrayValue else { throw MobileClipFailure.invalidModel }
    prototypes.append(try unit(array))
  }
  let imageModel = try MLModel(contentsOf: root.appendingPathComponent(compiledPath).appendingPathComponent("mobileclip_s0_image.mlmodelc"), configuration: config)
  guard let constraint = imageModel.modelDescription.inputDescriptionsByName["image"]?.imageConstraint else { throw MobileClipFailure.invalidModel }
  let colour = CGColorSpace(name: CGColorSpace.sRGB)!, context = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
  for row in rows {
    let start = ProcessInfo.processInfo.systemUptime
    var output: [String: Any] = ["model": "mobileclip", "id": row["id"] ?? "", "failure": NSNull()]
    do {
      guard let file = row["file"], let expected = row["imageSha256"] else { throw MobileClipFailure.invalidImage }
      let bytes = try boundedData(root.appendingPathComponent(file), maximum: 8_000_000)
      guard hash(bytes) == expected, let source = CGImageSourceCreateWithData(bytes as CFData, nil), CGImageSourceGetCount(source) == 1,
        let cg = CGImageSourceCreateImageAtIndex(source, 0, nil), cg.width * cg.height <= 8_000_000 else { throw MobileClipFailure.invalidImage }
      // Full-frame aspect fit, matching the product-path geometry, not center crop.
      var image = CIImage(cgImage: cg); let e = image.extent, scale = 256 / max(e.width, e.height)
      image = image.transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY))
        .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        .transformed(by: CGAffineTransform(translationX: (256 - e.width * scale) / 2, y: (256 - e.height * scale) / 2))
      image = image.composited(over: CIImage(color: CIColor(red: 127.0/255, green: 127.0/255, blue: 127.0/255)).cropped(to: CGRect(x: 0, y: 0, width: 256, height: 256)))
      var buffer: CVPixelBuffer?
      guard CVPixelBufferCreate(nil, 256, 256, constraint.pixelFormatType, nil, &buffer) == kCVReturnSuccess, let buffer else { throw MobileClipFailure.processingFailed }
      context.render(image, to: buffer, bounds: CGRect(x: 0, y: 0, width: 256, height: 256), colorSpace: colour)
      let result = try imageModel.prediction(from: MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: buffer)]))
      guard let array = result.featureValue(for: "final_emb_1")?.multiArrayValue else { throw MobileClipFailure.invalidModel }
      let v = try unit(array)
      output["scores"] = groups.enumerated().map { i, group in ["group": group, "cosine": zip(v, prototypes[i]).reduce(0.0) { $0 + $1.0 * $1.1 }] as [String: Any] }
      output["imageSha256"] = expected
    } catch { output["failure"] = "image_inference_failed" }
    output["durationMs"] = Int((ProcessInfo.processInfo.systemUptime - start) * 1000)
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])); FileHandle.standardOutput.write(Data([10]))
    context.clearCaches()
  }
}
@main struct ObjectSmoke { static func main() {
  do { try mainRun() } catch { FileHandle.standardError.write(Data("mobileclip_smoke_failed\n".utf8)); exit(1) }
}
static func mainRun() throws { try runObjectSmoke() }
}
