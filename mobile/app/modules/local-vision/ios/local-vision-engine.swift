import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import CoreImage
import CryptoKit
@preconcurrency import Vision

enum LocalVisionFailure: String, Error, Sendable {
  case busy
  case invalidImage = "invalid_image"
  case unavailable
  case failed
  case timeout
  case cancelled
}

struct LocalVisionClassification: Encodable, Sendable {
  let identifier: String
  let score: Double
  let hasPrecisionRecallCurve: Bool
  let passesOperatingPoint: Bool
}

enum LocalVisionSupplementSkipReason: String, Encodable, Sendable {
  case primaryMatch = "primary_match"
  case primaryConflict = "primary_conflict"
}

enum LocalVisionSupplementFailureReason: String, Encodable, Sendable {
  case modelUnavailable = "model_unavailable"
  case processingFailed = "processing_failed"
}

enum LocalVisionSupplement: Encodable, Sendable {
  case skipped(LocalVisionSupplementSkipReason)
  case unavailable(LocalVisionSupplementFailureReason)
  case observed([LocalMobileClipScore])

  private enum CodingKeys: String, CodingKey {
    case status, reason, modelId, modelRevision, imageWeightSha256
    case prototypesSha256, promptsSha256, promptPolicy, preprocessing, computeUnits, scores
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .skipped(let reason):
      try values.encode("skipped", forKey: .status)
      try values.encode(reason, forKey: .reason)
    case .unavailable(let reason):
      try values.encode("unavailable", forKey: .status)
      try values.encode(reason, forKey: .reason)
    case .observed(let scores):
      try values.encode("observed", forKey: .status)
      try values.encode(LocalMobileClipPredictor.modelId, forKey: .modelId)
      try values.encode(LocalMobileClipPredictor.modelRevision, forKey: .modelRevision)
      try values.encode(LocalMobileClipPredictor.imageWeightSha256, forKey: .imageWeightSha256)
      try values.encode(LocalMobileClipPredictor.prototypesSha256, forKey: .prototypesSha256)
      try values.encode(LocalMobileClipPredictor.promptsSha256, forKey: .promptsSha256)
      try values.encode(LocalMobileClipPredictor.promptPolicy, forKey: .promptPolicy)
      try values.encode(LocalMobileClipPredictor.preprocessing, forKey: .preprocessing)
      try values.encode(LocalMobileClipPredictor.computeUnitsName, forKey: .computeUnits)
      try values.encode(scores, forKey: .scores)
    }
  }
}

struct LocalVisionResult: Encodable, Sendable {
  let schemaVersion = "local-vision-v4"
  let engine = "apple-vision"
  let classificationPolicy = "apple-class-operating-point-v1"
  let minimumPrecision = 0.9
  let minimumRecall = 0.01
  let classificationRevision: Int
  let ocrRevision = 3
  let ocrPolicy = "material-code-lexicon-v1"
  let ocrLanguages: [String]
  let osVersion: String
  let observedAt: String
  let classifications: [LocalVisionClassification]
  let textLines: [String]
  let supplement: LocalVisionSupplement
  let durationMs: Int

  func bridgeValue() throws -> [String: Any] {
    let data = try JSONEncoder().encode(self)
    guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw LocalVisionFailure.failed
    }
    return value
  }
}

enum LocalVisionReadinessPartialReason: String, Encodable, Sendable {
  case unsupportedModelPlatform = "unsupported_model_platform"
  case modelUnavailable = "model_unavailable"
}

enum LocalVisionReadinessFailureReason: String, Encodable, Sendable {
  case primaryUnavailable = "primary_unavailable"
  case busy, timeout
  case processingFailed = "processing_failed"
}

/// A no-image capability snapshot. This must never be described as an accuracy test.
enum LocalVisionReadiness: Encodable, Sendable {
  case full
  case primaryOnly(LocalVisionReadinessPartialReason)
  case unavailable(LocalVisionReadinessFailureReason)

  private enum CodingKeys: String, CodingKey {
    case schemaVersion, status, reason, evidence, modelId, modelRevision
    case imageWeightSha256, prototypesSha256, promptsSha256, promptPolicy, preprocessing, computeUnits
  }

  func encode(to encoder: Encoder) throws {
    var values = encoder.container(keyedBy: CodingKeys.self)
    try values.encode("local-vision-readiness-v1", forKey: .schemaVersion)
    switch self {
    case .full:
      try values.encode("full", forKey: .status)
      try values.encode("integrity_and_interface_only", forKey: .evidence)
      try values.encode(LocalMobileClipPredictor.modelId, forKey: .modelId)
      try values.encode(LocalMobileClipPredictor.modelRevision, forKey: .modelRevision)
      try values.encode(LocalMobileClipPredictor.imageWeightSha256, forKey: .imageWeightSha256)
      try values.encode(LocalMobileClipPredictor.prototypesSha256, forKey: .prototypesSha256)
      try values.encode(LocalMobileClipPredictor.promptsSha256, forKey: .promptsSha256)
      try values.encode(LocalMobileClipPredictor.promptPolicy, forKey: .promptPolicy)
      try values.encode(LocalMobileClipPredictor.preprocessing, forKey: .preprocessing)
      try values.encode(LocalMobileClipPredictor.computeUnitsName, forKey: .computeUnits)
    case .primaryOnly(let reason):
      try values.encode("primary_only", forKey: .status)
      try values.encode(reason, forKey: .reason)
      try values.encode("integrity_and_interface_only", forKey: .evidence)
    case .unavailable(let reason):
      try values.encode("unavailable", forKey: .status)
      try values.encode(reason, forKey: .reason)
    }
  }

  func bridgeValue() throws -> [String: Any] {
    let data = try JSONEncoder().encode(self)
    guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw LocalVisionFailure.failed
    }
    return value
  }
}

/// Timeout resolves the caller once, but cannot release a still-running model load.
private final class LocalVisionReadinessDelivery: @unchecked Sendable {
  private let lock = NSLock()
  private var completion: (@Sendable (LocalVisionReadiness) -> Void)?

  init(_ completion: @escaping @Sendable (LocalVisionReadiness) -> Void) {
    self.completion = completion
  }

  func resolve(_ result: LocalVisionReadiness) {
    lock.lock()
    let callback = completion
    completion = nil
    lock.unlock()
    callback?(result)
  }
}

/// The outer recognition watchdog may deliver timeout before synchronous work
/// returns. It must never deliver a second result or release that work's gate.
private final class LocalVisionRecognitionDelivery: @unchecked Sendable {
  private let lock = NSLock()
  private var completion: (@Sendable (Result<LocalVisionResult, LocalVisionFailure>) -> Void)?

