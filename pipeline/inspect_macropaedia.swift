import Foundation
import PDFKit

struct SectionData {
    let code: String
    let currentRefs: [String]
}

func clean(_ text: String) -> String {
    var result = text.replacingOccurrences(of: "\u{0}", with: "")
    result = result.replacingOccurrences(of: "\n", with: " ")
    result = result.replacingOccurrences(of: "  ", with: " ")
    result = result.trimmingCharacters(in: .whitespacesAndNewlines)
    result = result.replacingOccurrences(of: #"\s+,"#, with: ",", options: .regularExpression)
    result = result.replacingOccurrences(of: #"\s+\."#, with: ".", options: .regularExpression)
    result = result.replacingOccurrences(of: "H ungary", with: "Hungary")
    return result
}

func normalize(_ text: String) -> String {
    let lower = clean(text).lowercased()
    let replaced = lower.replacingOccurrences(
        of: #"[^a-z0-9]+"#,
        with: " ",
        options: .regularExpression
    )
    return replaced
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func likelyContinuation(current: String, next: String) -> Bool {
    let currentLower = current.lowercased()
    let nextLower = next.lowercased()
    let nextWords = next.split(separator: " ").count
    let continuationStarts = ["and ", "of ", "the ", "their ", "its ", "from "]
    if continuationStarts.contains(where: { nextLower.hasPrefix($0) }) { return true }
    if current == "Ancient" { return true }
    if (currentLower.contains(", the history of") || currentLower.contains(" history of the")) &&
        current.split(separator: " ").count <= 5 && nextWords == 1 {
        return true
    }
    if current.hasSuffix(".") || current.hasSuffix(":") || current.hasSuffix(";") { return true }
    if currentLower.hasSuffix(" and") || currentLower.hasSuffix(" the") { return true }
    if currentLower.hasSuffix(", the") || currentLower.hasSuffix(", their") || currentLower.hasSuffix(", its") {
        return true
    }

    let exactFragments: Set<String> = [
        "Geometry",
        "Republics",
        "Knowledge",
        "Culture",
        "Cultures",
        "Systems",
        "Ancient Anatolia",
        "Information Systems",
        "The History of",
        "History of the",
        "The Foundations of",
        "The Study of",
        "The Mathematical Theory of",
        "and Culture",
        "and Cultures",
        "of Russia",
        "Civilizations,",
        "Eurasian"
    ]
    if exactFragments.contains(next) { return true }
    if nextLower.hasPrefix("ancient ") || nextLower.hasPrefix("modern ") ||
        nextLower.hasPrefix("western ") || nextLower.hasPrefix("eastern ") {
        return true
    }

    if let lastWord = current.split(separator: " ").last {
        let lowerLastWord = lastWord.lowercased()
        let adjectivalEndings = ["al", "ial", "ical"]
        if adjectivalEndings.contains(where: { lowerLastWord.hasSuffix($0) }) && nextWords <= 2 {
            return true
        }
    }

    if current.split(separator: " ").count <= 3 && nextWords == 1 {
        let nounFragments = ["geometry", "republics", "knowledge", "culture", "cultures", "systems"]
        if nounFragments.contains(nextLower) { return true }
    }

    return false
}

func mergeTitle(_ current: String, _ next: String) -> String {
    var lhs = current
    if lhs.hasSuffix(".") && next.lowercased().hasPrefix("the ") {
        lhs.removeLast()
        lhs += ","
    }
    return clean(lhs + " " + next)
}

func clusterStarts(page: PDFPage, y1: CGFloat, y2: CGFloat) -> [Int] {
    let width = Int(page.bounds(for: .mediaBox).width)
    var occupied: [Int] = []
    for x in stride(from: 40, through: width - 20, by: 5) {
        let rect = CGRect(x: CGFloat(x), y: y1, width: 4, height: y2 - y1)
        let hasText = !(page.selection(for: rect)?.string?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty ?? true)
        if hasText {
            occupied.append(x)
        }
    }

    var starts: [Int] = []
    var rangeStart: Int?
    var previous: Int?
    for x in occupied {
        if rangeStart == nil {
            rangeStart = x
            previous = x
            continue
        }
        if x - previous! <= 10 {
            previous = x
            continue
        }
        if let start = rangeStart, let end = previous, end - start >= 15 {
            starts.append(start)
        }
        rangeStart = x
        previous = x
    }
    if let start = rangeStart, let end = previous, end - start >= 15 {
        starts.append(start)
    }
    return starts
}

func extractColumnFragments(page: PDFPage, crop: CGRect) -> [String] {
    let lines = (page.selection(for: crop)?.selectionsByLine() ?? [])
        .map { ($0.bounds(for: page), clean($0.string ?? "")) }
        .filter { !$0.1.isEmpty }
        .sorted { $0.0.origin.y > $1.0.origin.y }
    return lines.map { $0.1 }
}

func groupedTitles(from fragments: [String]) -> [String] {
    var titles: [String] = []
    var index = 0
    while index < fragments.count {
        var current = fragments[index]
        while index + 1 < fragments.count && likelyContinuation(current: current, next: fragments[index + 1]) {
            current = mergeTitle(current, fragments[index + 1])
            index += 1
        }
        let normalized = current.hasSuffix(",") ? String(current.dropLast()) : current
        titles.append(normalized)
        index += 1
    }
    return titles
}

func locateMacroPage(doc: PDFDocument, refs: [String]) -> Int? {
    let needles = refs.map(normalize).filter { $0.count >= 5 }
    var bestPage: Int?
    var bestScore = 0

    for index in 0..<doc.pageCount {
        guard let text = doc.page(at: index)?.string,
              text.contains("MACROPAEDIA:") || text.contains("macropaedia:") else {
            continue
        }
        let normalizedPage = normalize(text)
        var score = 0
        for needle in needles where normalizedPage.contains(needle) {
            score += min(needle.count, 40)
        }
        if score > bestScore {
            bestScore = score
            bestPage = index
        }
    }
    return bestPage
}

func extractRefs(doc: PDFDocument, pageIndex: Int) -> [String] {
    guard let page = doc.page(at: pageIndex) else { return [] }
    let pageLines = (page.selection(for: page.bounds(for: .mediaBox))?.selectionsByLine() ?? [])
        .map { ($0.bounds(for: page), clean($0.string ?? "")) }
        .filter { !$0.1.isEmpty }

    guard let macroLine = pageLines.first(where: { $0.1.contains("MACROPAEDIA:") || $0.1.contains("macropaedia:") }),
          let microLine = pageLines.first(where: { $0.1.contains("MICROPAEDIA:") || $0.1.contains("micropaedia:") }) else {
        return []
    }

    let y1 = microLine.0.origin.y + 10
    let y2 = macroLine.0.origin.y - 8
    let starts = clusterStarts(page: page, y1: y1, y2: y2)

    var titles: [String] = []
    for (index, start) in starts.enumerated() {
        let width: CGFloat
        if starts.count == 1 {
            width = min(220, page.bounds(for: .mediaBox).width - CGFloat(start) - 30)
        } else if index + 1 < starts.count {
            width = min(120, CGFloat(starts[index + 1] - start - 10))
        } else {
            width = 120
        }
        let crop = CGRect(
            x: CGFloat(start - 10),
            y: y1,
            width: max(60, width),
            height: y2 - y1
        )
        titles.append(contentsOf: groupedTitles(from: extractColumnFragments(page: page, crop: crop)))
    }
    return titles
}

func sectionPath(for code: String) -> URL {
    let filename = code.replacingOccurrences(of: "/", with: "-") + ".json"
    return URL(fileURLWithPath: "src/content/sections").appendingPathComponent(filename)
}

func loadSection(code: String) throws -> SectionData {
    let data = try Data(contentsOf: sectionPath(for: code))
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let refs = json?["macropaediaReferences"] as? [String] ?? []
    return SectionData(code: code, currentRefs: refs)
}

let codes = Array(CommandLine.arguments.dropFirst())
guard !codes.isEmpty else {
    fputs("Usage: swift pipeline/inspect_macropaedia.swift <section-code> [<section-code> ...]\n", stderr)
    exit(1)
}

let pdfURL = URL(fileURLWithPath: "propaedia_date_unknown.pdf")
guard let document = PDFDocument(url: pdfURL) else {
    fputs("Unable to open \(pdfURL.path)\n", stderr)
    exit(1)
}

for code in codes {
    do {
        let section = try loadSection(code: code)
        let pageIndex = locateMacroPage(doc: document, refs: section.currentRefs)
        let extracted = pageIndex.map { extractRefs(doc: document, pageIndex: $0) } ?? []

        print("SECTION \(section.code)")
        if let pageIndex {
            print("PAGE \(pageIndex + 1)")
        } else {
            print("PAGE not found")
        }
        print("CURRENT")
        for ref in section.currentRefs {
            print("- \(ref)")
        }
        print("EXTRACTED")
        for ref in extracted {
            print("- \(ref)")
        }
        print("---")
    } catch {
        fputs("Failed to inspect \(code): \(error)\n", stderr)
    }
}
