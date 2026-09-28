// Extracts every video frame in [from, to] seconds as PNG.
// usage: swift scripts/extract-frames.swift <video> <outDir> <from> <to>
import AVFoundation
import AppKit

let args = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let outDir = args[2]
let from = Double(args[3])!
let to = Double(args[4])!

let track = asset.tracks(withMediaType: .video)[0]
let fps = Double(track.nominalFrameRate)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

let first = Int((from * fps).rounded())
let last = min(Int((to * fps).rounded()), Int(CMTimeGetSeconds(asset.duration) * fps) - 1)
for (i, frame) in (first...last).enumerated() {
  // Sample the middle of the frame interval to avoid landing on a boundary.
  let t = CMTime(value: CMTimeValue(frame * 2 + 1), timescale: CMTimeScale(fps * 2))
  let img = try gen.copyCGImage(at: t, actualTime: nil)
  let png = NSBitmapImageRep(cgImage: img).representation(using: .png, properties: [:])!
  try png.write(to: URL(fileURLWithPath: String(format: "%@/%03d.png", outDir, i)))
}
print("fps=\(fps) frames=\(first)...\(last)")
