#!/usr/bin/env node
/**
 * Generates src/data/part-connections.json from the canonical cross-references
 * data. Includes both direct and 1-hop transitive connections.
 *
 * Usage: node scripts/build-part-connections.js
 */

const fs = require('fs');
const path = require('path');
const { loadCrossReferences, loadOutline } = require('./lib/outline-data.cjs');

const ROOT = path.resolve(__dirname, '..');
const SECTIONS_DIR = path.join(ROOT, 'src/content/sections');
const OUTPUT_PATH = path.join(ROOT, 'src/data/part-connections.json');

// Load section metadata
const { sectionToPart } = loadOutline(ROOT);

// Load cross-references from section content
const references = loadCrossReferences(ROOT);

// Build outgoing adjacency list
const outgoing = {};
references.forEach((r) => {
  if (!outgoing[r.sourceSection]) outgoing[r.sourceSection] = [];
  outgoing[r.sourceSection].push(r);
});

function connectionKey(a, b) {
  return Math.min(a, b) + '-' + Math.max(a, b);
}

// 1. Collect direct cross-part references
const direct = {};
references.forEach((r) => {
  const sp = sectionToPart[r.sourceSection];
  const tp = sectionToPart[r.targetSection];
  if (!sp || !tp || sp === tp) return;
  const key = connectionKey(sp, tp);
  if (!direct[key]) direct[key] = [];
  direct[key].push({
    sourceSection: r.sourceSection,
    targetSection: r.targetSection,
    sourcePath: r.sourcePath || '',
    targetPath: r.targetPath || '',
  });
});

// 2. Find 1-hop transitive connections for pairs with no direct references
const allPairs = [];
for (let i = 1; i <= 10; i++) {
  for (let j = i + 1; j <= 10; j++) {
    allPairs.push(connectionKey(i, j));
  }
}

const transitive = {};
allPairs.forEach((key) => {
  if (direct[key]) return; // already have direct connections

  const [partA, partB] = key.split('-').map(Number);
  const found = [];
  const seen = new Set();

  references.forEach((r) => {
    const sp = sectionToPart[r.sourceSection];
    if (!sp) return;

    // Source in Part A, target is intermediate
    if (sp === partA) {
      (outgoing[r.targetSection] || []).forEach((next) => {
        if (sectionToPart[next.targetSection] === partB) {
          const sig = `${r.sourceSection}>${r.targetSection}>${next.targetSection}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            found.push({
              sourceSection: r.sourceSection,
              targetSection: next.targetSection,
              sourcePath: r.sourcePath || '',
              targetPath: next.targetPath || '',
              via: r.targetSection,
            });
          }
        }
      });
    }

    // Source in Part B, target is intermediate
    if (sp === partB) {
      (outgoing[r.targetSection] || []).forEach((next) => {
        if (sectionToPart[next.targetSection] === partA) {
          const sig = `${next.targetSection}>${r.targetSection}>${r.sourceSection}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            found.push({
              sourceSection: next.targetSection,
              targetSection: r.sourceSection,
              sourcePath: next.targetPath || '',
              targetPath: r.sourcePath || '',
              via: r.targetSection,
            });
          }
        }
      });
    }
  });

  if (found.length > 0) {
    transitive[key] = found;
  }
});

// 3. Find shared Macropaedia references for pairs still uncovered
const sectionMacro = {};
for (const file of fs.readdirSync(SECTIONS_DIR)) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8'));
  if (data.macropaediaReferences && data.macropaediaReferences.length > 0) {
    sectionMacro[data.sectionCode] = data.macropaediaReferences;
  }
}

// Build article -> sections map
const articleToSections = {};
Object.entries(sectionMacro).forEach(([code, articles]) => {
  articles.forEach((article) => {
    if (!articleToSections[article]) articleToSections[article] = [];
    articleToSections[article].push(code);
  });
});

