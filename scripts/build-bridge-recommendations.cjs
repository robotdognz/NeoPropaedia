#!/usr/bin/env node
/**
 * Generates src/data/bridge-recommendations.json
 *
 * For each pair of parts, finds VSI books and Wikipedia articles
 * that are mapped to sections in BOTH parts — these are resources
 * that bridge two fields of knowledge.
 *
 * Usage: node scripts/build-bridge-recommendations.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NAV_PATH = path.join(ROOT, 'src/data/navigation.json');
const VSI_MAPPINGS_DIR = path.join(ROOT, 'src/content/vsi-mappings');
const WIKI_MAPPINGS_DIR = path.join(ROOT, 'src/content/wiki-mappings');
const OUTPUT_PATH = path.join(ROOT, 'src/data/bridge-recommendations.json');

// No artificial limit — show all items that bridge both parts

// Build sectionCode -> partNumber lookup
const navigation = JSON.parse(fs.readFileSync(NAV_PATH, 'utf8'));
const sectionToPart = {};
for (const part of navigation.parts) {
  for (const div of part.divisions) {
    for (const sec of div.sections) {
      sectionToPart[sec.sectionCode] = part.partNumber;
    }
  }
}

// Accumulate: title -> { author?, parts: { partNumber: sectionCount } }
function buildPartCounts(mappingsDir, getKey, getAuthor) {
  const index = new Map();
  const files = fs.readdirSync(mappingsDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(mappingsDir, file), 'utf8'));
    const partNumber = sectionToPart[data.sectionCode];
    if (!partNumber) continue;

    for (const mapping of data.mappings || []) {
      const key = getKey(mapping);
      if (!key) continue;

      if (!index.has(key)) {
        index.set(key, { author: getAuthor ? getAuthor(mapping) : undefined, parts: {} });
      }
      const entry = index.get(key);
      entry.parts[partNumber] = (entry.parts[partNumber] || 0) + 1;
    }
  }

  return index;
}

const vsiIndex = buildPartCounts(
  VSI_MAPPINGS_DIR,
  m => m.vsiTitle,
  m => m.vsiAuthor
);

const wikiIndex = buildPartCounts(
  WIKI_MAPPINGS_DIR,
  m => m.articleTitle,
  null
);

// Build Macropaedia index from section files directly
const macroIndex = new Map();
const SECTIONS_DIR = path.join(ROOT, 'src/content/sections');
for (const file of fs.readdirSync(SECTIONS_DIR).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8'));
  const partNumber = sectionToPart[data.sectionCode];
  if (!partNumber) continue;
  for (const ref of data.macropaediaReferences || []) {
    if (!macroIndex.has(ref)) {
      macroIndex.set(ref, { parts: {} });
    }
    const entry = macroIndex.get(ref);
    entry.parts[partNumber] = (entry.parts[partNumber] || 0) + 1;
  }
}

/**
 * Shannon entropy — measures how evenly distributed counts are.
 * For bridge: entropy([5, 5]) > entropy([9, 1]) — balanced bridges rank higher.
 */
function entropy(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

/**
 * Bridge score: combines balance and total coverage.
 * Uses entropy * total so that balance is weighted proportionally to coverage.
 * A balanced 5+5 (entropy 1.0 * 10 = 10) beats a lopsided 9+1 (entropy 0.47 * 10 = 4.7).
 * But 6+5 (entropy 0.99 * 11 = 10.9) beats 1+1 (entropy 1.0 * 2 = 2.0).
 */
function bridgeScore(ca, cb) {
  const balance = entropy([ca, cb]);
  const total = ca + cb;
  return balance * total;
}

// For each part pair, find shared items
function getConnectionKey(a, b) {
  return Math.min(a, b) + '-' + Math.max(a, b);
}

const result = {};
const partNumbers = navigation.parts.map(p => p.partNumber);

for (let i = 0; i < partNumbers.length; i++) {
  for (let j = i + 1; j < partNumbers.length; j++) {
    const a = partNumbers[i];
    const b = partNumbers[j];
    const key = getConnectionKey(a, b);

    // Find VSIs in both parts
    const sharedVsi = [];
    for (const [title, entry] of vsiIndex) {
      const ca = entry.parts[a] || 0;
      const cb = entry.parts[b] || 0;
      if (ca > 0 && cb > 0) {
        sharedVsi.push({ t: title, a: entry.author, ca, cb });
      }
    }
    sharedVsi.sort((x, y) => bridgeScore(y.ca, y.cb) - bridgeScore(x.ca, x.cb) || x.t.localeCompare(y.t));

    // Find Wikipedia articles in both parts
    const sharedWiki = [];
    for (const [title, entry] of wikiIndex) {
      const ca = entry.parts[a] || 0;
      const cb = entry.parts[b] || 0;
      if (ca > 0 && cb > 0) {
        sharedWiki.push({ t: title, ca, cb });
      }
    }
    sharedWiki.sort((x, y) => bridgeScore(y.ca, y.cb) - bridgeScore(x.ca, x.cb) || x.t.localeCompare(y.t));

    // Find Macropaedia articles in both parts
    const sharedMacro = [];
    for (const [title, entry] of macroIndex) {
      const ca = entry.parts[a] || 0;
      const cb = entry.parts[b] || 0;
      if (ca > 0 && cb > 0) {
        sharedMacro.push({ t: title, ca, cb });
      }
    }
    sharedMacro.sort((x, y) => bridgeScore(y.ca, y.cb) - bridgeScore(x.ca, x.cb) || x.t.localeCompare(y.t));

    if (sharedVsi.length > 0 || sharedWiki.length > 0 || sharedMacro.length > 0) {
      result[key] = {
        totalVsi: sharedVsi.length,
        totalWiki: sharedWiki.length,
        totalMacro: sharedMacro.length,
      };
      if (sharedVsi.length > 0) result[key].vsi = sharedVsi;
      if (sharedWiki.length > 0) result[key].wiki = sharedWiki;
      if (sharedMacro.length > 0) result[key].macro = sharedMacro;
    }
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result));

const fileSize = fs.statSync(OUTPUT_PATH).size;
const pairsWithData = Object.keys(result).length;
console.log(`Generated ${OUTPUT_PATH}`);
console.log(`  ${pairsWithData} part pairs with bridge data`);
console.log(`  ${(fileSize / 1024).toFixed(1)} KB`);
