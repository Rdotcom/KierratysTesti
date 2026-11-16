import UIKit
import Foundation
import CryptoKit
import Darwin

private struct DeviceCase: Decodable { let id: String; let imageSha256: String; let tensorSha256: String }
private struct DeviceManifest: Decodable { let run: String; let cases: [DeviceCase]; let modelFiles: [String: String] }

@main final class SiglipValidationDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
    options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default", sessionRole: session.role)
    configuration.delegateClass = SiglipValidationSceneDelegate.self
    return configuration
  }
}

final class SiglipValidationSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private let status = UILabel()

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let controller = UIViewController()
    controller.view.backgroundColor = .systemBackground
    status.text = "SigLIP2 native validation\nPreparing local test"
    status.numberOfLines = 0
    status.textAlignment = .center
    status.frame = CGRect(x: 20, y: 100, width: 350, height: 200)
    status.autoresizingMask = [.flexibleWidth]
    controller.view.addSubview(status)
    window = UIWindow(windowScene: windowScene)
    window?.rootViewController = controller
    window?.makeKeyAndVisible()
    UIApplication.shared.isIdleTimerDisabled = true
    DispatchQueue.global(qos: .userInitiated).async { self.run() }
  }

  private func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
  private func write(_ value: [String: Any], to url: URL) throws {
    try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: url, options: .withoutOverwriting)
  }
  private func rss() -> UInt64 {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    let code = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count) }
    }
    return code == KERN_SUCCESS ? UInt64(info.resident_size) : 0
  }
  private func run() {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    do {
      let assets = Bundle.main.resourceURL!.appendingPathComponent("assets", isDirectory: true)
      let manifest = try JSONDecoder().decode(DeviceManifest.self, from: Data(contentsOf: assets.appendingPathComponent("manifest.json")))
      guard manifest.cases.count == 4, Set(manifest.cases.map(\.id)).count == 4 else { throw SiglipInputFailure.invalidImage }
      // No overwrite: relaunch cannot silently rerun the same benchmark.
      try write(["run": manifest.run, "stage": "started"], to: documents.appendingPathComponent("qa-started.json"))
      let modelURL = assets.appendingPathComponent("vision-int8-block32.mlmodelc", isDirectory: true)
      for (name, expected) in manifest.modelFiles {
        guard !name.contains(".."), !name.hasPrefix("/"),
              hash(try Data(contentsOf: modelURL.appendingPathComponent(name))) == expected else { throw SiglipInputFailure.invalidModel }
      }
      let loadStart = ProcessInfo.processInfo.systemUptime
      let encoder = try SiglipImageEncoder(compiledModelURL: modelURL)
      let loadMs = (ProcessInfo.processInfo.systemUptime - loadStart) * 1000
      var rows = [[String: Any]]()
      for item in manifest.cases {
        let start = ProcessInfo.processInfo.systemUptime
        var row: [String: Any] = ["id": item.id, "failure": NSNull()]
        do {
          let bytes = try Data(contentsOf: assets.appendingPathComponent(item.id + ".png"))
          guard hash(bytes) == item.imageSha256 else { throw SiglipInputFailure.invalidImage }
          let tensor = try SiglipImageEncoder.preprocess(imageData: bytes)
          let digest = hash(tensor.withUnsafeBytes { Data($0) })
          guard digest == item.tensorSha256 else { throw SiglipInputFailure.invalidTensor }
          let vector = try encoder.encode(tensor: tensor)
          row["tensorSha256"] = digest
          row["vector"] = vector
        } catch { row["failure"] = String(describing: type(of: error)) }
        row["durationMs"] = (ProcessInfo.processInfo.systemUptime - start) * 1000
        row["sampledRssBytes"] = rss()
        rows.append(row)
        try write(row, to: documents.appendingPathComponent(item.id + ".json"))
      }
      try write(["run": manifest.run, "modelLoadMs": loadMs, "compute": SiglipImageEncoder.computeIdentity,
        "preprocessing": SiglipImagePreprocessor.identity, "os": ProcessInfo.processInfo.operatingSystemVersionString,
        "rows": rows, "generalAccuracyVerified": false, "cameraVerified": false], to: documents.appendingPathComponent("qa-results.json"))
      DispatchQueue.main.async { self.status.text = "SigLIP2 native validation\n4 local cases completed" }
    } catch {
      // No images or user data in diagnostics. Preserve exclusive failure receipt.
      try? write(["failure": String(describing: type(of: error))], to: documents.appendingPathComponent("qa-failure.json"))
      DispatchQueue.main.async { self.status.text = "SigLIP2 validation stopped\nSee retained QA receipt" }
    }
  }
}
