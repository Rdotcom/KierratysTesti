import Foundation
import CryptoKit
#if os(iOS)
import UIKit
@main final class JpegDiagnosticApp: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let c = UISceneConfiguration(name: "Default", sessionRole: session.role)
    c.delegateClass = JpegDiagnosticScene.self; return c
  }
}
final class JpegDiagnosticScene: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let controller = UIViewController(); controller.view.backgroundColor = .systemBackground
    window = UIWindow(windowScene: scene); window?.rootViewController = controller; window?.makeKeyAndVisible()
    DispatchQueue.global(qos: .userInitiated).async {
      let output = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      do { try JpegDiagnostic.run(assets: Bundle.main.resourceURL!.appendingPathComponent("assets"), output: output) }
      catch { try? Data("failed".utf8).write(to: output.appendingPathComponent("diagnostic-failed.txt"), options: .withoutOverwriting) }
    }
  }
}
#else
@main struct JpegDiagnosticCLI {
  static func main() throws {
    let args = CommandLine.arguments
    guard args.count == 3 else { throw SiglipInputFailure.invalidImage }
    try JpegDiagnostic.run(assets: URL(fileURLWithPath: args[1]), output: URL(fileURLWithPath: args[2]))
  }
}
#endif
enum JpegDiagnostic {
  struct Item: Decodable { let id: String; let file: String; let sha256: String }
  struct Manifest: Decodable { let run: String; let cases: [Item] }
  static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
  static func run(assets: URL, output: URL) throws {
    let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: assets.appendingPathComponent("manifest.json")))
    guard manifest.cases.count == 4, !manifest.run.contains(".."),
      manifest.run.range(of: "^[A-Za-z0-9._-]{1,96}$", options: .regularExpression) != nil else { throw SiglipInputFailure.invalidImage }
    let output = output.appendingPathComponent(manifest.run, isDirectory: true)
    try FileManager.default.createDirectory(at: output, withIntermediateDirectories: false)
    try Data("zero predictions".utf8).write(to: output.appendingPathComponent("jpeg-diagnostic-started.txt"), options: .withoutOverwriting)
    var rows = [[String: Any]]()
    for (index, item) in manifest.cases.enumerated() {
      guard item.id == "commons-\(index + 1)-clean", item.file == item.id + ".jpg" else { throw SiglipInputFailure.invalidImage }
      let data = try Data(contentsOf: assets.appendingPathComponent(item.file))
      guard hash(data) == item.sha256 else { throw SiglipInputFailure.invalidImage }
      for mode in ["system-default", "pinned"] {
        let tensor = try mode == "system-default" ? SiglipImageEncoder.preprocessSystemDefault(imageData: data) : SiglipImageEncoder.preprocess(imageData: data)
        let bytes = tensor.withUnsafeBytes { Data($0) }
        try bytes.write(to: output.appendingPathComponent(item.id + "-" + mode + ".f32"), options: .withoutOverwriting)
        rows.append(["id": item.id, "mode": mode, "sha256": hash(bytes)])
      }
    }
    try JSONSerialization.data(withJSONObject: ["run": manifest.run, "predictions": 0, "rows": rows], options: [.sortedKeys]).write(to: output.appendingPathComponent("jpeg-diagnostic-results.json"), options: .withoutOverwriting)
  }
}