const sharedMacro = {};
allPairs.forEach((key) => {
  if (direct[key] || transitive[key]) return;

  const [partA, partB] = key.split('-').map(Number);
  const found = [];
  const seen = new Set();

  Object.entries(articleToSections).forEach(([article, sections]) => {
    const inA = sections.filter((s) => sectionToPart[s] === partA);
    const inB = sections.filter((s) => sectionToPart[s] === partB);
    if (inA.length > 0 && inB.length > 0) {
      // Create a connection for each pair of sections sharing this article
      inA.forEach((a) => {
        inB.forEach((b) => {
          const sig = `${a}>${b}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            found.push({
              sourceSection: a,
              targetSection: b,
              sourcePath: '',
              targetPath: '',
              sharedArticle: article,
            });
          }
        });
      });
    }
  });

  if (found.length > 0) {
    sharedMacro[key] = found;
  }
});

// 4. Keyword-based connections: find sections with significant outline text overlap
const STOP_WORDS = new Set([
  // Standard stop words
  'a','an','and','are','as','at','be','by','for','from','has','have','he','in','is','it','its',
  'of','on','or','that','the','to','was','were','will','with','not','but','this','these',
  'their','they','those','other','such','than','more','most','been','being','had','having',
  'does','did','do','would','could','should','about','after','before','between','through',
  'during','without','within','under','over','into','upon','each','every','some','many',
  // Domain-generic academic terms that appear in every field
  'development','developments','history','historical','role','nature','types','various',
  'general','aspects','problems','effects','methods','theory','theories','systems','system',
  'major','modern','early','new','first','different','particular','special','specific',
  'structure','structures','process','processes','form','forms','principles','principle',
  'properties','concepts','concept','study','studies','relations','relation','relationship',
  'influence','influences','changes','change','including','included','based','approach',
  'introduction','rise','growth','period','periods','century','centuries','world',
  'institutions','social','political','economic','cultural','national','international',
  'ancient','medieval','western','eastern','european','british','french','german',
  'establishment','treatment','practice','practices','science','sciences','scientific',
  'traditional','contemporary','basic','fundamental','applied','related',
  // Polysemous terms that cause false matches across unrelated fields
  'composition','elements','element','movement','movements','material','materials',
  'physical','optical','magnetic','mechanical','technical','functional','formal',
  'classification','categories','characteristics','conditions','features','qualities',
  'construction','production','distribution','organization','administration',
  'time','space','order','power','force','forces','energy','motion','light','sound',
  'body','bodies','mass','surface','water','earth','fire','line','point','field',
  'origin','origins','works','work','action','activities','activity','operation',
  'formation','determination','analysis','measurement','control','design','pattern',
  'texture','character','style','expression','interpretation','function','functions',
  // Propaedia-specific noise
  'e.g.','i.e.','see','also','above','below','etc','use','used','using','may','can',
]);

function tokenizeOutline(data) {
  let text = data.title + ' ';
  function walk(items) {
    for (const item of items || []) {
      text += item.text + ' ';
      walk(item.children);
    }
  }
  walk(data.outline);
  return new Set(
    text.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  );
}

// Build keyword sets per section
const sectionKeywords = {};
for (const file of fs.readdirSync(SECTIONS_DIR)) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(fs.readFileSync(path.join(SECTIONS_DIR, file), 'utf8'));
  sectionKeywords[data.sectionCode] = tokenizeOutline(data);
}

// Compute IDF weights (rarer words are more meaningful)
const wordDocCount = {};
Object.values(sectionKeywords).forEach(words => {
  words.forEach(w => { wordDocCount[w] = (wordDocCount[w] || 0) + 1; });
});
const totalDocs = Object.keys(sectionKeywords).length;

function keywordScore(setA, setB) {
  let score = 0;
  setA.forEach(w => {
    if (setB.has(w)) {
      const idf = Math.log(totalDocs / (wordDocCount[w] || 1));
      score += idf;
    }
  });
  return score;
}

const keywordConnections = {};
allPairs.forEach((key) => {
  const [partA, partB] = key.split('-').map(Number);

  // Get all sections for each part
  const sectionsA = Object.keys(sectionToPart).filter(s => sectionToPart[s] === partA);
  const sectionsB = Object.keys(sectionToPart).filter(s => sectionToPart[s] === partB);

  // Find top section pairs by keyword overlap
  // Require a minimum score to filter out noise from generic word matches
  const scored = [];
  sectionsA.forEach(a => {
    const kwA = sectionKeywords[a];
    if (!kwA) return;
    sectionsB.forEach(b => {
      const kwB = sectionKeywords[b];
      if (!kwB) return;
      const score = keywordScore(kwA, kwB);
      if (score > 8) { // minimum IDF-weighted overlap to be meaningful
        scored.push({ a, b, score });
      }
    });
  });

  scored.sort((x, y) => y.score - x.score);

  // Take top connections, deduplicate by section
  const usedA = new Set();
  const usedB = new Set();
  const found = [];
  for (const { a, b } of scored) {
    if (usedA.has(a) && usedB.has(b)) continue;
    usedA.add(a);
    usedB.add(b);
    found.push({
      sourceSection: a,
      targetSection: b,
      sourcePath: '',
      targetPath: '',
      keywordMatch: true,
    });
    if (found.length >= 5) break;
  }

  if (found.length > 0) {
    keywordConnections[key] = found;
  }
});

// 5. Merge into output — direct first, then supplement with keyword matches
const output = {};
allPairs.forEach((key) => {
  const connections = [];
  const seenPairs = new Set();

  // Direct references first (highest priority)
  if (direct[key]) {
    direct[key].forEach(c => {
      const sig = c.sourceSection + '>' + c.targetSection;
      if (!seenPairs.has(sig)) { seenPairs.add(sig); connections.push(c); }
    });
  }

  // Transitive references next
  if (transitive[key]) {
    transitive[key].forEach(c => {
      const sig = c.sourceSection + '>' + c.targetSection;
      if (!seenPairs.has(sig)) { seenPairs.add(sig); connections.push(c); }
    });
  }

  // Shared Macropaedia
  if (sharedMacro[key]) {
    sharedMacro[key].forEach(c => {
      const sig = c.sourceSection + '>' + c.targetSection;
      if (!seenPairs.has(sig)) { seenPairs.add(sig); connections.push(c); }
    });
  }

  // Keyword matches as supplement (always added, fills gaps)
  if (keywordConnections[key]) {
    keywordConnections[key].forEach(c => {
      const sig = c.sourceSection + '>' + c.targetSection;
      if (!seenPairs.has(sig)) { seenPairs.add(sig); connections.push(c); }
    });
  }

  if (connections.length > 0) {
    output[key] = connections;
  }
});

// Sort keys for stable output
const sorted = {};
Object.keys(output)
  .sort((a, b) => {
    const [a1, a2] = a.split('-').map(Number);
    const [b1, b2] = b.split('-').map(Number);
    return a1 - b1 || a2 - b2;
  })
  .forEach((k) => {
    sorted[k] = output[k];
  });

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n');

const directCount = Object.keys(direct).length;
const transitiveCount = Object.keys(transitive).length;
const macroCount = Object.keys(sharedMacro).length;
const keywordCount = Object.keys(keywordConnections).length;
const totalPairs = allPairs.length;
const coveredPairs = Object.keys(sorted).length;
const uncoveredPairs = totalPairs - coveredPairs;

console.log(`Direct connections: ${directCount} pairs`);
console.log(`Transitive connections: ${transitiveCount} pairs`);
console.log(`Shared Macropaedia: ${macroCount} pairs`);
console.log(`Keyword overlap: ${keywordCount} pairs`);
console.log(`Total coverage: ${coveredPairs}/${totalPairs} pairs`);
if (uncoveredPairs > 0) {
  const missing = allPairs.filter((k) => !sorted[k]);
  console.log(`Uncovered: ${missing.join(', ')}`);
}
console.log(`Written to ${OUTPUT_PATH}`);
