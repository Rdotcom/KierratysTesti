import ExpoModulesCore

public final class LocalVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KierratysLocalVision")

    AsyncFunction("recognizeObjectCandidates") { (base64: String, requestID: String, timeoutMs: Int, promise: Promise) in
      LocalVisionEngine.shared.recognizeObjectCandidates(input: base64, requestID: requestID, timeoutMs: timeoutMs) {
        Self.resolveReference($0, promise)
      }
    }
    Function("cancelObjectCandidates") { (requestID: String) in
      LocalVisionEngine.shared.cancelObjectCandidates(requestID: requestID)
    }

    AsyncFunction("recognizeProductEvidence") { (base64: String, promise: Promise) in
      LocalVisionEngine.shared.referencePort(.productEvidence, input: base64) { Self.resolveReference($0, promise) }
    }

    AsyncFunction("inspectReferenceCapabilities") { (promise: Promise) in
      LocalVisionEngine.shared.referencePort(.capabilities) { Self.resolveReference($0, promise) }
    }
    AsyncFunction("hashReferenceBytes") { (base64: String, promise: Promise) in
      LocalVisionEngine.shared.referencePort(.hashBytes, input: base64) { Self.resolveReference($0, promise) }
    }
    AsyncFunction("encodeReferenceImage") { (base64: String, promise: Promise) in
      LocalVisionEngine.shared.referencePort(.encode, input: base64) { Self.resolveReference($0, promise) }
    }
    AsyncFunction("decodeReferenceRgb") { (base64: String, promise: Promise) in
      LocalVisionEngine.shared.referencePort(.decodeRgb, input: base64) { Self.resolveReference($0, promise) }
    }

    AsyncFunction("inspectReadiness") { (promise: Promise) in
      LocalVisionEngine.shared.inspectReadiness { result in
        do {
          promise.resolve(try result.bridgeValue())
        } catch {
          promise.reject("ERR_LOCAL_VISION_FAILED", "failed")
        }
      }
    }

    AsyncFunction("recognize") { (jpegBase64: String, promise: Promise) in
      LocalVisionEngine.shared.recognize(jpegBase64: jpegBase64) { outcome in
        switch outcome {
        case .success(let observation):
          do {
            promise.resolve(try observation.bridgeValue())
          } catch {
            promise.reject("ERR_LOCAL_VISION_FAILED", "failed")
          }
        case .failure(let failure):
          // Includes the bounded outer watchdog's ERR_LOCAL_VISION_TIMEOUT.
          let code = failure.rawValue.uppercased()
          promise.reject("ERR_LOCAL_VISION_\(code)", failure.rawValue)
        }
      }
    }
  }

  private static func resolveReference(_ result: Result<String, LocalVisionFailure>, _ promise: Promise) {
    switch result {
    case .success(let value): promise.resolve(value)
    case .failure(let failure): promise.reject("ERR_LOCAL_VISION_\(failure.rawValue.uppercased())", failure.rawValue)
    }
  }
}
