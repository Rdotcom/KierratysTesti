import UIKit
import Foundation
import CryptoKit
import Darwin

private struct WorkerCase: Decodable { let id: String; let file: String; let sha256: String }
private struct WorkerManifest: Decodable { let run: String; let cases: [WorkerCase] }
private final class WorkerResult: @unchecked Sendable {
  private let lock = NSLock()
  private var result: Result<String, LocalVisionFailure>?
  let ready = DispatchSemaphore(value: 0)
  func accept(_ value: Result<String, LocalVisionFailure>) { lock.lock(); result = value; lock.unlock(); ready.signal() }
  func value() throws -> String { lock.lock(); defer { lock.unlock() }; return try result!.get() }
}
@main final class SiglipValidationDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default", sessionRole: session.role)
    configuration.delegateClass = SiglipValidationSceneDelegate.self
    return configuration
  }
}
final class SiglipValidationSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private let label = UILabel()
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let controller = UIViewController(); controller.view.backgroundColor = .systemBackground
    label.text = "Camera worker validation\nLocal fixtures only"; label.numberOfLines = 0
    label.frame = CGRect(x: 20, y: 100, width: 350, height: 200); controller.view.addSubview(label)
    window = UIWindow(windowScene: scene); window?.rootViewController = controller; window?.makeKeyAndVisible()
    UIApplication.shared.isIdleTimerDisabled = true
    DispatchQueue.global(qos: .userInitiated).async { self.run() }
  }
  private func rss() -> UInt64 {
    var info = mach_task_basic_info(), count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    let status = withUnsafeMutablePointer(to: &info) { p in p.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count) } }
    return status == KERN_SUCCESS ? UInt64(info.resident_size) : 0
  }
  private func write(_ object: Any, _ url: URL) throws { try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]).write(to: url, options: .withoutOverwriting) }
  private func run() {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    do {
      let assets = Bundle.main.resourceURL!.appendingPathComponent("assets")
      let manifest = try JSONDecoder().decode(WorkerManifest.self, from: Data(contentsOf: assets.appendingPathComponent("manifest.json")))
      guard manifest.cases.count == 4 else { throw LocalVisionFailure.failed }
      try write(["run": manifest.run], documents.appendingPathComponent("started.json"))
      guard let a = LocalVisionEngine.readinessLifecycleSelfTest(), let b = LocalVisionEngine.recognitionLifecycleSelfTest(),
        let c = LocalVisionEngine.referencePortLifecycleSelfTest(), let d = LocalVisionEngine.objectCandidateLifecycleSelfTest() else { throw LocalVisionFailure.failed }
      try write(a + b + c + d, documents.appendingPathComponent("lifecycle.json"))
      SiglipObjectPredictor.qaResourceURL = assets
      try LocalVisionEngine.shared.configureQAResources(assets.appendingPathComponent("KierratysLocalVisionModels.bundle"))
      var rows = [[String: Any]]()
      for item in manifest.cases {
        let data = try Data(contentsOf: assets.appendingPathComponent(item.file))
        guard data.count <= 1_500_000, SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == item.sha256 else { throw LocalVisionFailure.invalidImage }
        let ready = DispatchSemaphore(value: 0)
        LocalVisionEngine.shared.inspectReadiness { _ in ready.signal() }
        guard ready.wait(timeout: .now() + 15) == .success else { throw LocalVisionFailure.timeout }
        let start = ProcessInfo.processInfo.systemUptime, before = rss(), result = WorkerResult()
        LocalVisionEngine.shared.recognizeObjectCandidates(input: data.base64EncodedString(), requestID: UUID().uuidString, timeoutMs: 12000, completion: result.accept)
        guard result.ready.wait(timeout: .now() + 15) == .success else { throw LocalVisionFailure.timeout }
        var row: [String: Any] = ["id": item.id, "failure": NSNull()]
        do { row["observation"] = try JSONSerialization.jsonObject(with: Data(result.value().utf8)) }
        catch { row["failure"] = String(describing: type(of: error)) }
        row["durationMs"] = (ProcessInfo.processInfo.systemUptime - start) * 1000
        row["rssBeforeBytes"] = before; row["rssAfterBytes"] = rss()
        rows.append(row); try write(row, documents.appendingPathComponent(item.id + ".json"))
      }
      try write(["run": manifest.run, "rows": rows, "cameraCaptureVerified": false], documents.appendingPathComponent("worker-results.json"))
      DispatchQueue.main.async { self.label.text = "4 worker cases completed" }
    } catch {
      try? write(["failure": String(describing: type(of: error))], documents.appendingPathComponent("failure.json"))
      DispatchQueue.main.async { self.label.text = "Worker test stopped; receipt retained" }
    }
  }
}
