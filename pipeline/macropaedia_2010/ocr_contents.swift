import AppKit
import Foundation
import ImageIO
import Vision

struct BoundingBox: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let midX: Double
    let midY: Double
}

struct OCRLine: Codable {
    let text: String
    let confidence: Double
    let boundingBox: BoundingBox
    let uprightBoundingBox: BoundingBox
}

struct OrientationScore: Codable {
    let orientation: String
    let score: Double
    let lineCount: Int
    let averageConfidence: Double
    let sample: [String]
}

struct OCRLinesPayload: Codable {
    let sourceImage: String
    let orientation: String
    let imageWidth: Int
    let imageHeight: Int
    let lines: [OCRLine]
}

struct ImageManifestEntry: Codable {
    let volumeNumber: Int
    let relativePath: String
    let width: Int
    let height: Int
    let chosenOrientation: String
    let orientationScores: [OrientationScore]
    let ocrTextPath: String
    let ocrLinesPath: String
}

struct ManifestPayload: Codable {
    let sourceDirectory: String
    let imageCount: Int
    let images: [ImageManifestEntry]
}

let supportedExtensions = Set(["jpg", "jpeg", "png", "tif", "tiff", "heic", "heif", "webp"])

func parseArguments() -> (inputDir: String, outputDir: String) {
    var inputDir = "Macropaedia 2010"
    var outputDir = "pipeline/output/macropaedia_2010"

    var iterator = CommandLine.arguments.dropFirst().makeIterator()
    while let arg = iterator.next() {
        switch arg {
        case "--input-dir":
            if let value = iterator.next() {
                inputDir = value
            }
        case "--output-dir":
            if let value = iterator.next() {
                outputDir = value
            }
        default:
            break
        }
    }

    return (inputDir, outputDir)
}

func normalizeWhitespace(_ text: String) -> String {
    text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
}

func scoreLines(_ lines: [OCRLine]) -> Double {
    guard !lines.isEmpty else { return 0 }

    let normalized = lines.map { normalizeWhitespace($0.text) }
    let averageConfidence = lines.map(\.confidence).reduce(0, +) / Double(lines.count)

    var score = averageConfidence * 200
    score += Double(lines.count) * 1.5

    if normalized.contains(where: { $0.uppercased() == "CONTENTS" }) {
        score += 120
    }

    for line in normalized {
        if line.range(of: #"^\d{1,4}\s+[A-Z]"#, options: .regularExpression) != nil {
            score += 18
        }
        if line.range(of: #"^[A-Z][A-Z0-9 ,;:'()\/.-]{4,}$"#, options: .regularExpression) != nil {
            score += 8
        }
        if line.range(of: #"^\d{1,4}$"#, options: .regularExpression) != nil {
            score += 2
        }
        if line.count <= 1 {
            score -= 6
        }
    }

    return score
}

func transformBoundingBox(
    _ box: BoundingBox,
    orientationLabel: String,
    imageWidth: Int,
    imageHeight: Int
) -> BoundingBox {
    if imageWidth > imageHeight && (orientationLabel == "left" || orientationLabel == "right") {
        return box
    }

    switch orientationLabel {
    case "up":
        return box
    case "down":
        return BoundingBox(
            x: 1 - (box.x + box.width),
            y: 1 - (box.y + box.height),
            width: box.width,
            height: box.height,
            midX: 1 - box.midX,
            midY: 1 - box.midY
        )
    case "left":
        return BoundingBox(
            x: box.y,
            y: 1 - (box.x + box.width),
            width: box.height,
            height: box.width,
            midX: box.midY,
            midY: 1 - box.midX
        )
    case "right":
        return BoundingBox(
            x: 1 - (box.y + box.height),
            y: box.x,
            width: box.height,
            height: box.width,
            midX: 1 - box.midY,
            midY: box.midX
        )
    default:
        return box
    }
}

func recognize(cgImage: CGImage, orientation: CGImagePropertyOrientation) throws -> [OCRLine] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
    try handler.perform([request])

    let observations = request.results ?? []

    return observations.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let text = normalizeWhitespace(candidate.string)
        guard !text.isEmpty else { return nil }
        let box = observation.boundingBox
        return OCRLine(
            text: text,
            confidence: Double(candidate.confidence),
            boundingBox: BoundingBox(
                x: Double(box.origin.x),
                y: Double(box.origin.y),
                width: Double(box.size.width),
                height: Double(box.size.height),
                midX: Double(box.midX),
                midY: Double(box.midY)
            ),
            uprightBoundingBox: BoundingBox(
                x: Double(box.origin.x),
                y: Double(box.origin.y),
                width: Double(box.size.width),
                height: Double(box.size.height),
                midX: Double(box.midX),
                midY: Double(box.midY)
            )
        )
    }
}

func writeJSON<T: Encodable>(_ value: T, to url: URL) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(value)
    try data.write(to: url)
}

