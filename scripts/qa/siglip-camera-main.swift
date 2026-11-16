import Foundation
import ImageIO

final class CameraQAResult: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Result<String, LocalVisionFailure>?
  let ready = DispatchSemaphore(value: 0)
  func receive(_ result: Result<String, LocalVisionFailure>) { lock.lock(); value = result; lock.unlock(); ready.signal() }
  func get() throws -> String { lock.lock(); defer { lock.unlock() }; return try value!.get() }
}
@main struct SiglipCameraQA {
  static func main() throws {
    let args = CommandLine.arguments
    if args.count == 2 && args[1] == "lifecycle" {
      guard let a = LocalVisionEngine.readinessLifecycleSelfTest(), let b = LocalVisionEngine.recognitionLifecycleSelfTest(),
        let c = LocalVisionEngine.referencePortLifecycleSelfTest(), let d = LocalVisionEngine.objectCandidateLifecycleSelfTest() else { throw LocalVisionFailure.failed }
      print(try String(data: JSONSerialization.data(withJSONObject: a + b + c + d), encoding: .utf8)!)
    } else if args.count == 4 && args[1] == "jpeg" {
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, nil)!
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
      let bytes = NSMutableData()
      let out = CGImageDestinationCreateWithData(bytes, "public.jpeg" as CFString, 1, nil)!
      CGImageDestinationAddImage(out, image, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
      guard CGImageDestinationFinalize(out) else { throw LocalVisionFailure.failed }
      try (bytes as Data).write(to: URL(fileURLWithPath: args[3]), options: .withoutOverwriting)
    } else if args.count == 5 && args[1] == "recognize" {
      try Data("started".utf8).write(to: URL(fileURLWithPath: args[4] + ".attempt"), options: .withoutOverwriting)
      guard #available(macOS 15.0, *) else { throw LocalVisionFailure.unavailable }
      SiglipObjectPredictor.qaResourceURL = URL(fileURLWithPath: args[2])
      let data = try Data(contentsOf: URL(fileURLWithPath: args[3]))
      let result = CameraQAResult()
      LocalVisionEngine.shared.recognizeObjectCandidates(input: data.base64EncodedString(), requestID: UUID().uuidString, timeoutMs: 12000, completion: result.receive)
      guard result.ready.wait(timeout: .now() + 15) == .success else { throw LocalVisionFailure.timeout }
      try Data(result.get().utf8).write(to: URL(fileURLWithPath: args[4]), options: .withoutOverwriting)
    } else { throw LocalVisionFailure.failed }
  }
}