  init(_ completion: @escaping @Sendable (Result<LocalVisionResult, LocalVisionFailure>) -> Void) {
    self.completion = completion
  }

  func resolve(_ result: Result<LocalVisionResult, LocalVisionFailure>) {
    lock.lock()
    let callback = completion
    completion = nil
    lock.unlock()
    callback?(result)
  }
}

enum LocalReferencePortOperation: Sendable {
  case capabilities, hashBytes, encode, decodeRgb, productEvidence
}

private struct CancellableProductRequests: @unchecked Sendable {
  let requests: [VNRequest]
  func cancel() { for request in requests { request.cancel() } }
}

private final class LocalReferencePortDelivery: @unchecked Sendable {
  private let lock = NSLock()
  private var completion: (@Sendable (Result<String, LocalVisionFailure>) -> Void)?
  init(_ completion: @escaping @Sendable (Result<String, LocalVisionFailure>) -> Void) { self.completion = completion }
  func resolve(_ result: Result<String, LocalVisionFailure>) {
    lock.lock()
    let callback = completion
    completion = nil
    lock.unlock()
    callback?(result)
  }
}

#if LOCAL_VISION_QA
private final class LocalVisionRecognitionQARecorder: @unchecked Sendable {
  private let lock = NSLock()
  private var results: [Result<LocalVisionResult, LocalVisionFailure>] = []
  let signal = DispatchSemaphore(value: 0)

  func record(_ result: Result<LocalVisionResult, LocalVisionFailure>) {
    lock.lock()
    results.append(result)
    lock.unlock()
    signal.signal()
  }

  func snapshot() -> [Result<LocalVisionResult, LocalVisionFailure>] {
    lock.lock()
    defer { lock.unlock() }
    return results
  }
}

private final class LocalVisionReadinessQARecorder: @unchecked Sendable {
  private let lock = NSLock()
  private var results: [LocalVisionReadiness] = []
  let signal = DispatchSemaphore(value: 0)

  func record(_ result: LocalVisionReadiness) {
    lock.lock()
    results.append(result)
    lock.unlock()
    signal.signal()
  }

  func snapshot() -> [LocalVisionReadiness] {
    lock.lock()
    defer { lock.unlock() }
    return results
  }
}
#endif

// The Vision request-cancellation timer performs only VNRequest.cancel().
// Request setup, perform and result reads remain on the serial worker; the
// separate outer watchdog delivers a typed timeout without touching requests.
private struct CancellableVisionRequests: @unchecked Sendable {
  let classifier: VNClassifyImageRequest
  let text: VNRecognizeTextRequest

  func cancel() {
    classifier.cancel()
    text.cancel()
  }
}

/// No networking, URLs, file writes, image history or model download.
/// Mutable state is protected by stateLock; inference runs off the JS/main thread.
final class LocalVisionEngine: @unchecked Sendable {
  static let shared = LocalVisionEngine()
  static let maxBytes = 1_500_000
  static let maxBase64Length = 2_000_000
  static let deadlineSeconds: TimeInterval = 12
  static let classificationIdentifiers = [
    "bottle", "wine_bottle", "jar", "carton", "cardboard_box", "paper_bag", "cup",
  ]
  // The finite material-code lexicon is not a brand/product dictionary. Outputs
  // remain untrusted OCR candidates and require independent user confirmation.
  static let materialCodeAbbreviations = [
    "PET", "HDPE", "PVC", "LDPE", "PP", "PS", "PAP", "FE", "ALU", "FOR", "COT", "TEX", "GL",
  ]

  private let stateLock = NSLock()
  private var inFlight = false
  private var activeObjectRequest: (id: String, cancellation: SiglipRequestCancellation)?
  private var preCancelledObjectRequests: [String: TimeInterval] = [:]
  private var supplementalPredictor = LocalMobileClipPredictor.shared
  private let worker = DispatchQueue(label: "fi.roopeaaltonen.kierratysappi.local-vision", qos: .userInitiated)

  private init() {}

  #if LOCAL_VISION_QA
  // CLI-only model-resource configuration; this API does not exist in the app build.
  func configureQAResources(_ url: URL) throws {
    stateLock.lock()
    defer { stateLock.unlock() }
    guard !inFlight else { throw LocalVisionFailure.busy }
    supplementalPredictor = LocalMobileClipPredictor(resourcesURL: url)
  }

  /// Tests the real worker/gate/deadline with a controlled no-image/no-model job.
  /// This hook and its alternate duration do not exist in shipping builds.
  static func readinessLifecycleSelfTest() -> [String]? {
    let engine = LocalVisionEngine()
    let entered = DispatchSemaphore(value: 0)
    let release = DispatchSemaphore(value: 0)
    defer { release.signal() }
    let slow = LocalVisionReadinessQARecorder()
    engine.enqueueReadiness(deadlineSeconds: 0.03, inspection: { _ in
      entered.signal()
      release.wait()
      return .full
    }, completion: slow.record)
    guard entered.wait(timeout: .now() + 2) == .success else { return nil }

    let busy = LocalVisionReadinessQARecorder()
    engine.inspectReadiness(completion: busy.record)
    guard case .unavailable(.busy)? = busy.snapshot().first else { return nil }
    let imageBusy = LocalVisionReadinessQARecorder()
    engine.recognize(jpegBase64: "YWJjZA==") { outcome in
      if case .failure(.busy) = outcome { imageBusy.record(.unavailable(.busy)) }
      else { imageBusy.record(.unavailable(.processingFailed)) }
    }
    guard case .unavailable(.busy)? = imageBusy.snapshot().first else { return nil }
    guard slow.signal.wait(timeout: .now() + 2) == .success,
          case .unavailable(.timeout)? = slow.snapshot().first else { return nil }

    let afterTimeout = LocalVisionReadinessQARecorder()
    engine.inspectReadiness(completion: afterTimeout.record)
    guard case .unavailable(.busy)? = afterTimeout.snapshot().first else { return nil }
    do {
      try engine.configureQAResources(URL(fileURLWithPath: "/unused-qa-only"))
      return nil
    } catch LocalVisionFailure.busy {} catch { return nil }
    release.signal()
    // Barrier waits for the original synchronous job, not merely its UI timeout.
    engine.worker.sync {}
    guard slow.snapshot().count == 1,
          case .unavailable(.timeout)? = slow.snapshot().first else { return nil }

    let retry = LocalVisionReadinessQARecorder()
    engine.enqueueReadiness(deadlineSeconds: 1, inspection: { _ in
      .primaryOnly(.modelUnavailable)
    }, completion: retry.record)
    guard retry.signal.wait(timeout: .now() + 2) == .success,
          case .primaryOnly(.modelUnavailable)? = retry.snapshot().first else { return nil }

    let once = LocalVisionReadinessQARecorder()
    let delivery = LocalVisionReadinessDelivery(once.record)
    delivery.resolve(.full)
    delivery.resolve(.unavailable(.timeout))
    guard once.snapshot().count == 1, case .full? = once.snapshot().first else { return nil }
    return [
      "pending_readiness_busy", "recognition_busy_before_deadline", "bounded_timeout",
      "gate_retained_after_timeout", "configuration_busy_after_timeout", "late_result_suppressed_once",
      "gate_released_after_actual_settle", "completion_delivered_once",
    ]
  }

