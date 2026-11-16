import Foundation
import CryptoKit

@available(macOS 15.0, *)
@main struct SiglipNativeQA {
  static func main() throws {
    let args = CommandLine.arguments
    guard args.count == 4, args[1] == "preprocess" else { throw SiglipInputFailure.invalidImage }
    let tensor = try SiglipImageEncoder.preprocess(imageData: Data(contentsOf: URL(fileURLWithPath: args[2])))
    let bytes = tensor.withUnsafeBytes { Data($0) }
    try bytes.write(to: URL(fileURLWithPath: args[3]), options: .withoutOverwriting)
    print(bytes.count)
  }
}
