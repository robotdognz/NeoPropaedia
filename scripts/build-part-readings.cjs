#!/usr/bin/env node
/**
 * Generates per-part and per-division reading recommendation files
 * as individual JSON files in content collections.
 *
 * Part-level: only includes items that appear in multiple divisions within the part.
 *   "count" = number of divisions the item appears in.
 * Division-level: only includes items that appear in multiple sections within the division.
 *   "count" = number of sections the item appears in.
 *
 * Output:
 *   src/content/part-readings/part-01.json through part-10.json
 *   src/content/division-readings/div-1-01.json through div-10-06.json
 *
 * Usage: node scripts/build-part-readings.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NAV_PATH = path.join(ROOT, 'src/data/navigation.json');
const VSI_MAPPINGS_DIR = path.join(ROOT, 'src/content/vsi-mappings');
const WIKI_MAPPINGS_DIR = path.join(ROOT, 'src/content/wiki-mappings');
const SECTIONS_DIR = path.join(ROOT, 'src/content/sections');
const PART_OUTPUT_DIR = path.join(ROOT, 'src/content/part-readings');
const DIV_OUTPUT_DIR = path.join(ROOT, 'src/content/division-readings');

// Ensure output directories exist
for (const dir of [PART_OUTPUT_DIR, DIV_OUTPUT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Build lookups
const navigation = JSON.parse(fs.readFileSync(NAV_PATH, 'utf8'));
const sectionToPart = {};
const sectionToDivision = {};
for (const part of navigation.parts) {
  for (const div of part.divisions) {
    for (const sec of div.sections) {
      sectionToPart[sec.sectionCode] = part.partNumber;
      sectionToDivision[sec.sectionCode] = div.divisionId;
    }
  }
}

/**
 * Build an index tracking which sections and divisions each title appears in,
 * plus total outline path count for ranking depth.
 */
function buildIndex(mappingsDir, getKey, getAuthor, getPathCount) {
  const index = new Map();
  const files = fs.readdirSync(mappingsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(mappingsDir, file), 'utf8'));
    const sectionCode = data.sectionCode;
    const partNumber = sectionToPart[sectionCode];
    const divisionId = sectionToDivision[sectionCode];
    if (!partNumber || !divisionId) continue;

    for (const mapping of data.mappings || []) {
      const key = getKey(mapping);
      if (!key) continue;
      const pathCount = getPathCount ? getPathCount(mapping) : 1;

      if (!index.has(key)) {
        index.set(key, {
          author: getAuthor ? getAuthor(mapping) : undefined,
          divisions: {},        // partNumber -> Set<divisionId>
          partSections: {},     // partNumber -> Set<sectionCode>
          partPaths: {},        // partNumber -> total outline path count
          divSections: {},      // divisionId -> Set<sectionCode>
          divPaths: {},         // divisionId -> total outline path count
        });
      }
      const entry = index.get(key);

      // Part-level tracking
      if (!entry.divisions[partNumber]) entry.divisions[partNumber] = new Set();
      entry.divisions[partNumber].add(divisionId);
      if (!entry.partSections[partNumber]) entry.partSections[partNumber] = new Set();
      entry.partSections[partNumber].add(sectionCode);
      entry.partPaths[partNumber] = (entry.partPaths[partNumber] || 0) + pathCount;

      // Division-level tracking
      if (!entry.divSections[divisionId]) entry.divSections[divisionId] = new Set();
      entry.divSections[divisionId].add(sectionCode);
      entry.divPaths[divisionId] = (entry.divPaths[divisionId] || 0) + pathCount;
    }
  }

  return index;
}

function buildMacroIndex() {
  const index = new Map();
  const files = fs.readdirSync(SECTIONS_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8'));
    const sectionCode = data.sectionCode;
    const partNumber = sectionToPart[sectionCode];
    const divisionId = sectionToDivision[sectionCode];
    if (!partNumber || !divisionId) continue;

    for (const ref of data.macropaediaReferences || []) {
      if (!index.has(ref)) {
        index.set(ref, { divisions: {}, partSections: {}, partPaths: {}, divSections: {}, divPaths: {} });
      }
      const entry = index.get(ref);

      if (!entry.divisions[partNumber]) entry.divisions[partNumber] = new Set();
      entry.divisions[partNumber].add(divisionId);
      if (!entry.partSections[partNumber]) entry.partSections[partNumber] = new Set();
      entry.partSections[partNumber].add(sectionCode);
      entry.partPaths[partNumber] = (entry.partPaths[partNumber] || 0) + 1;

      if (!entry.divSections[divisionId]) entry.divSections[divisionId] = new Set();
      entry.divSections[divisionId].add(sectionCode);
      entry.divPaths[divisionId] = (entry.divPaths[divisionId] || 0) + 1;
    }
  }

  return index;
}

