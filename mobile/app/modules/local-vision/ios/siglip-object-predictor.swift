import Foundation
import CryptoKit

final class SiglipRequestCancellation: @unchecked Sendable {
  private let lock = NSLock()
  private var cancelled = false
  func cancel() { lock.lock(); cancelled = true; lock.unlock() }
  func check(deadlineAt: TimeInterval) throws {
    lock.lock(); let stopped = cancelled; lock.unlock()
    if stopped { throw LocalVisionFailure.cancelled }
    if ProcessInfo.processInfo.systemUptime >= deadlineAt { throw LocalVisionFailure.timeout }
  }
}

private final class SiglipResourceMarker: NSObject {}
private struct SiglipTextPrototypes: Decodable {
  let classes: [String]
  let vectors: [[Double]]
}

#if LOCAL_VISION_QA
private final class SiglipQAResourceStore: @unchecked Sendable {
  private let lock = NSLock()
  private var url: URL?
  func get() -> URL? { lock.lock(); defer { lock.unlock() }; return url }
  func set(_ value: URL?) { lock.lock(); url = value; lock.unlock() }
}
#endif

// Called only inside the shared engine's serial worker/autoreleasepool.
// No persistent MLModel cache: the large FP32 working set is released per request.
@available(iOS 18.0, macOS 15.0, *)
enum SiglipObjectPredictor {
  static let modelId = "google-siglip2-base224-block32-v1"
  static let revision = "75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2"
  static let prototypesSha256 = "eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21"
  static let classes = ["cup", "spoon", "fork", "knife", "bottle", "jar", "can", "carton", "bag", "battery", "phone", "textile", "multiple-cups", "spoon-and-fork", "other"]
  static let files = [
    "analytics/coremldata.bin": "aa98a087807dfda648a15a71b6d2ac5b3cb35aad2cd0526076a3ca5816fc05e7",
    "coremldata.bin": "26e1ec7ffa5a134e4dd3aa850d1fde5cc441a6cec11771ff4ef80f0bfdecb772",
    "metadata.json": "f913c80e9eeaef50df9bfbe5cbe3001fd574a9aac6b9a47a315b46a92790c507",
    "model.mil": "f3a1c82f41683e05bb4117e65b25e2fd2ec618d7110449571d61469d92c51f92",
    "weights/weight.bin": "e0490bf502e85c813dd3f640bdfcd1419f3915a5daf882da869a8bfca4525ff5",
  ]

  private static func resources() throws -> URL {
    #if LOCAL_VISION_QA
    if let override = qaResourceURL { return override }
    #endif
    let owner = Bundle(for: SiglipResourceMarker.self)
    guard let url = owner.url(forResource: "KierratysSiglipCandidates", withExtension: "bundle")
      ?? Bundle.main.url(forResource: "KierratysSiglipCandidates", withExtension: "bundle") else {
      throw LocalVisionFailure.unavailable
    }
    return url
  }

  #if LOCAL_VISION_QA
  // Configured only before test dispatch; absent from application build.
  private static let qaResources = SiglipQAResourceStore()
  static var qaResourceURL: URL? {
    get { qaResources.get() }
    set { qaResources.set(newValue) }
  }
  #endif

  private static func checkedBytes(_ url: URL, sha: String, maximum: Int) throws -> Data {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard attributes[.type] as? FileAttributeType == .typeRegular,
          let size = attributes[.size] as? NSNumber, size.intValue > 0, size.intValue <= maximum else {
      throw LocalVisionFailure.unavailable
    }
    let bytes = try Data(contentsOf: url, options: .mappedIfSafe)
    guard SHA256.hash(data: bytes).map({ String(format: "%02x", $0) }).joined() == sha else {
      throw LocalVisionFailure.unavailable
    }
    return bytes
  }

  static func predict(bytes: Data, cancellation: SiglipRequestCancellation, deadlineAt: TimeInterval) throws -> String {
    try cancellation.check(deadlineAt: deadlineAt)
    let root = try resources(), modelURL = root.appendingPathComponent("vision-int8-block32.mlmodelc", isDirectory: true)
    for (name, sha) in files {
      _ = try checkedBytes(modelURL.appendingPathComponent(name), sha: sha, maximum: 150 * 1024 * 1024)
      try cancellation.check(deadlineAt: deadlineAt)
    }
    let data = try checkedBytes(root.appendingPathComponent("prototypes.json"), sha: prototypesSha256, maximum: 500_000)
    let prototypes = try JSONDecoder().decode(SiglipTextPrototypes.self, from: data)
    guard prototypes.classes == classes, prototypes.vectors.count == classes.count,
      prototypes.vectors.allSatisfy({ vector in vector.count == 768 && vector.allSatisfy(\.isFinite)
        && abs(sqrt(vector.reduce(0) { $0 + $1 * $1 }) - 1) < 0.00001 }) else { throw LocalVisionFailure.unavailable }
    try cancellation.check(deadlineAt: deadlineAt)
    let tensor = try SiglipImageEncoder.preprocess(imageData: bytes)
    try cancellation.check(deadlineAt: deadlineAt)
    let encoder = try SiglipImageEncoder(compiledModelURL: modelURL)
    try cancellation.check(deadlineAt: deadlineAt)
    let vector = try encoder.encode(tensor: tensor)
    try cancellation.check(deadlineAt: deadlineAt)
    let scores = zip(classes, prototypes.vectors).map { kind, prototype -> [String: Any] in
      let similarity = zip(vector, prototype).reduce(0) { $0 + $1.0 * $1.1 }
      return ["kind": kind, "similarity": min(1, max(-1, similarity))]
    }
    let value: [String: Any] = ["schemaVersion": "siglip-object-candidates-v1", "modelId": modelId,
      "modelRevision": revision, "preprocessing": SiglipImageEncoder.preprocessingIdentity,
      "verification": "unverified", "confidence": "uncalibrated", "scope": "object_form_only",
      "checkedOn": "2026-11-16", "observedAt": ISO8601DateFormatter().string(from: Date()), "scores": scores]
    let json = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard json.count <= 8192, let result = String(data: json, encoding: .utf8) else { throw LocalVisionFailure.failed }
    return result
  }
}
