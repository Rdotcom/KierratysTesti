import Foundation

// Compile with the exact local-vision-engine.swift used by the native module.
// File reads exist only in this explicit development CLI, never in the app bridge.
func run(_ base64: String) -> Result<LocalVisionResult, LocalVisionFailure> {
  let signal = DispatchSemaphore(value: 0)
  let resultLock = NSLock()
  nonisolated(unsafe) var outcome: Result<LocalVisionResult, LocalVisionFailure>?
  LocalVisionEngine.shared.recognize(jpegBase64: base64) { result in
    resultLock.lock()
    outcome = result
    resultLock.unlock()
    signal.signal()
  }
  signal.wait()
  resultLock.lock()
  defer { resultLock.unlock() }
  return outcome ?? .failure(.failed)
}

func emit(_ data: Data) {
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([10]))
}

func fail(_ reason: String) -> Never {
  emit(try! JSONSerialization.data(withJSONObject: ["status": "unavailable", "reason": reason], options: [.sortedKeys]))
  exit(1)
}

func emitOutcome(_ base64: String) throws {
  switch run(base64) {
  case .success(let result): emit(try JSONEncoder().encode(result))
  case .failure(let failure): fail(failure.rawValue)
  }
}

func referenceOutcome(_ kind: LocalReferencePortOperation, _ input: String = "") -> Result<String, LocalVisionFailure> {
  let signal = DispatchSemaphore(value: 0), lock = NSLock()
  nonisolated(unsafe) var result: Result<String, LocalVisionFailure>?
  LocalVisionEngine.shared.referencePort(kind, input: input) { value in
    lock.lock(); result = value; lock.unlock(); signal.signal()
  }
  guard signal.wait(timeout: .now() + LocalVisionEngine.deadlineSeconds + 2) == .success else { return .failure(.timeout) }
  lock.lock(); defer { lock.unlock() }
  return result ?? .failure(.failed)
}

