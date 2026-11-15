// Generated decoder fixture, NOT a photograph or an independent product sample.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let args = Array(CommandLine.arguments.dropFirst())
guard args.count == 2, args[0].count == 13, args[0].allSatisfy({ $0.isASCII && $0.isNumber }),
      !FileManager.default.fileExists(atPath: args[1]) else { fatalError("new-output-and-13-digits-required") }
let digits = args[0].compactMap { $0.wholeNumberValue }
let left = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]
let parity = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]
func invert(_ s: String) -> String { String(s.map { $0 == "0" ? "1" : "0" }) }
var bits = "00000000000101"
for (i, mode) in parity[digits[0]].enumerated() {
  let code = left[digits[i + 1]]
  bits += mode == "L" ? code : String(invert(code).reversed())
}
bits += "01010"
for digit in digits[7...] { bits += invert(left[digit]) }
bits += "10100000000000"
let width = bits.count * 4, height = 320
let colour = CGColorSpaceCreateDeviceRGB()
let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: colour, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: width, height: height))
context.setFillColor(CGColor(gray: 0, alpha: 1))
for (i, bit) in bits.enumerated() where bit == "1" { context.fill(CGRect(x: i * 4, y: 60, width: 4, height: 200)) }
let image = context.makeImage()!
let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary)
guard CGImageDestinationFinalize(destination) else { fatalError("write-failed") }
