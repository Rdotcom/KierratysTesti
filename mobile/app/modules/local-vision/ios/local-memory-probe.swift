#if LOCAL_MEMORY_QA
import Foundation
import Darwin
import CryptoKit
#if os(iOS)
import UIKit
import AVFoundation
#endif

// Actual-app, compile-time-only numeric diagnostic. No runtime public bridge.
enum LocalMemoryProbe {
  private final class Store: @unchecked Sendable {
    let lock = NSLock()
    var started = false
    var stage = "home"
    var rows = [[String: Any]]()
    var forwards = ["mobileclip": 0, "siglip": 0]
    var scoreHashes = [String]()
    var start: TimeInterval = 0
    var timer: DispatchSourceTimer?
    var cameraMode = false
    var maximumRows = 900
    var cameraStarts = 0
    var observers = [NSObjectProtocol]()
  }
  private static let store = Store()
  private static let queue = DispatchQueue(label: "fi.roopeaaltonen.memory-probe")
  static func note(_ stage: String) {
    store.lock.lock(); defer { store.lock.unlock() }
    guard store.started else { return }
    store.stage = stage
    appendLocked(event: true)
    if stage == "mobileclip_predicted" { store.forwards["mobileclip", default: 0] += 1 }
    if stage == "siglip_predicted" { store.forwards["siglip", default: 0] += 1 }
  }
  private static func appendLocked(event: Bool) {
    guard store.rows.count < store.maximumRows else { return }
    var vm = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let status = withUnsafeMutablePointer(to: &vm) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    var heap = malloc_statistics_t()
    malloc_zone_statistics(nil, &heap)
    store.rows.append(["elapsedMs": (ProcessInfo.processInfo.systemUptime - store.start) * 1000,
      "stage": store.stage, "event": event, "status": status,
      "footprint": vm.phys_footprint, "rss": vm.resident_size,
      "lifetimePeak": vm.ledger_phys_footprint_peak, "heapUsed": heap.size_in_use,
      "heapReserved": heap.size_allocated, "heapBlocks": heap.blocks_in_use])
  }
  static func startIfRequested() {
    let cameraMode = ProcessInfo.processInfo.arguments.contains("--local-memory-camera-qa")
    guard ProcessInfo.processInfo.arguments.contains("--local-memory-qa") || cameraMode else { return }
    store.lock.lock()
    guard !store.started else { store.lock.unlock(); return }
    store.started = true; store.start = ProcessInfo.processInfo.systemUptime
    store.cameraMode = cameraMode; store.maximumRows = cameraMode ? 3000 : 900
    let timer = DispatchSource.makeTimerSource(queue: queue)
    store.timer = timer; store.lock.unlock()
    timer.schedule(deadline: .now(), repeating: .milliseconds(100))
    timer.setEventHandler { store.lock.lock(); appendLocked(event: false); store.lock.unlock() }
    timer.resume()
    #if os(iOS)
    if cameraMode {
      for (name, phase) in [(AVCaptureSession.didStartRunningNotification, "camera_started"), (AVCaptureSession.didStopRunningNotification, "camera_stopped")] {
        let observer = NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { _ in
          if phase == "camera_started" { store.lock.lock(); store.cameraStarts += 1; store.lock.unlock() }
          note(phase)
        }
        store.lock.lock(); store.observers.append(observer); store.lock.unlock()
      }
    }
    DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }
    #endif
    // Work is on a separate queue: do not block the sampling queue on callbacks.
    DispatchQueue.global(qos: .userInitiated).async { run() }
  }
  private struct Manifest: Decodable { let run: String; let sha256: String }
  private final class ResultBox: @unchecked Sendable {
    let ready = DispatchSemaphore(value: 0), lock = NSLock()
    var value: Result<String, LocalVisionFailure>?
    func accept(_ result: Result<String, LocalVisionFailure>) { lock.lock(); value = result; lock.unlock(); ready.signal() }
    func take() throws -> String { lock.lock(); defer { lock.unlock() }; return try value!.get() }
  }
  private static func run() {
    let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    var output = folder.appendingPathComponent("kig-memory-attribution-start-failed.json")
    var runID = "unstarted"
    var failure = false, released = 0, reliefMs: Double = 0
    do {
      guard let url = Bundle.main.url(forResource: "KierratysMemoryProbeAssets", withExtension: "bundle"),
        let bundle = Bundle(url: url)?.resourceURL else { throw LocalVisionFailure.unavailable }
      let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: bundle.appendingPathComponent("manifest.json")))
      guard !manifest.run.contains(".."), manifest.run.range(of: "^[A-Za-z0-9._-]{1,96}$", options: .regularExpression) != nil else { throw LocalVisionFailure.invalidImage }
      runID = manifest.run + (store.cameraMode ? "-camera" : "")
      let runFolder = folder.appendingPathComponent("kig-memory-\(runID)", isDirectory: true)
      try FileManager.default.createDirectory(at: runFolder, withIntermediateDirectories: false)
      output = runFolder.appendingPathComponent("report.json")
      try Data("exclusive memory probe".utf8).write(to: runFolder.appendingPathComponent("started"), options: .withoutOverwriting)
      let bytes = try Data(contentsOf: bundle.appendingPathComponent("fixture.jpg"))
      guard manifest.sha256 == "42b5de1f7b4880645efef9237399a9268ce54e6c8784fca11b3a98ed7d8edf71",
        bytes.count <= 1_500_000, SHA256.hash(data: bytes).map({ String(format: "%02x", $0) }).joined() == manifest.sha256 else { throw LocalVisionFailure.invalidImage }
      Thread.sleep(forTimeInterval: 12)
      note("warm_home")
      try JSONSerialization.data(withJSONObject: ["ready": true, "run": runID]).write(to: runFolder.appendingPathComponent("ready.json"), options: .withoutOverwriting)
      if store.cameraMode {
        try cameraWindow()
      } else {
      let ready = DispatchSemaphore(value: 0)
      LocalVisionEngine.shared.inspectReadiness { _ in ready.signal() }
      guard ready.wait(timeout: .now() + 15) == .success else { throw LocalVisionFailure.timeout }
      note("after_readiness")
      for cycle in 1...3 {
        note("cycle_\(cycle)_start")
        try autoreleasepool {
          let primary = ResultBox()
          LocalVisionEngine.shared.referencePort(.productEvidence, input: bytes.base64EncodedString(), completion: primary.accept)
          guard primary.ready.wait(timeout: .now() + 15) == .success else { throw LocalVisionFailure.timeout }
          _ = try primary.take()
          let objects = ResultBox()
          LocalVisionEngine.shared.recognizeObjectCandidates(input: bytes.base64EncodedString(), requestID: UUID().uuidString, timeoutMs: 12000, completion: objects.accept)
          guard objects.ready.wait(timeout: .now() + 15) == .success else { throw LocalVisionFailure.timeout }
          let raw = try objects.take()
          guard let object = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any], let scores = object["scores"] as? [[String: Any]], scores.count == 15 else { throw LocalVisionFailure.failed }
          let scoreBytes = try JSONSerialization.data(withJSONObject: scores, options: [.sortedKeys])
          store.lock.lock(); store.scoreHashes.append(SHA256.hash(data: scoreBytes).map { String(format: "%02x", $0) }.joined()); store.lock.unlock()
        }
        note("cycle_\(cycle)_returned")
        Thread.sleep(forTimeInterval: 4)
        note("cycle_\(cycle)_settled")
      }
      Thread.sleep(forTimeInterval: 12)
      note("before_relief")
      let start = ProcessInfo.processInfo.systemUptime
      released = malloc_zone_pressure_relief(nil, 0)
      reliefMs = (ProcessInfo.processInfo.systemUptime - start) * 1000
      note("after_relief")
      Thread.sleep(forTimeInterval: 4)
      note("relief_settled")
      }
    } catch { failure = true; note("probe_failed") }
    store.lock.lock()
    store.timer?.cancel(); store.timer = nil
    let report: [String: Any] = ["schema": "memory-attribution-v1", "run": runID, "failure": failure,
      "rows": store.rows, "forwards": store.forwards, "scoreHashes": store.scoreHashes,
      "reliefReleased": released, "reliefMs": reliefMs, "cameraVerified": false,
      "cameraMode": store.cameraMode, "cameraStarts": store.cameraStarts]
    let observers = store.observers; store.observers = []
    store.lock.unlock()
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    do { try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]).write(to: output, options: .withoutOverwriting) } catch { /* never persist untrusted errors */ }
    #if os(iOS)
    DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
    #endif
  }
  private static func cameraWindow() throws {
    let deadline = ProcessInfo.processInfo.systemUptime + 210
    var done = false
    while ProcessInfo.processInfo.systemUptime < deadline {
      store.lock.lock(); done = store.forwards["siglip"] == 3; store.lock.unlock()
      if done { break }
      Thread.sleep(forTimeInterval: 0.2)
    }
    guard done else { throw LocalVisionFailure.timeout }
    note("camera_three_completed")
    Thread.sleep(forTimeInterval: 5)
    #if os(iOS)
    DispatchQueue.main.async { UIApplication.shared.open(URL(string: "kierratysappi:///")!) }
    #endif
    note("camera_home_requested")
    Thread.sleep(forTimeInterval: 20)
    note("camera_home_settled")
  }
}
#endif
