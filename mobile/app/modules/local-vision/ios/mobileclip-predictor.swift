import Foundation
import CoreGraphics
import CoreImage
import CoreVideo
import ImageIO
import CryptoKit
@preconcurrency import CoreML

enum LocalMobileClipFailure: Error {
  case unsupportedPlatform
  case unavailable
  case invalidModel
  case processingFailed
}

struct LocalMobileClipScore: Encodable, Sendable {
  let group: String
  let cosine: Double
}

private struct LocalClipPrototypeGroup: Decodable {
  let group: String
  let role: String
  let embedding: [Double]
}

private struct LocalClipPrototypes: Decodable {
  let schemaVersion: String
  let modelId: String
  let modelRevision: String
  let imageWeightSha256: String
  let textWeightSha256: String
  let promptPolicy: String
  let promptsSha256: String
  let tokenizerPolicy: String
  let preprocessing: String
  let computeUnits: String
  let groups: [LocalClipPrototypeGroup]
}

private final class LocalClipBundleMarker: NSObject {}

/// Called only by LocalVisionEngine's serial, single-flight worker. Initializers
/// perform no model work. No networking, image/file input, logs or persistence.
/// Model prediction cannot be cancelled: the caller retains its gate and checks
/// the overall deadline after this method returns, never after a UI timeout alone.
final class LocalMobileClipPredictor: @unchecked Sendable {
  static let shared = LocalMobileClipPredictor()
  static let modelId = "apple-mobileclip-s0-coreml-2024"
  static let modelRevision = "55c8098c12ba8f928e37e26b2e1dd097777c3f98"
  static let imageWeightSha256 = "87d8f63997bbd2f38ba7defeaaa2c571928bdece56aa9629542198b3ce906ed6"
  static let prototypesSha256 = "0dfe73569d1b2177629d95c4bc21c1392be9228aff6809cab0ed1c3358893c81"
  static let promptsSha256 = "aa726197e10fc1911b88bb6d6da099220339133c6e39e500f112b9077316e610"
  static let promptPolicy = "packaging-visible-form-v1"
  static let preprocessing = "center-square-256-srgb-v1"
  static let computeUnitsName = "cpuOnly"
  static let referencePreprocessing = "aspect-fit-256-srgb-gray127-v1|l2-double-reduction-order-v1|final_emb_1|Float32|1,512"
  // Versioned resource/interface identity, NOT a hash of the iOS executable and
  // NOT interchangeable with the Mac QA binary's encoder identity.
  static var referenceEncoderDescriptor: String {
    ["ios-reference-encoder-v1", modelId, modelRevision, imageWeightSha256,
     compiledGraphSha256, sourceSpecSha256, sourceManifestSha256, prototypesSha256,
     computeUnitsName, "final_emb_1|Float32|1,512"].joined(separator: "|")
  }
  static var referenceEncoderSha256: String { digest(referenceEncoderDescriptor) }
  static var referencePreprocessingSha256: String { digest(referencePreprocessing) }
  private static func digest(_ text: String) -> String {
    SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
  }
  private static let textWeightSha256 = "34723e51445b2630106e94e1fdbebed80e7676b404fb839f4eb9bec97bdcad68"
  private static let sourceSpecSha256 = "2c1afa132c41c6535817cc67894bd7484bc2cbd084ed5e2f12b24f611af17591"
  private static let sourceManifestSha256 = "fe07dde983dae92c1799132816ce55f9ff8487f2681b530abf7222025aa27fa4"
  // If a future target/compiler changes the generated graph, fail closed until
  // its artifact is independently checked and this versioned pin is reviewed.
  private static let compiledGraphSha256 = "858f2fc75c7d7b2fd182c1a13ae099a3f66c16ba1d0ea72375a0cdf6fe97b984"
  private static let expectedGroups = [
    "bottle", "jar", "box", "bag", "cup", "other-battery", "other-phone",
    "other-book", "other-food", "other-person", "other-animal", "other-leaf",
    "other-clothes", "other-electronics", "other-tools", "other-plate",
    "other-aerosol", "other-drink-can",
  ]