  /// Exercises the real recognition worker/gate and watchdog without decoding
  /// an image or running Vision/Core ML. The blocked operation represents any
  /// synchronous stage, including decode, that cannot settle on the deadline.
  static func recognitionLifecycleSelfTest() -> [String]? {
    let engine = LocalVisionEngine()
    let entered = DispatchSemaphore(value: 0)
    let release = DispatchSemaphore(value: 0)
    defer { release.signal() }
    let slow = LocalVisionRecognitionQARecorder()
    engine.enqueueRecognition(deadlineSeconds: 0.03, operation: { _ in
      entered.signal()
      release.wait()
      return .success(qaRecognitionObservation())
    }, completion: slow.record)
    guard entered.wait(timeout: .now() + 2) == .success else { return nil }

    let busy = LocalVisionRecognitionQARecorder()
    engine.recognize(jpegBase64: "YWJjZA==", completion: busy.record)
    guard case .failure(.busy)? = busy.snapshot().first else { return nil }
    let readinessBusy = LocalVisionReadinessQARecorder()
    engine.inspectReadiness(completion: readinessBusy.record)
    guard case .unavailable(.busy)? = readinessBusy.snapshot().first else { return nil }
    guard slow.signal.wait(timeout: .now() + 2) == .success,
          case .failure(.timeout)? = slow.snapshot().first else { return nil }

    let afterTimeout = LocalVisionRecognitionQARecorder()
    engine.recognize(jpegBase64: "YWJjZA==", completion: afterTimeout.record)
    guard case .failure(.busy)? = afterTimeout.snapshot().first else { return nil }
    do {
      try engine.configureQAResources(URL(fileURLWithPath: "/unused-qa-only"))
      return nil
    } catch LocalVisionFailure.busy {} catch { return nil }
    release.signal()
    engine.worker.sync {}
    guard slow.snapshot().count == 1,
          case .failure(.timeout)? = slow.snapshot().first else { return nil }

    let retry = LocalVisionRecognitionQARecorder()
    engine.enqueueRecognition(deadlineSeconds: 1, operation: { _ in
      .failure(.invalidImage)
    }, completion: retry.record)
    guard retry.signal.wait(timeout: .now() + 2) == .success,
          case .failure(.invalidImage)? = retry.snapshot().first else { return nil }
    engine.worker.sync {}

    let once = LocalVisionRecognitionQARecorder()
    let delivery = LocalVisionRecognitionDelivery(once.record)
    delivery.resolve(.success(qaRecognitionObservation()))
    delivery.resolve(.failure(.timeout))
    guard once.snapshot().count == 1, case .success? = once.snapshot().first else { return nil }
    guard "ERR_LOCAL_VISION_\(LocalVisionFailure.timeout.rawValue.uppercased())" == "ERR_LOCAL_VISION_TIMEOUT" else { return nil }
    return [
      "recognition_pending_busy", "readiness_busy_during_recognition", "bounded_outer_timeout",
      "recognition_gate_retained_after_timeout", "configuration_busy_after_recognition_timeout",
      "late_success_suppressed_once", "recognition_retry_after_actual_settlement",
      "early_completion_delivered_once", "typed_timeout_bridge_code",
    ]
  }

  private static func qaRecognitionObservation() -> LocalVisionResult {
    // A synthetic delivery fixture only; it is never a model result or app data.
    LocalVisionResult(classificationRevision: 2, ocrLanguages: ["en-US"], osVersion: "0.0.0",
      observedAt: "1970-01-01T00:00:00.000Z",
      classifications: classificationIdentifiers.map {
        LocalVisionClassification(identifier: $0, score: 0, hasPrecisionRecallCurve: false, passesOperatingPoint: false)
      }, textLines: [], supplement: .unavailable(.modelUnavailable), durationMs: 0)
  }

  static func referencePortLifecycleSelfTest() -> [String]? {
    let engine = LocalVisionEngine()
    let entered = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
    defer { release.signal() }
    let slow = LocalVisionRecognitionQARecorder()
    let record: @Sendable (Result<String, LocalVisionFailure>) -> Void = { result in
      slow.record(result.map { _ in qaRecognitionObservation() })
    }
    engine.enqueueReferencePort(deadlineSeconds: 0.03, operation: { _ in
      entered.signal(); release.wait(); return "late"
    }, completion: record)
    guard entered.wait(timeout: .now() + 2) == .success else { return nil }
    let busy = LocalVisionRecognitionQARecorder()
    engine.recognize(jpegBase64: "YWJjZA==", completion: busy.record)
    guard case .failure(.busy)? = busy.snapshot().first else { return nil }
    let readiness = LocalVisionReadinessQARecorder()
    engine.inspectReadiness(completion: readiness.record)
    guard case .unavailable(.busy)? = readiness.snapshot().first else { return nil }
    guard slow.signal.wait(timeout: .now() + 2) == .success,
          case .failure(.timeout)? = slow.snapshot().first else { return nil }
    let after = LocalVisionRecognitionQARecorder()
    engine.referencePort(.hashBytes, input: "AA==") { after.record($0.map { _ in qaRecognitionObservation() }) }
    guard case .failure(.busy)? = after.snapshot().first else { return nil }
    release.signal(); engine.worker.sync {}
    guard slow.snapshot().count == 1 else { return nil }
    let retry = LocalVisionRecognitionQARecorder()
    engine.referencePort(.hashBytes, input: "AA==") { retry.record($0.map { _ in qaRecognitionObservation() }) }
    guard retry.signal.wait(timeout: .now() + 2) == .success,
          case .success? = retry.snapshot().first else { return nil }
    return ["reference_blocks_recognition", "reference_blocks_readiness", "reference_timeout",
            "reference_gate_retained_until_settlement", "reference_late_result_suppressed", "reference_retry"]
  }