let args = parseArguments()
let fileManager = FileManager.default
let repoRoot = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let inputURL = repoRoot.appendingPathComponent(args.inputDir)
let outputURL = repoRoot.appendingPathComponent(args.outputDir)
let ocrTextURL = outputURL.appendingPathComponent("ocr", isDirectory: true)
let ocrLinesURL = outputURL.appendingPathComponent("ocr_lines", isDirectory: true)

try fileManager.createDirectory(at: outputURL, withIntermediateDirectories: true)
try fileManager.createDirectory(at: ocrTextURL, withIntermediateDirectories: true)
try fileManager.createDirectory(at: ocrLinesURL, withIntermediateDirectories: true)

guard let enumerator = fileManager.enumerator(at: inputURL, includingPropertiesForKeys: nil) else {
    fputs("Unable to scan input directory: \(inputURL.path)\n", stderr)
    exit(1)
}

let imageURLs = (enumerator.allObjects as? [URL] ?? [])
    .filter { supportedExtensions.contains($0.pathExtension.lowercased()) }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

let orientations: [(label: String, value: CGImagePropertyOrientation)] = [
    ("up", .up),
    ("right", .right),
    ("left", .left),
    ("down", .down),
]

var manifestEntries: [ImageManifestEntry] = []

for (index, imageURL) in imageURLs.enumerated() {
    guard let image = NSImage(contentsOf: imageURL) else {
        fputs("Failed to load image: \(imageURL.path)\n", stderr)
        continue
    }

    var rect = NSRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        fputs("Failed to create CGImage: \(imageURL.path)\n", stderr)
        continue
    }

    var scoredOrientations: [(OrientationScore, [OCRLine])] = []

    for orientation in orientations {
        let lines = try recognize(cgImage: cgImage, orientation: orientation.value)
        let avgConfidence = lines.isEmpty ? 0 : lines.map(\.confidence).reduce(0, +) / Double(lines.count)
        let score = scoreLines(lines)
        let sample = Array(lines.prefix(8).map(\.text))

        scoredOrientations.append((
            OrientationScore(
                orientation: orientation.label,
                score: score,
                lineCount: lines.count,
                averageConfidence: avgConfidence,
                sample: sample
            ),
            lines
        ))
    }

    scoredOrientations.sort { left, right in
        if left.0.score != right.0.score { return left.0.score > right.0.score }
        return left.0.lineCount > right.0.lineCount
    }

    guard let best = scoredOrientations.first else { continue }

    let uprightLines = best.1.map { line in
        OCRLine(
            text: line.text,
            confidence: line.confidence,
            boundingBox: line.boundingBox,
            uprightBoundingBox: transformBoundingBox(
                line.boundingBox,
                orientationLabel: best.0.orientation,
                imageWidth: cgImage.width,
                imageHeight: cgImage.height
            )
        )
    }
    let orderedUprightLines = uprightLines.sorted { left, right in
        if left.uprightBoundingBox.midY != right.uprightBoundingBox.midY {
            return left.uprightBoundingBox.midY > right.uprightBoundingBox.midY
        }
        return left.uprightBoundingBox.midX < right.uprightBoundingBox.midX
    }

    let stem = imageURL.deletingPathExtension().lastPathComponent
    let textFilename = "\(stem).txt"
    let linesFilename = "\(stem).json"
    let textPath = ocrTextURL.appendingPathComponent(textFilename)
    let linesPath = ocrLinesURL.appendingPathComponent(linesFilename)

    let rawText = orderedUprightLines.map(\.text).joined(separator: "\n") + "\n"
    try rawText.write(to: textPath, atomically: true, encoding: .utf8)
    try writeJSON(
        OCRLinesPayload(
            sourceImage: imageURL.path.replacingOccurrences(of: repoRoot.path + "/", with: ""),
            orientation: best.0.orientation,
            imageWidth: cgImage.width,
            imageHeight: cgImage.height,
            lines: uprightLines
        ),
        to: linesPath
    )

    manifestEntries.append(
        ImageManifestEntry(
            volumeNumber: index + 1,
            relativePath: imageURL.path.replacingOccurrences(of: repoRoot.path + "/", with: ""),
            width: cgImage.width,
            height: cgImage.height,
            chosenOrientation: best.0.orientation,
            orientationScores: scoredOrientations.map(\.0),
            ocrTextPath: textPath.path.replacingOccurrences(of: repoRoot.path + "/", with: ""),
            ocrLinesPath: linesPath.path.replacingOccurrences(of: repoRoot.path + "/", with: "")
        )
    )

    print("OCR volume \(index + 1): \(imageURL.lastPathComponent) -> \(best.0.orientation)")
}

let manifest = ManifestPayload(
    sourceDirectory: args.inputDir,
    imageCount: manifestEntries.count,
    images: manifestEntries
)
try writeJSON(manifest, to: outputURL.appendingPathComponent("manifest.json"))
print("Wrote manifest with \(manifestEntries.count) images to \(outputURL.appendingPathComponent("manifest.json").path)")