  private struct Cache {
    let model: MLModel
    let prototypes: LocalClipPrototypes
    let colour: CGColorSpace
    let context: CIContext
    let imageFeature: MLFeatureDescription
    let pixelFormat: OSType
  }
  private var cache: Cache?
  private var permanentLoadFailure: LocalMobileClipFailure?
  #if LOCAL_VISION_QA
  private var qaResourceURL: URL?
  convenience init(resourcesURL: URL?) {
    self.init()
    qaResourceURL = resourcesURL
  }
  #endif
  private init() {}

  /// Integrity/load/interface preflight only. No image, pixel buffer or prediction.
  /// The caller must use the same serial worker as predict; the cache is shared.
  func inspectReadiness() throws {
    #if os(iOS)
    guard #available(iOS 17.2, *) else { throw LocalMobileClipFailure.unsupportedPlatform }
    #elseif os(macOS)
    guard #available(macOS 14.0, *) else { throw LocalMobileClipFailure.unsupportedPlatform }
    #else
    throw LocalMobileClipFailure.unsupportedPlatform
    #endif
    _ = try load()
  }

  func predict(image: CGImage, orientation: CGImagePropertyOrientation) throws -> [LocalMobileClipScore] {
    let vector = try embedding(image: image, orientation: orientation, fullFrame: false)
    let loaded = try load()
    return try loaded.prototypes.groups.map { group in
      let cosine = zip(vector, group.embedding).reduce(0) { $0 + $1.0 * $1.1 }
      guard cosine.isFinite, cosine >= -1.000_001, cosine <= 1.000_001 else {
        throw LocalMobileClipFailure.processingFailed
      }
      return LocalMobileClipScore(group: group.group, cosine: min(1, max(-1, cosine)))
    }
  }

  /// Experimental reference port only. No prototype classification/product/bin.
  /// Shares the verified model/cache and the engine's single-flight worker.
  func referenceEmbedding(image: CGImage, orientation: CGImagePropertyOrientation, deadlineAt: TimeInterval) throws -> [Double] {
    try embedding(image: image, orientation: orientation, fullFrame: true, deadlineAt: deadlineAt)
  }

