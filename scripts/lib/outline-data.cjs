const fs = require('fs');
const path = require('path');

const outlineCache = new Map();
const crossReferenceCache = new Map();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listJsonFiles(dirPath) {
  return fs.readdirSync(dirPath).filter((file) => file.endsWith('.json')).sort();
}

function defaultRoot() {
  return path.resolve(__dirname, '../..');
}

function loadOutline(rootDir = defaultRoot()) {
  if (outlineCache.has(rootDir)) {
    return outlineCache.get(rootDir);
  }

  const partsDir = path.join(rootDir, 'src/content/parts');
  const divisionsDir = path.join(rootDir, 'src/content/divisions');
  const sectionsDir = path.join(rootDir, 'src/content/sections');

  const partEntries = listJsonFiles(partsDir)
    .map((file) => readJson(path.join(partsDir, file)))
    .sort((a, b) => a.partNumber - b.partNumber);
  const divisionEntries = listJsonFiles(divisionsDir)
    .map((file) => readJson(path.join(divisionsDir, file)))
    .sort((a, b) => a.partNumber - b.partNumber || a.divisionId.localeCompare(b.divisionId, undefined, { numeric: true }));
  const sectionEntries = listJsonFiles(sectionsDir)
    .map((file) => readJson(path.join(sectionsDir, file)))
    .sort((a, b) => a.partNumber - b.partNumber || a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true }));

  const divisionsById = new Map(divisionEntries.map((entry) => [entry.divisionId, entry]));
  const sectionsByCode = new Map(sectionEntries.map((entry) => [entry.sectionCode, entry]));

  const parts = partEntries.map((part) => ({
    partNumber: part.partNumber,
    title: part.title,
    divisions: (part.divisions || []).map((divisionId) => {
      const division = divisionsById.get(divisionId);
      if (!division) {
        throw new Error(`Unknown division '${divisionId}' referenced by part ${part.partNumber}`);
      }

      return {
        divisionId: division.divisionId,
        romanNumeral: division.romanNumeral,
        title: division.title,
        sections: (division.sections || []).map((sectionCode) => {
          const section = sectionsByCode.get(sectionCode);
          if (!section) {
            throw new Error(`Unknown section '${sectionCode}' referenced by division ${division.divisionId}`);
          }

          return {
            sectionCode: section.sectionCode,
            title: section.title,
          };
        }),
      };
    }),
  }));

  const sectionToPart = {};
  const sectionToDivision = {};
  const divisionSectionCount = {};

  for (const part of parts) {
    for (const division of part.divisions) {
      divisionSectionCount[division.divisionId] = division.sections.length;
      for (const section of division.sections) {
        sectionToPart[section.sectionCode] = part.partNumber;
        sectionToDivision[section.sectionCode] = division.divisionId;
      }
    }
  }

  const outline = {
    parts,
    divisions: divisionEntries,
    sections: sectionEntries,
    sectionToPart,
    sectionToDivision,
    divisionSectionCount,
  };

  outlineCache.set(rootDir, outline);
  return outline;
}

function buildTaxonomyText(rootDir = defaultRoot()) {
  const outline = loadOutline(rootDir);
  const lines = [];

  for (const part of outline.parts) {
    lines.push(`Part ${part.partNumber}: ${part.title}`);
    for (const division of part.divisions) {
      lines.push(`  Division ${division.romanNumeral}: ${division.title}`);
      for (const section of division.sections) {
        lines.push(`    Section ${section.sectionCode}: ${section.title}`);
      }
    }
  }

  return lines.join('\n');
}

function loadCrossReferences(rootDir = defaultRoot()) {
  if (crossReferenceCache.has(rootDir)) {
    return crossReferenceCache.get(rootDir);
  }

  const outline = loadOutline(rootDir);
  const references = [];

  for (const section of outline.sections) {
    for (const reference of section.crossReferences || []) {
      references.push({
        sourceSection: section.sectionCode,
        targetSection: reference.targetSection,
        sourcePath: reference.fromPath || '',
        targetPath: reference.targetPath || '',
      });
    }
  }

  crossReferenceCache.set(rootDir, references);
  return references;
}

module.exports = {
  buildTaxonomyText,
  loadCrossReferences,
  loadOutline,
};