const vsiIndex = buildIndex(VSI_MAPPINGS_DIR, m => m.vsiTitle, m => m.vsiAuthor, m => (m.relevantPathsAI || []).length || 1);
const wikiIndex = buildIndex(WIKI_MAPPINGS_DIR, m => m.articleTitle, null, m => (m.relevantPathsAI || []).length || 1);
const macroIndex = buildMacroIndex();

// Part-level: items appearing in 2+ divisions within the part
// Ranked by: divisions count (primary), sections count (secondary), outline paths (tertiary)
function partItems(index, partNumber, hasAuthor) {
  const items = [];
  for (const [title, entry] of index) {
    const divs = entry.divisions[partNumber];
    if (!divs || divs.size < 2) continue;
    const sectionCount = entry.partSections[partNumber]?.size || 0;
    const pathCount = entry.partPaths[partNumber] || 0;
    const item = { title, count: divs.size, sections: sectionCount, paths: pathCount };
    if (hasAuthor && entry.author) item.author = entry.author;
    items.push(item);
  }
  items.sort((a, b) =>
    b.count - a.count ||
    b.sections - a.sections ||
    b.paths - a.paths ||
    a.title.localeCompare(b.title)
  );
  return items;
}

// Division-level: items appearing in 2+ sections within the division
// Ranked by: sections count (primary), outline paths (secondary)
function divItems(index, divisionId, hasAuthor) {
  const items = [];
  for (const [title, entry] of index) {
    const secs = entry.divSections[divisionId];
    if (!secs || secs.size < 2) continue;
    const pathCount = entry.divPaths[divisionId] || 0;
    const item = { title, count: secs.size, paths: pathCount };
    if (hasAuthor && entry.author) item.author = entry.author;
    items.push(item);
  }
  items.sort((a, b) =>
    b.count - a.count ||
    b.paths - a.paths ||
    a.title.localeCompare(b.title)
  );
  return items;
}

// Write per-part files
let partCount = 0;
let partItemTotal = 0;
for (const part of navigation.parts) {
  const pn = part.partNumber;
  const vsi = partItems(vsiIndex, pn, true);
  const wiki = partItems(wikiIndex, pn, true);
  const macro = partItems(macroIndex, pn, false);

  const data = { partNumber: pn, readings: {} };
  if (vsi.length > 0) data.readings.vsi = vsi;
  if (wiki.length > 0) data.readings.wiki = wiki;
  if (macro.length > 0) data.readings.macro = macro;
  partItemTotal += vsi.length + wiki.length + macro.length;

  const filename = `part-${String(pn).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(PART_OUTPUT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
  partCount++;
}

// Write per-division files
let divCount = 0;
let divItemTotal = 0;
for (const part of navigation.parts) {
  for (const div of part.divisions) {
    const vsi = divItems(vsiIndex, div.divisionId, true);
    const wiki = divItems(wikiIndex, div.divisionId, true);
    const macro = divItems(macroIndex, div.divisionId, false);

    const data = { divisionId: div.divisionId, readings: {} };
    if (vsi.length > 0) data.readings.vsi = vsi;
    if (wiki.length > 0) data.readings.wiki = wiki;
    if (macro.length > 0) data.readings.macro = macro;
    divItemTotal += vsi.length + wiki.length + macro.length;

    const filename = `div-${div.divisionId}.json`;
    fs.writeFileSync(path.join(DIV_OUTPUT_DIR, filename), JSON.stringify(data, null, 2) + '\n');
    divCount++;
  }
}

console.log(`Generated ${partCount} part reading files (${partItemTotal} total items, multi-division only)`);
console.log(`Generated ${divCount} division reading files (${divItemTotal} total items, multi-section only)`);