  static func objectCandidateLifecycleSelfTest() -> [String]? {
    let engine = LocalVisionEngine(), token = SiglipRequestCancellation()
    let id = UUID().uuidString, entered = DispatchSemaphore(value: 0), release = DispatchSemaphore(value: 0)
    defer { release.signal() }
    let recorder = LocalVisionRecognitionQARecorder()
    engine.enqueueReferencePort(deadlineSeconds: 0.04, objectRequest: (id, token), operation: { _ in
      entered.signal(); release.wait()
      try token.check(deadlineAt: ProcessInfo.processInfo.systemUptime + 10)
      return "late"
    }, completion: { recorder.record($0.map { _ in qaRecognitionObservation() }) })
    guard entered.wait(timeout: .now() + 2) == .success else { return nil }
    engine.cancelObjectCandidates(requestID: UUID().uuidString)
    do { try token.check(deadlineAt: ProcessInfo.processInfo.systemUptime + 10) } catch { return nil }
    engine.cancelObjectCandidates(requestID: id)
    do { try token.check(deadlineAt: ProcessInfo.processInfo.systemUptime + 10); return nil }
    catch LocalVisionFailure.cancelled {} catch { return nil }
    guard recorder.signal.wait(timeout: .now() + 2) == .success,
      case .failure(.timeout)? = recorder.snapshot().first else { return nil }
    let busy = LocalVisionRecognitionQARecorder()
    engine.referencePort(.hashBytes, input: "AA==") { busy.record($0.map { _ in qaRecognitionObservation() }) }
    guard case .failure(.busy)? = busy.snapshot().first else { return nil }
    release.signal(); engine.worker.sync {}
    guard recorder.snapshot().count == 1, engine.activeObjectRequest == nil else { return nil }
    let retry = LocalVisionRecognitionQARecorder()
    engine.referencePort(.hashBytes, input: "AA==") { retry.record($0.map { _ in qaRecognitionObservation() }) }
    guard retry.signal.wait(timeout: .now() + 2) == .success, case .success? = retry.snapshot().first else { return nil }
    let preID = UUID().uuidString, pre = LocalVisionRecognitionQARecorder()
    engine.cancelObjectCandidates(requestID: preID)
    engine.recognizeObjectCandidates(input: "AA==", requestID: preID, timeoutMs: 1000) {
      pre.record($0.map { _ in qaRecognitionObservation() })
    }
    guard pre.signal.wait(timeout: .now() + 2) == .success, case .failure(.cancelled)? = pre.snapshot().first else { return nil }
    return ["object_wrong_id_cannot_cancel", "object_matching_id_cancels", "object_timeout", "object_pre_dispatch_cancel",
      "object_gate_retained_until_settlement", "object_late_result_suppressed", "object_context_released", "object_retry"]
  }

