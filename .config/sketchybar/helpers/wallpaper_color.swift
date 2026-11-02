// Averages the top strip of the current wallpaper — the pixels the bar sits over.
// Prints: <avgHex> <luminance 0..1>
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count > 1, let img = NSImage(contentsOfFile: args[1]),
      let tiff = img.tiffRepresentation, let bmp = NSBitmapImageRep(data: tiff) else {
    print("000000 0.0"); exit(1)
}
let stripFrac = args.count > 2 ? (Double(args[2]) ?? 0.033) : 0.033
let w = bmp.pixelsWide, h = bmp.pixelsHigh
let stripH = max(1, Int(Double(h) * stripFrac))
var r = 0.0, g = 0.0, b = 0.0, n = 0.0
let stepX = max(1, w / 200), stepY = max(1, stripH / 20)
for y in stride(from: 0, to: stripH, by: stepY) {
    for x in stride(from: 0, to: w, by: stepX) {
        guard let c = bmp.colorAt(x: x, y: y) else { continue }
        r += Double(c.redComponent); g += Double(c.greenComponent); b += Double(c.blueComponent); n += 1
    }
}
guard n > 0 else { print("000000 0.0"); exit(1) }
r /= n; g /= n; b /= n
func lin(_ c: Double) -> Double { c <= 0.03928 ? c/12.92 : pow((c+0.055)/1.055, 2.4) }
let lum = 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
print(String(format: "%02x%02x%02x %.4f", Int(r*255), Int(g*255), Int(b*255), lum))