  private func embedding(image: CGImage, orientation: CGImagePropertyOrientation, fullFrame: Bool, deadlineAt: TimeInterval? = nil) throws -> [Double] {
    func checkDeadline() throws {
      if let deadlineAt, ProcessInfo.processInfo.systemUptime >= deadlineAt { throw LocalVisionFailure.timeout }
    }
    try checkDeadline()
    #if os(iOS)
    guard #available(iOS 17.2, *) else { throw LocalMobileClipFailure.unsupportedPlatform }
    #elseif os(macOS)
    guard #available(macOS 14.0, *) else { throw LocalMobileClipFailure.unsupportedPlatform }
    #else
    throw LocalMobileClipFailure.unsupportedPlatform
    #endif
    guard image.width > 0, image.height > 0, image.width <= 4096,
          image.height <= 4096, image.width * image.height <= 16_000_000 else {
      throw LocalMobileClipFailure.processingFailed
    }
    let loaded = try load()
    try checkDeadline()
    // Do not retain app-owned Core Image intermediate caches between requests.
    // This is not a promise of cryptographic wiping of every framework buffer.
    defer { loaded.context.clearCaches() }
    let input = try imageBuffer(image, orientation: orientation, assets: loaded, fullFrame: fullFrame)
    try checkDeadline()
    let value = MLFeatureValue(pixelBuffer: input)
    guard loaded.imageFeature.isAllowedValue(value) else { throw LocalMobileClipFailure.processingFailed }
    let output: any MLFeatureProvider
    do {
      output = try loaded.model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["image": value]))
    } catch { throw LocalMobileClipFailure.processingFailed }
    try checkDeadline()
    guard let array = output.featureValue(for: "final_emb_1")?.multiArrayValue,
          array.count == 512, array.shape.map(\.intValue) == [1, 512], array.dataType == .float32 else {
      throw LocalMobileClipFailure.processingFailed
    }
    let raw = (0..<512).map { array[$0].doubleValue }
    guard raw.allSatisfy(\.isFinite) else { throw LocalMobileClipFailure.processingFailed }
    let norm = sqrt(raw.reduce(0) { $0 + $1 * $1 })
    guard norm.isFinite, norm > 0.000_001 else { throw LocalMobileClipFailure.processingFailed }
    return raw.map { $0 / norm }
  }

  private func resources() throws -> URL {
    #if LOCAL_VISION_QA
    if let qaResourceURL { return qaResourceURL.resolvingSymlinksInPath().standardizedFileURL }
    #endif
    let candidates = [Bundle.main, Bundle(for: LocalClipBundleMarker.self)]
    for bundle in candidates {
      if let url = bundle.url(forResource: "KierratysLocalVisionModels", withExtension: "bundle"),
         let resource = Bundle(url: url)?.resourceURL {
        return resource.resolvingSymlinksInPath().standardizedFileURL
      }
    }
    throw LocalMobileClipFailure.unavailable
  }

  private func load() throws -> Cache {
    if let cache { return cache }
    if let failure = permanentLoadFailure { throw failure }
    do {
      let root = try resources()
      try verify(root, path: "mobileclip-source-spec.bin", size: 153_260, digest: Self.sourceSpecSha256)
      try verify(root, path: "mobileclip-source-manifest.bin", size: 617, digest: Self.sourceManifestSha256)
      try verify(root, path: "mobileclip_s0_image.mlmodelc/weights/weight.bin", size: 22_717_696, digest: Self.imageWeightSha256)
      try verify(root, path: "mobileclip_s0_image.mlmodelc/model.mil", maximum: 500_000, digest: Self.compiledGraphSha256)
      let prototypeData = try verify(root, path: "mobileclip-prototypes.bin", size: 281_970, digest: Self.prototypesSha256, retain: true)
      let prototypes = try JSONDecoder().decode(LocalClipPrototypes.self, from: prototypeData)
      guard prototypes.schemaVersion == "mobileclip-prototypes-v1",
            prototypes.modelId == Self.modelId, prototypes.modelRevision == Self.modelRevision,
            prototypes.imageWeightSha256 == Self.imageWeightSha256,
            prototypes.textWeightSha256 == Self.textWeightSha256,
            prototypes.promptPolicy == Self.promptPolicy, prototypes.promptsSha256 == Self.promptsSha256,
            prototypes.tokenizerPolicy == "clip-ascii-bpe-49408-v1",
            prototypes.preprocessing == Self.preprocessing, prototypes.computeUnits == Self.computeUnitsName,
            prototypes.groups.map(\.group) == Self.expectedGroups else { throw LocalMobileClipFailure.invalidModel }
      for (index, group) in prototypes.groups.enumerated() {
        let norm = sqrt(group.embedding.reduce(0) { $0 + $1 * $1 })
        guard group.role == (index < 5 ? "supported" : "outside"), group.embedding.count == 512,
              group.embedding.allSatisfy(\.isFinite), abs(norm - 1) < 0.000_01 else {
          throw LocalMobileClipFailure.invalidModel
        }
      }
      let modelURL = root.appendingPathComponent("mobileclip_s0_image.mlmodelc", isDirectory: true)
      let configuration = MLModelConfiguration()
      configuration.computeUnits = .cpuOnly
      let model: MLModel
      do { model = try MLModel(contentsOf: modelURL, configuration: configuration) }
      catch { throw LocalMobileClipFailure.unavailable }
      guard model.modelDescription.inputDescriptionsByName.count == 1,
            let feature = model.modelDescription.inputDescriptionsByName["image"],
            let constraint = feature.imageConstraint, constraint.pixelsWide == 256,
            constraint.pixelsHigh == 256,
            [kCVPixelFormatType_32ARGB, kCVPixelFormatType_32BGRA].contains(constraint.pixelFormatType),
            let output = model.modelDescription.outputDescriptionsByName["final_emb_1"],
            output.type == .multiArray,
            let colour = CGColorSpace(name: CGColorSpace.sRGB) else { throw LocalMobileClipFailure.invalidModel }
      let result = Cache(model: model, prototypes: prototypes, colour: colour,
                         context: CIContext(options: [.workingColorSpace: colour, .outputColorSpace: colour, .cacheIntermediates: false]),
                         imageFeature: feature, pixelFormat: constraint.pixelFormatType)
      cache = result
      return result
    } catch let failure as LocalMobileClipFailure {
      if case .invalidModel = failure { permanentLoadFailure = failure }
      throw failure
    } catch {
      permanentLoadFailure = .invalidModel
      throw LocalMobileClipFailure.invalidModel
    }
  }

  @discardableResult
  private func verify(_ root: URL, path: String, size: Int? = nil, maximum: Int? = nil,
                      digest: String, retain: Bool = false) throws -> Data {
    let url = root.appendingPathComponent(path).standardizedFileURL
    guard url.path.hasPrefix(root.path + "/"), url.resolvingSymlinksInPath() == url else { throw LocalMobileClipFailure.invalidModel }
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true,
          let bytes = values.fileSize, bytes > 0,
          size.map({ bytes == $0 }) ?? (bytes <= (maximum ?? 0)) else { throw LocalMobileClipFailure.invalidModel }
    let input = try FileHandle(forReadingFrom: url)
    defer { try? input.close() }
    var hasher = SHA256()
    var count = 0
    var data = Data()
    while let chunk = try input.read(upToCount: 65_536), !chunk.isEmpty {
      count += chunk.count
      guard count <= bytes else { throw LocalMobileClipFailure.invalidModel }
      hasher.update(data: chunk)
      if retain { data.append(chunk) }
    }
    let actual = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    guard count == bytes, actual == digest else { throw LocalMobileClipFailure.invalidModel }
    return data
  }

  private func imageBuffer(_ image: CGImage, orientation: CGImagePropertyOrientation, assets: Cache, fullFrame: Bool) throws -> CVPixelBuffer {
    var ciImage = CIImage(cgImage: image).oriented(orientation)
    let extent = ciImage.extent
    if fullFrame {
      let scale = 256 / max(extent.width, extent.height)
      ciImage = ciImage.transformed(by: CGAffineTransform(translationX: -extent.minX, y: -extent.minY))
        .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        .transformed(by: CGAffineTransform(translationX: (256 - extent.width * scale) / 2,
                                           y: (256 - extent.height * scale) / 2))
      guard let gray = CGColor(colorSpace: assets.colour, components: [127.0 / 255, 127.0 / 255, 127.0 / 255, 1]) else {
        throw LocalMobileClipFailure.processingFailed
      }
      let canvas = CGRect(x: 0, y: 0, width: 256, height: 256)
      ciImage = ciImage.composited(over: CIImage(color: CIColor(cgColor: gray)).cropped(to: canvas)).cropped(to: canvas)
    } else {
      let side = min(extent.width, extent.height)
      let x = round((extent.width - side) / 2) + extent.origin.x
      let y = round((extent.height - side) / 2) + extent.origin.y
      ciImage = ciImage.cropped(to: CGRect(x: x, y: y, width: side, height: side))
        .transformed(by: CGAffineTransform(translationX: -x, y: -y))
        .transformed(by: CGAffineTransform(scaleX: 256 / side, y: 256 / side))
    }
    var buffer: CVPixelBuffer?
    guard CVPixelBufferCreate(nil, 256, 256, assets.pixelFormat, nil, &buffer) == kCVReturnSuccess,
          let buffer else { throw LocalMobileClipFailure.processingFailed }
    assets.context.render(ciImage, to: buffer, bounds: CGRect(x: 0, y: 0, width: 256, height: 256), colorSpace: assets.colour)
    return buffer
  }
}