  /// Actual generated JPEGs and ImageIO orientation, no model/photo/network.
  static func referenceRgbSelfTest() throws -> Int {
    let width = 64, height = 48
    let colours: [[UInt8]] = [[220, 30, 30], [30, 200, 30], [30, 30, 220], [220, 200, 30]]
    var rgb = [UInt8](repeating: 0, count: width * height * 3)
    for y in 0..<height { for x in 0..<width {
      let colour = colours[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)]
      for c in 0..<3 { rgb[(y * width + x) * 3 + c] = colour[c] }
    } }
    guard let colour = CGColorSpace(name: CGColorSpace.sRGB),
          let provider = CGDataProvider(data: Data(rgb) as CFData),
          let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 24,
            bytesPerRow: width * 3, space: colour, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
            provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else { throw LocalVisionFailure.failed }
    let expected = [[0, 1, 2, 3], [1, 0, 3, 2], [3, 2, 1, 0], [2, 3, 0, 1],
                    [0, 2, 1, 3], [2, 0, 3, 1], [3, 1, 2, 0], [1, 3, 0, 2]]
    for orientation in 1...8 {
      let jpeg = NSMutableData()
      guard let destination = CGImageDestinationCreateWithData(jpeg, UTType.jpeg.identifier as CFString, 1, nil) else { throw LocalVisionFailure.failed }
      CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.95,
        kCGImagePropertyOrientation: orientation] as CFDictionary)
      guard CGImageDestinationFinalize(destination) else { throw LocalVisionFailure.failed }
      let data = jpeg as Data
      let raw = try performReferencePort(.decodeRgb, input: data.base64EncodedString(), predictor: .shared,
        deadlineAt: ProcessInfo.processInfo.systemUptime + deadlineSeconds)
      guard let result = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any],
            let w = result["width"] as? Int, let h = result["height"] as? Int,
            w == (orientation < 5 ? width : height), h == (orientation < 5 ? height : width),
            let base64 = result["rgbBase64"] as? String, let bytes = Data(base64Encoded: base64),
            bytes.count == w * h * 3,
            result["imageSha256"] as? String == SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined()
            else { throw LocalVisionFailure.failed }
      for (corner, point) in [(8, 8), (w - 9, 8), (8, h - 9), (w - 9, h - 9)].enumerated() {
        for channel in 0..<3 {
          let actual = Int(bytes[(point.1 * w + point.0) * 3 + channel])
          guard abs(actual - Int(colours[expected[orientation - 1][corner]][channel])) <= 8 else { throw LocalVisionFailure.failed }
        }
      }
    }
    return 8
  }
  #endif

  /// Experimental, unconsumed by the default UI. Every operation shares the
  /// existing native gate/cache/worker, including hashing and RGB extraction.
  /// No JS paths, URLs, source labels, model downloads or persistence accepted.
  func referencePort(_ kind: LocalReferencePortOperation, input: String = "",
                     completion: @escaping @Sendable (Result<String, LocalVisionFailure>) -> Void) {
    guard input.utf8.count <= Self.maxBase64Length else { completion(.failure(.invalidImage)); return }
    let deadlineAt = ProcessInfo.processInfo.systemUptime + Self.deadlineSeconds
    enqueueReferencePort(deadlineSeconds: Self.deadlineSeconds, operation: { predictor in
      try Self.performReferencePort(kind, input: input, predictor: predictor, deadlineAt: deadlineAt)
    }, completion: completion)
  }

  private func enqueueReferencePort(deadlineSeconds: TimeInterval,
    objectRequest: (id: String, cancellation: SiglipRequestCancellation)? = nil,
    operation: @escaping @Sendable (LocalMobileClipPredictor) throws -> String,
    completion: @escaping @Sendable (Result<String, LocalVisionFailure>) -> Void) {
    let started = ProcessInfo.processInfo.systemUptime
    stateLock.lock()
    guard !inFlight else { stateLock.unlock(); completion(.failure(.busy)); return }
    inFlight = true
    activeObjectRequest = objectRequest
    if let objectRequest, preCancelledObjectRequests.removeValue(forKey: objectRequest.id) != nil {
      objectRequest.cancellation.cancel()
    }
    let predictor = supplementalPredictor
    stateLock.unlock()
    let delivery = LocalReferencePortDelivery(completion)
    let deadline = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
    deadline.schedule(deadline: .now() + deadlineSeconds)
    deadline.setEventHandler { objectRequest?.cancellation.cancel(); delivery.resolve(.failure(.timeout)) }
    deadline.resume()
    worker.async { [self] in
      let outcome: Result<String, LocalVisionFailure> = autoreleasepool {
        guard ProcessInfo.processInfo.systemUptime - started < deadlineSeconds else { return .failure(.timeout) }
        do { return .success(try operation(predictor)) }
        catch let failure as LocalVisionFailure { return .failure(failure) }
        catch LocalMobileClipFailure.unsupportedPlatform { return .failure(.unavailable) }
        catch { return .failure(.failed) }
      }
      let onTime = ProcessInfo.processInfo.systemUptime - started < deadlineSeconds
      deadline.setEventHandler {}; deadline.cancel()
      // Never unlock on UI/JS timeout: Core ML and decode are synchronous.
      stateLock.lock(); inFlight = false; activeObjectRequest = nil; stateLock.unlock()
      delivery.resolve(onTime ? outcome : .failure(.timeout))
    }
  }

  /// Optional candidate path, same serial gate/watchdog as barcode/OCR/material.
  /// Cancellation cannot kill a synchronous CoreML call; gate remains held until
  /// real settlement and checks suppress subsequent stages and late delivery.
  func recognizeObjectCandidates(input: String, requestID: String, timeoutMs: Int,
    completion: @escaping @Sendable (Result<String, LocalVisionFailure>) -> Void) {
    guard input.utf8.count <= Self.maxBase64Length, UUID(uuidString: requestID) != nil,
      (1...12000).contains(timeoutMs) else { completion(.failure(.invalidImage)); return }
    let cancellation = SiglipRequestCancellation()
    let seconds = Double(timeoutMs) / 1000
    let deadlineAt = ProcessInfo.processInfo.systemUptime + seconds
    enqueueReferencePort(deadlineSeconds: seconds, objectRequest: (requestID, cancellation), operation: { predictor in
      try cancellation.check(deadlineAt: deadlineAt)
      guard let bytes = Data(base64Encoded: input), !bytes.isEmpty, bytes.count <= Self.maxBytes,
        bytes.base64EncodedString() == input else { throw LocalVisionFailure.invalidImage }
      try cancellation.check(deadlineAt: deadlineAt)
      guard #available(iOS 18.0, macOS 15.0, *) else { throw LocalVisionFailure.unavailable }
      predictor.releaseCachedModel()
      return try SiglipObjectPredictor.predict(bytes: bytes, cancellation: cancellation, deadlineAt: deadlineAt)
    }, completion: completion)
  }

  func cancelObjectCandidates(requestID: String) {
    guard UUID(uuidString: requestID) != nil else { return }
    stateLock.lock()
    if activeObjectRequest?.id == requestID { activeObjectRequest?.cancellation.cancel() }
    else {
      // Cancel may arrive before Expo dispatches its async recognize call.
      // Bounded, short-lived tombstones contain no image or identifying data.
      let now = ProcessInfo.processInfo.systemUptime
      preCancelledObjectRequests = preCancelledObjectRequests.filter { now - $0.value < 60 }
      preCancelledObjectRequests[requestID] = now
      if preCancelledObjectRequests.count > 32,
        let oldest = preCancelledObjectRequests.min(by: { $0.value < $1.value })?.key {
        preCancelledObjectRequests.removeValue(forKey: oldest)
      }
    }
    stateLock.unlock()
  }

  private static func performReferencePort(_ kind: LocalReferencePortOperation, input: String,
    predictor: LocalMobileClipPredictor, deadlineAt: TimeInterval) throws -> String {
    func check() throws {
      guard ProcessInfo.processInfo.systemUptime < deadlineAt else { throw LocalVisionFailure.timeout }
    }
    func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    func json(_ value: [String: Any]) throws -> String {
      let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])
      guard data.count <= 4_200_000, let text = String(data: data, encoding: .utf8) else { throw LocalVisionFailure.failed }
      return text
    }
    try check()
    if kind == .capabilities {
      guard input.isEmpty else { throw LocalVisionFailure.invalidImage }
      try predictor.inspectReadiness(); try check()
      return try json(["schemaVersion": "native-reference-capabilities-v1", "evidence": "integrity_and_interface_only",
        "encoderSha256": LocalMobileClipPredictor.referenceEncoderSha256,
        "preprocessingSha256": LocalMobileClipPredictor.referencePreprocessingSha256,
        "decoderPolicy": "imageio-oriented-fit-1024-srgb-rgb-v1", "integrationAllowed": false])
    }
    guard !input.isEmpty, let bytes = Data(base64Encoded: input), bytes.count <= maxBytes,
          bytes.base64EncodedString() == input else { throw LocalVisionFailure.invalidImage }
    let imageHash = digest(bytes)
    try check()
    if kind == .hashBytes { return imageHash }
    let decoded = try decodeJPEG(jpegBase64: input)
    try check()
    if kind == .productEvidence {
      return try productEvidence(image: decoded.pixels, orientation: decoded.orientation,
        imageHash: imageHash, predictor: predictor, deadlineAt: deadlineAt)
    }
    if kind == .encode {
      let vector = try predictor.referenceEmbedding(image: decoded.pixels, orientation: decoded.orientation, deadlineAt: deadlineAt)
      try check()
      return try json(["imageSha256": imageHash, "encoderSha256": LocalMobileClipPredictor.referenceEncoderSha256,
        "preprocessingSha256": LocalMobileClipPredictor.referencePreprocessingSha256, "vector": vector])
    }
    guard let colour = CGColorSpace(name: CGColorSpace.sRGB) else { throw LocalVisionFailure.failed }
    let context = CIContext(options: [.workingColorSpace: colour, .outputColorSpace: colour, .cacheIntermediates: false])
    defer { context.clearCaches() }
    let image = CIImage(cgImage: decoded.pixels).oriented(decoded.orientation)
    let extent = image.extent
    let scale = min(1, 1024 / max(extent.width, extent.height))
    let width = max(1, Int((extent.width * scale).rounded())), height = max(1, Int((extent.height * scale).rounded()))
    guard width <= 1024, height <= 1024, width * height <= 1_048_576 else { throw LocalVisionFailure.invalidImage }
    let resized = image.transformed(by: CGAffineTransform(translationX: -extent.minX, y: -extent.minY))
      .transformed(by: CGAffineTransform(scaleX: CGFloat(width) / extent.width, y: CGFloat(height) / extent.height))
    guard let pixels = context.createCGImage(resized, from: CGRect(x: 0, y: 0, width: width, height: height),
      format: .RGBA8, colorSpace: colour) else { throw LocalVisionFailure.failed }
    try check()
    var rgba = [UInt8](repeating: 0, count: width * height * 4)
    var rgb = [UInt8](repeating: 0, count: width * height * 3)
    defer {
      _ = rgba.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
      _ = rgb.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
    }
    let drawn = rgba.withUnsafeMutableBytes { storage -> Bool in
      guard let drawing = CGContext(data: storage.baseAddress, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: colour, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return false }
      // Bitmap CGContext's first stored row already matches ImageIO/CGImage
      // top-down pixels here. An extra UIKit-style flip mirrors the RGB port.
      drawing.draw(pixels, in: CGRect(x: 0, y: 0, width: width, height: height))
      return true
    }
    guard drawn else { throw LocalVisionFailure.failed }
    for index in 0..<(width * height) {
      rgb[index * 3] = rgba[index * 4]; rgb[index * 3 + 1] = rgba[index * 4 + 1]; rgb[index * 3 + 2] = rgba[index * 4 + 2]
    }
    try check()
    return try json(["schemaVersion": "native-reference-rgb-v1", "imageSha256": imageHash,
      "decoderPolicy": "imageio-oriented-fit-1024-srgb-rgb-v1", "width": width, "height": height,
      "channels": 3, "rgbBase64": Data(rgb).base64EncodedString()])
  }

  /// One image, one total deadline, no persistence/download/remote fallback.
  /// Full-frame barcode evidence is never cropped away by the detail OCR view.
  private static func productEvidence(image: CGImage, orientation: CGImagePropertyOrientation,
    imageHash: String, predictor: LocalMobileClipPredictor, deadlineAt: TimeInterval) throws -> String {
    let started = ProcessInfo.processInfo.systemUptime
    func check() throws {
      guard ProcessInfo.processInfo.systemUptime < deadlineAt else { throw LocalVisionFailure.timeout }
    }
    let barcode = VNDetectBarcodesRequest()
    barcode.symbologies = [.ean13, .ean8, .itf14]
    let full = VNRecognizeTextRequest(), detail = VNRecognizeTextRequest()
    let requestedLanguages = ["fi-FI", "sv-SE", "en-US"]
    for text in [full, detail] {
      text.revision = VNRecognizeTextRequestRevision3
      text.recognitionLevel = .accurate
      text.usesLanguageCorrection = false
      text.automaticallyDetectsLanguage = true
      let supported = try text.supportedRecognitionLanguages()
      text.recognitionLanguages = requestedLanguages.filter { supported.contains($0) }
      guard !text.recognitionLanguages.isEmpty else { throw LocalVisionFailure.unavailable }
    }
    // Fixed guided ROI, not an outcome-selected crop. Original image hash and
    // the full-frame OCR remain in the same response; no synthetic extra sample.
    detail.regionOfInterest = CGRect(x: 0.1, y: 0.1, width: 0.8, height: 0.8)
    let cancellable = CancellableProductRequests(requests: [barcode, full, detail])
    let timer = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
    try check()
    timer.schedule(deadline: .now() + max(0, deadlineAt - ProcessInfo.processInfo.systemUptime))
    timer.setEventHandler { cancellable.cancel() }; timer.resume()
    defer { timer.setEventHandler {}; timer.cancel() }
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try handler.perform([barcode, full, detail]); try check()
    let codes = (barcode.results ?? []).compactMap { value -> [String: String]? in
      guard let payload = value.payloadStringValue, payload.utf8.count <= 64 else { return nil }
      return ["symbology": value.symbology.rawValue, "value": payload]
    }
    func observation(_ request: VNRecognizeTextRequest, view: String) -> [String: Any] {
      let results = request.results ?? []
      let lines = results.compactMap { observation -> [String: Any]? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.utf16.count <= 128,
          !text.unicodeScalars.contains(where: { $0.properties.generalCategory == .control || $0.properties.generalCategory == .format }) else { return nil }
        return ["text": text, "confidence": Double(candidate.confidence)]
      }
      let complete = results.count <= 48 && lines.count == results.count
      return ["view": view, "complete": complete, "lines": Array(lines.prefix(48))]
    }
    var embedding: [String: Any] = ["status": "skipped_barcode"]
    if codes.isEmpty {
      do {
        let vector = try predictor.referenceEmbedding(image: image, orientation: orientation, deadlineAt: deadlineAt)
        embedding = ["status": "observed", "encoderSha256": LocalMobileClipPredictor.referenceEncoderSha256,
          "preprocessingSha256": LocalMobileClipPredictor.referencePreprocessingSha256, "vector": vector]
      } catch {
        embedding = ["status": "unavailable"]
      }
    }
    try check()
    let value: [String: Any] = ["schemaVersion": "offline-product-evidence-v1", "imageSha256": imageHash,
      "barcodeComplete": (barcode.results ?? []).count == codes.count && codes.count <= 8,
      "barcodes": Array(codes.prefix(8)), "ocrLanguages": full.recognitionLanguages,
      "ocrPolicy": "accurate-v3-no-correction-full-and-center-v1", "ocr": [observation(full, view: "full"), observation(detail, view: "center")],
      "detailRoi": [0.1, 0.1, 0.8, 0.8], "embedding": embedding,
      "width": image.width, "height": image.height,
      "durationMs": max(0, Int(((ProcessInfo.processInfo.systemUptime - started) * 1000).rounded()))]
    let bytes = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard bytes.count <= 65536, let json = String(data: bytes, encoding: .utf8) else { throw LocalVisionFailure.failed }
    return json
  }

  func inspectReadiness(completion: @escaping @Sendable (LocalVisionReadiness) -> Void) {
    // Capture the predictor only while owning the shared gate. No work is done
    // on the caller/JS thread and no image request is created or performed.
    enqueueReadiness(deadlineSeconds: Self.deadlineSeconds, inspection: { predictor in Self.inspectCapabilities(predictor: predictor) },
                     completion: completion)
  }

  private func enqueueReadiness(
    deadlineSeconds: TimeInterval,
    inspection: @escaping @Sendable (LocalMobileClipPredictor) -> LocalVisionReadiness,
    completion: @escaping @Sendable (LocalVisionReadiness) -> Void
  ) {
    let started = ProcessInfo.processInfo.systemUptime
    stateLock.lock()
    guard !inFlight else {
      stateLock.unlock()
      completion(.unavailable(.busy))
      return
    }
    inFlight = true
    let predictor = supplementalPredictor
    stateLock.unlock()
    let delivery = LocalVisionReadinessDelivery(completion)
    let deadline = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
    deadline.schedule(deadline: .now() + deadlineSeconds)
    deadline.setEventHandler { delivery.resolve(.unavailable(.timeout)) }
    deadline.resume()
    worker.async { [self] in
      let outcome = autoreleasepool { inspection(predictor) }
      let onTime = ProcessInfo.processInfo.systemUptime - started < deadlineSeconds
      deadline.setEventHandler {}
      deadline.cancel()
      // A timed-out synchronous Core ML load is not cancellable. Only its real
      // settlement releases the gate shared by readiness and image recognition.
      stateLock.lock()
      inFlight = false
      stateLock.unlock()
      delivery.resolve(onTime ? outcome : .unavailable(.timeout))
    }
  }

  private static func inspectCapabilities(predictor: LocalMobileClipPredictor) -> LocalVisionReadiness {
    do {
      let classifier = VNClassifyImageRequest()
      if #available(iOS 17.0, macOS 14.0, *) {
        classifier.revision = VNClassifyImageRequestRevision2
      } else {
        classifier.revision = VNClassifyImageRequestRevision1
      }
      let text = VNRecognizeTextRequest()
      text.revision = VNRecognizeTextRequestRevision3
      text.recognitionLevel = .accurate
      text.usesLanguageCorrection = true
      text.customWords = materialCodeAbbreviations
      text.automaticallyDetectsLanguage = false
      guard VNClassifyImageRequest.supportedRevisions.contains(classifier.revision),
            VNRecognizeTextRequest.supportedRevisions.contains(text.revision) else {
        return .unavailable(.primaryUnavailable)
      }
      let identifiers = Set(try classifier.supportedIdentifiers())
      guard classificationIdentifiers.allSatisfy({ identifiers.contains($0) }),
            try text.supportedRecognitionLanguages().contains("en-US") else {
        return .unavailable(.primaryUnavailable)
      }
    } catch {
      return .unavailable(.primaryUnavailable)
    }
    do {
      try predictor.inspectReadiness()
      return .full
    } catch LocalMobileClipFailure.unsupportedPlatform {
      return .primaryOnly(.unsupportedModelPlatform)
    } catch {
      return .primaryOnly(.modelUnavailable)
    }
  }

  func recognize(
    jpegBase64: String,
    completion: @escaping @Sendable (Result<LocalVisionResult, LocalVisionFailure>) -> Void
  ) {
    // Reject excessive input before retaining it in the worker queue.
    guard !jpegBase64.isEmpty, jpegBase64.utf8.count <= Self.maxBase64Length else {
      completion(.failure(.invalidImage))
      return
    }
    let deadlineAt = ProcessInfo.processInfo.systemUptime + Self.deadlineSeconds
    enqueueRecognition(deadlineSeconds: Self.deadlineSeconds, operation: { predictor in
      do {
        return .success(try Self.perform(jpegBase64: jpegBase64, predictor: predictor, deadlineAt: deadlineAt))
      } catch let failure as LocalVisionFailure {
        return .failure(failure)
      } catch {
        // Never forward framework diagnostics, OCR, image data or paths.
        return .failure(.failed)
      }
    }, completion: completion)
  }

  private func enqueueRecognition(
    deadlineSeconds: TimeInterval,
    operation: @escaping @Sendable (LocalMobileClipPredictor) -> Result<LocalVisionResult, LocalVisionFailure>,
    completion: @escaping @Sendable (Result<LocalVisionResult, LocalVisionFailure>) -> Void
  ) {
    let started = ProcessInfo.processInfo.systemUptime
    stateLock.lock()
    guard !inFlight else {
      stateLock.unlock()
      completion(.failure(.busy))
      return
    }
    inFlight = true
    let predictor = supplementalPredictor
    stateLock.unlock()
    let delivery = LocalVisionRecognitionDelivery(completion)
    let deadline = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
    deadline.schedule(deadline: .now() + deadlineSeconds)
    deadline.setEventHandler { delivery.resolve(.failure(.timeout)) }
    deadline.resume()
    worker.async { [self] in
      let outcome = autoreleasepool {
        ProcessInfo.processInfo.systemUptime - started < deadlineSeconds
          ? operation(predictor) : .failure(LocalVisionFailure.timeout)
      }
      let onTime = ProcessInfo.processInfo.systemUptime - started < deadlineSeconds
      deadline.setEventHandler {}
      deadline.cancel()
      // Timeout is delivery, not cancellation. An uncancellable decode, Vision
      // request or Core ML call keeps the shared gate until it actually returns.
      stateLock.lock()
      inFlight = false
      stateLock.unlock()
      delivery.resolve(onTime ? outcome : .failure(.timeout))
    }
  }

  private static func perform(jpegBase64: String, predictor: LocalMobileClipPredictor, deadlineAt: TimeInterval) throws -> LocalVisionResult {
    let start = ProcessInfo.processInfo.systemUptime
    let image = try decodeJPEG(jpegBase64: jpegBase64)
    guard ProcessInfo.processInfo.systemUptime < deadlineAt else { throw LocalVisionFailure.timeout }
    let classifier = VNClassifyImageRequest()
    if #available(iOS 17.0, macOS 14.0, *) {
      classifier.revision = VNClassifyImageRequestRevision2
    } else {
      classifier.revision = VNClassifyImageRequestRevision1
    }
    let text = VNRecognizeTextRequest()
    text.revision = VNRecognizeTextRequestRevision3
    text.recognitionLevel = .accurate
    text.usesLanguageCorrection = true
    text.customWords = materialCodeAbbreviations
    text.automaticallyDetectsLanguage = false
    guard VNClassifyImageRequest.supportedRevisions.contains(classifier.revision),
          VNRecognizeTextRequest.supportedRevisions.contains(text.revision) else {
      throw LocalVisionFailure.unavailable
    }
    let supportedIdentifiers = Set(try classifier.supportedIdentifiers())
    guard classificationIdentifiers.allSatisfy({ supportedIdentifiers.contains($0) }) else {
      throw LocalVisionFailure.unavailable
    }
    let supportedLanguages = try text.supportedRecognitionLanguages()
    let languages = ["en-US"].filter { supportedLanguages.contains($0) }
    guard !languages.isEmpty else { throw LocalVisionFailure.unavailable }
    text.recognitionLanguages = languages

    let requests = CancellableVisionRequests(classifier: classifier, text: text)
    let remaining = deadlineAt - ProcessInfo.processInfo.systemUptime
    guard remaining > 0 else { throw LocalVisionFailure.timeout }
    let deadline = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
    // Decode and capability setup consume the same budget as the requests.
    deadline.schedule(deadline: .now() + remaining)
    deadline.setEventHandler { requests.cancel() }
    deadline.resume()
    defer {
      deadline.setEventHandler {}
      deadline.cancel()
    }
    let handler = VNImageRequestHandler(cgImage: image.pixels, orientation: image.orientation, options: [:])
    try handler.perform([classifier, text])
    // cancel is best effort; the single-flight gate stays locked until perform really settles.
    guard ProcessInfo.processInfo.systemUptime < deadlineAt else {
      throw LocalVisionFailure.timeout
    }

    // Vision is multi-label with a hierarchical taxonomy. Its independent scores
    // must not be ranked against different labels or treated as a softmax.
    // Apply Apple's per-class operating point, including every allowlisted label.
    var observations: [String: VNClassificationObservation] = [:]
    for observation in classifier.results ?? [] where classificationIdentifiers.contains(observation.identifier) {
      guard observations[observation.identifier] == nil else { throw LocalVisionFailure.failed }
      observations[observation.identifier] = observation
    }
    let classifications = try classificationIdentifiers.map { identifier -> LocalVisionClassification in
      guard let observation = observations[identifier] else {
        return LocalVisionClassification(identifier: identifier, score: 0, hasPrecisionRecallCurve: false, passesOperatingPoint: false)
      }
      let score = Double(observation.confidence)
      guard score.isFinite, score >= 0, score <= 1 else { throw LocalVisionFailure.failed }
      let hasCurve = observation.hasPrecisionRecallCurve
      return LocalVisionClassification(
        identifier: identifier,
        score: score,
        hasPrecisionRecallCurve: hasCurve,
        passesOperatingPoint: hasCurve && observation.hasMinimumRecall(0.01, forPrecision: 0.9)
      )
    }
    var seen = Set<String>()
    let lines = (text.results ?? []).compactMap { observation -> String? in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let line = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !line.isEmpty, line.utf16.count <= 64,
            !line.unicodeScalars.contains(where: { $0.properties.generalCategory == .control || $0.properties.generalCategory == .format }),
            seen.insert(line).inserted else { return nil }
      return line
    }
    // A failed primary never reaches this point. Preserve a match or a conflict;
    // only a genuine no-match may ask the separate visible-form estimator.
    let supplement: LocalVisionSupplement
    if let reason = supplementalSkipReason(classifications) {
      supplement = .skipped(reason)
    } else {
      guard ProcessInfo.processInfo.systemUptime < deadlineAt else {
        throw LocalVisionFailure.timeout
      }
      do {
        let scores = try predictor.predict(image: image.pixels, orientation: image.orientation)
        let groups = ["bottle", "jar", "box", "bag", "cup", "other-battery", "other-phone", "other-book", "other-food", "other-person", "other-animal", "other-leaf", "other-clothes", "other-electronics", "other-tools", "other-plate", "other-aerosol", "other-drink-can"]
        if scores.map(\.group) == groups,
           scores.allSatisfy({ $0.cosine.isFinite && $0.cosine >= -1 && $0.cosine <= 1 }) {
          supplement = .observed(scores)
        } else {
          supplement = .unavailable(.processingFailed)
        }
      } catch LocalMobileClipFailure.unsupportedPlatform {
        supplement = .unavailable(.modelUnavailable)
      } catch LocalMobileClipFailure.unavailable {
        supplement = .unavailable(.modelUnavailable)
      } catch LocalMobileClipFailure.invalidModel {
        supplement = .unavailable(.modelUnavailable)
      } catch {
        supplement = .unavailable(.processingFailed)
      }
    }
    let elapsed = ProcessInfo.processInfo.systemUptime - start
    // Core ML prediction is not cancellable; never release the single-flight
    // gate or return its late output merely because the UI deadline elapsed.
    guard ProcessInfo.processInfo.systemUptime < deadlineAt else { throw LocalVisionFailure.timeout }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let version = ProcessInfo.processInfo.operatingSystemVersion
    return LocalVisionResult(
      classificationRevision: classifier.revision,
      ocrLanguages: languages,
      osVersion: "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
      observedAt: formatter.string(from: Date()),
      classifications: Array(classifications),
      // Too much text must not hide a conflicting code outside the output bound.
      textLines: lines.count <= 24 ? lines : [],
      supplement: supplement,
      durationMs: max(0, Int((elapsed * 1_000).rounded()))
    )
  }

  static func supplementalSkipReason(_ classifications: [LocalVisionClassification]) -> LocalVisionSupplementSkipReason? {
    let kinds = Set(classifications.compactMap { value -> String? in
      guard value.hasPrecisionRecallCurve && value.passesOperatingPoint else { return nil }
      switch value.identifier {
      case "bottle", "wine_bottle": return "bottle"
      case "jar": return "jar"
      case "carton", "cardboard_box": return "box"
      case "paper_bag": return "bag"
      case "cup": return "cup"
      default: return nil
      }
    })
    if kinds.count == 1 { return .primaryMatch }
    if kinds.count > 1 { return .primaryConflict }
    return nil
  }

  private static func decodeJPEG(jpegBase64: String) throws -> (pixels: CGImage, orientation: CGImagePropertyOrientation) {
    guard jpegBase64.utf8.count <= maxBase64Length,
          jpegBase64.utf8.count % 4 == 0,
          let data = Data(base64Encoded: jpegBase64),
          data.count >= 12, data.count <= maxBytes,
          data.base64EncodedString() == jpegBase64,
          data[data.startIndex] == 0xff, data[data.startIndex + 1] == 0xd8,
          data[data.endIndex - 2] == 0xff, data[data.endIndex - 1] == 0xd9,
          let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
          CGImageSourceGetCount(source) == 1,
          let type = CGImageSourceGetType(source), type as String == UTType.jpeg.identifier,
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width <= 4096, height <= 4096,
          width * height <= 16_000_000,
          let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary),
          image.width == width, image.height == height else {
      throw LocalVisionFailure.invalidImage
    }
    let orientationValue = (properties[kCGImagePropertyOrientation] as? UInt32) ?? 1
    guard let orientation = CGImagePropertyOrientation(rawValue: orientationValue) else {
      throw LocalVisionFailure.invalidImage
    }
    return (image, orientation)
  }
}