var args = Array(CommandLine.arguments.dropFirst())
#if LOCAL_VISION_QA
if args.count >= 2, args[0] == "--resources" {
  let directory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
  let work = directory.appendingPathComponent("work", isDirectory: true).resolvingSymlinksInPath()
  let resource = URL(fileURLWithPath: args[1], relativeTo: directory).standardizedFileURL
  guard resource.path.hasPrefix(work.path + "/"),
        resource.resolvingSymlinksInPath() == resource,
        let values = try? resource.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey]),
        values.isDirectory == true, values.isSymbolicLink != true else { fail("invalid_qa_resources") }
  try LocalVisionEngine.shared.configureQAResources(resource)
  args.removeFirst(2)
}
#endif
if args == ["--reference-rgb-self-test"] {
  #if LOCAL_VISION_QA
  let passed = try LocalVisionEngine.referenceRgbSelfTest()
  emit(try JSONSerialization.data(withJSONObject: ["passed": passed, "generatedJpegDecodes": passed,
    "imageRequestsPerformed": 0, "supplementRequestsPerformed": 0], options: [.sortedKeys]))
  #else
  fail("qa_only_command")
  #endif
} else if args == ["--reference-self-test"] {
  #if LOCAL_VISION_QA
  guard let cases = LocalVisionEngine.referencePortLifecycleSelfTest() else { fail("reference_lifecycle_failed") }
  for value in ["", "AA==\n", "AB==", "file:///unused", String(repeating: "A", count: 2_000_004)] {
    guard case .failure(.invalidImage) = referenceOutcome(.hashBytes, value) else { fail("reference_invalid_input_failed") }
  }
  guard case .success(let hash) = referenceOutcome(.hashBytes, "AA=="),
        hash == "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d" else { fail("reference_hash_failed") }
  emit(try JSONSerialization.data(withJSONObject: ["passed": cases.count + 6, "cases": cases,
    "imageRequestsPerformed": 0, "supplementRequestsPerformed": 0,
    "encoderSha256": LocalMobileClipPredictor.referenceEncoderSha256,
    "preprocessingSha256": LocalMobileClipPredictor.referencePreprocessingSha256], options: [.sortedKeys]))
  #else
  fail("qa_only_command")
  #endif
} else if args == ["--reference-capabilities"] || args == ["--reference-encode-stdin"] || args == ["--reference-rgb-stdin"] || args == ["--reference-hash-stdin"] || args == ["--product-evidence-stdin"] {
  let kind: LocalReferencePortOperation = args[0] == "--product-evidence-stdin" ? .productEvidence : args[0] == "--reference-capabilities" ? .capabilities : args[0] == "--reference-encode-stdin" ? .encode : args[0] == "--reference-hash-stdin" ? .hashBytes : .decodeRgb
  var input = Data()
  if kind != .capabilities {
    while let chunk = try FileHandle.standardInput.read(upToCount: min(65_536, LocalVisionEngine.maxBase64Length + 1 - input.count)), !chunk.isEmpty {
      input.append(chunk)
      guard input.count <= LocalVisionEngine.maxBase64Length else { fail("invalid_image") }
    }
  }
  guard let text = String(data: input, encoding: .utf8) else { fail("invalid_image") }
  switch referenceOutcome(kind, text) {
  case .success(let output):
    if kind == .hashBytes { emit(try JSONEncoder().encode(output)) }
    else { emit(Data(output.utf8)) }
  case .failure(let failure): fail(failure.rawValue)
  }
} else if args == ["--readiness"] {
  let signal = DispatchSemaphore(value: 0)
  let lock = NSLock()
  nonisolated(unsafe) var readiness: LocalVisionReadiness?
  LocalVisionEngine.shared.inspectReadiness { result in
    lock.lock()
    readiness = result
    lock.unlock()
    signal.signal()
  }
  guard signal.wait(timeout: .now() + LocalVisionEngine.deadlineSeconds + 2) == .success else {
    fail("readiness_delivery_failed")
  }
  lock.lock()
  let result = readiness
  lock.unlock()
  guard let result else { fail("readiness_delivery_failed") }
  emit(try JSONEncoder().encode(result))
} else if args == ["--readiness-self-test"] {
  #if LOCAL_VISION_QA
  guard let cases = LocalVisionEngine.readinessLifecycleSelfTest() else { fail("readiness_self_test_failed") }
  emit(try JSONSerialization.data(withJSONObject: ["passed": cases.count, "cases": cases,
    "imageRequestsPerformed": 0, "supplementRequestsPerformed": 0], options: [.sortedKeys]))
  #else
  fail("qa_only_command")
  #endif
} else if args == ["--recognition-self-test"] {
  #if LOCAL_VISION_QA
  guard let cases = LocalVisionEngine.recognitionLifecycleSelfTest() else { fail("recognition_self_test_failed") }
  emit(try JSONSerialization.data(withJSONObject: ["passed": cases.count, "cases": cases,
    "imageRequestsPerformed": 0, "supplementRequestsPerformed": 0], options: [.sortedKeys]))
  #else
  fail("qa_only_command")
  #endif
} else if args == ["--self-test"] {
  let invalid: [String] = [
    "",
    "data:image/jpeg;base64,/9j/2Q==",
    "file:///tmp/not-an-image.jpg",
    "https://example.invalid/image.jpg",
    "YWJjZA==\n",
    "YWJjZB==", // Noncanonical padding bits.
    Data(repeating: 1, count: LocalVisionEngine.maxBytes + 1).base64EncodedString(),
    Data("not a JPEG image".utf8).base64EncodedString(),
  ]
  for value in invalid {
    guard case .failure(.invalidImage) = run(value) else { fail("self_test_failed") }
  }
  emit(try JSONSerialization.data(withJSONObject: ["passed": invalid.count, "imageRequestsPerformed": 0], options: [.sortedKeys]))
} else if args == ["--cascade-self-test"] {
  func values(_ identifiers: [String]) -> [LocalVisionClassification] {
    LocalVisionEngine.classificationIdentifiers.map { identifier in
      LocalVisionClassification(identifier: identifier, score: 0.1, hasPrecisionRecallCurve: true, passesOperatingPoint: identifiers.contains(identifier))
    }
  }
  let cases: [([String], LocalVisionSupplementSkipReason?)] = [
    ([], nil), (["bottle"], .primaryMatch), (["bottle", "wine_bottle"], .primaryMatch),
    (["carton", "cardboard_box"], .primaryMatch), (["cup", "jar"], .primaryConflict),
    (["paper_bag", "cup"], .primaryConflict),
  ]
  for (identifiers, expected) in cases {
    guard LocalVisionEngine.supplementalSkipReason(values(identifiers)) == expected else { fail("cascade_self_test_failed") }
  }
  emit(try JSONSerialization.data(withJSONObject: ["passed": cases.count, "imageRequestsPerformed": 0, "supplementRequestsPerformed": 0], options: [.sortedKeys]))
} else if args == ["--base64-stdin"] {
  var input = Data()
  while let chunk = try FileHandle.standardInput.read(upToCount: min(65_536, LocalVisionEngine.maxBase64Length + 1 - input.count)), !chunk.isEmpty {
    input.append(chunk)
    guard input.count <= LocalVisionEngine.maxBase64Length else { fail("invalid_image") }
  }
  guard let value = String(data: input, encoding: .utf8) else { fail("invalid_image") }
  try emitOutcome(value)
} else if args.count == 2, args[0] == "--jpeg" {
  let path = args[1]
  guard !path.hasPrefix("http:"), !path.hasPrefix("https:"), !path.hasPrefix("file:"),
        let attributes = try? FileManager.default.attributesOfItem(atPath: path),
        let size = attributes[.size] as? NSNumber,
        size.intValue > 0, size.intValue <= LocalVisionEngine.maxBytes,
        let handle = FileHandle(forReadingAtPath: path) else { fail("invalid_image") }
  defer { try? handle.close() }
  guard let bytes = try? handle.read(upToCount: LocalVisionEngine.maxBytes + 1),
        !bytes.isEmpty, bytes.count <= LocalVisionEngine.maxBytes,
        bytes.count == size.intValue else { fail("invalid_image") }
  try emitOutcome(bytes.base64EncodedString())
} else {
  fail("usage: --self-test, --base64-stdin or --jpeg <cleared-local-fixture>")
}
