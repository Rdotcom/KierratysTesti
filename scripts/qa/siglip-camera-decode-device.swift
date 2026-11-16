import UIKit
import Foundation
import CryptoKit
private struct DecodeCase: Decodable { let id: String; let file: String; let sha256: String }
private struct DecodeManifest: Decodable { let run: String; let cases: [DecodeCase] }
@main final class SiglipValidationDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let c = UISceneConfiguration(name: "Default", sessionRole: session.role)
    c.delegateClass = SiglipValidationSceneDelegate.self; return c
  }
}
final class SiglipValidationSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let controller = UIViewController(); controller.view.backgroundColor = .systemBackground
    let label = UILabel(frame: CGRect(x: 20, y: 100, width: 350, height: 100)); label.text = "JPEG decoding only"; controller.view.addSubview(label)
    window = UIWindow(windowScene: scene); window?.rootViewController = controller; window?.makeKeyAndVisible()
    DispatchQueue.global(qos: .userInitiated).async { self.decode() }
  }
  private func decode() {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    do {
      try Data("decode-only; no predictions".utf8).write(to: docs.appendingPathComponent("decode-started.txt"), options: .withoutOverwriting)
      let assets = Bundle.main.resourceURL!.appendingPathComponent("assets")
      let manifest = try JSONDecoder().decode(DecodeManifest.self, from: Data(contentsOf: assets.appendingPathComponent("manifest.json")))
      var rows = [[String: Any]]()
      for item in manifest.cases {
        let data = try Data(contentsOf: assets.appendingPathComponent(item.file))
        guard SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == item.sha256 else { throw SiglipInputFailure.invalidImage }
        let tensor = try SiglipImageEncoder.preprocess(imageData: data)
        let bytes = tensor.withUnsafeBytes { Data($0) }
        try bytes.write(to: docs.appendingPathComponent(item.id + ".f32"), options: .withoutOverwriting)
        rows.append(["id": item.id, "tensorSha256": SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()])
      }
      try JSONSerialization.data(withJSONObject: ["run": manifest.run, "predictions": 0, "rows": rows], options: [.sortedKeys]).write(to: docs.appendingPathComponent("decode-results.json"), options: .withoutOverwriting)
    } catch {
      try? Data("decode_failed".utf8).write(to: docs.appendingPathComponent("decode-failure.txt"), options: .withoutOverwriting)
    }
  }
}
