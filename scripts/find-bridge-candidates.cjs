#!/usr/bin/env node
/**
 * Identifies VSI books that are likely to bridge multiple parts but are currently
 * only mapped to sections in one or two parts. These are candidates for running
 * through discover mode to expand their mappings.
 *
 * Output: a list of items suitable for --mode discover --item "Title::Author"
 *
 * Usage: node scripts/find-bridge-candidates.cjs
 */

const fs = require('fs');
const path = require('path');

const NAV_PATH = 'src/data/navigation.json';
const VSI_MAPPINGS_DIR = 'src/content/vsi-mappings';
const VSI_CATALOG_DIR = 'src/content/vsi';

// Build section → part lookup
const navigation = JSON.parse(fs.readFileSync(NAV_PATH, 'utf8'));
const sectionToPart = {};
for (const part of navigation.parts) {
  for (const div of part.divisions) {
    for (const sec of div.sections) {
      sectionToPart[sec.sectionCode] = part.partNumber;
    }
  }
}

// Load VSI catalog
const catalog = new Map();
for (const file of fs.readdirSync(VSI_CATALOG_DIR).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(VSI_CATALOG_DIR, file), 'utf8'));
  for (const entry of data.titles) {
    catalog.set(`${entry.title}::${entry.author}`, entry);
  }
}

// Find which parts each VSI is currently mapped to
const vsiParts = {};
for (const file of fs.readdirSync(VSI_MAPPINGS_DIR).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(VSI_MAPPINGS_DIR, file), 'utf8'));
  const partNum = sectionToPart[data.sectionCode];
  if (!partNum) continue;
  for (const m of data.mappings) {
    const id = `${m.vsiTitle}::${m.vsiAuthor}`;
    if (!vsiParts[id]) vsiParts[id] = new Set();
    vsiParts[id].add(partNum);
  }
}

// Bridge-indicating keywords: terms that suggest a book spans multiple domains
const bridgeTerms = [
  // Cross-domain connectors
  'history of', 'philosophy of', 'science and', 'and society', 'and religion',
  'and culture', 'and politics', 'and the', 'global', 'world',
  // Methodological bridges
  'interdisciplinary', 'complexity', 'systems', 'networks', 'information',
  // Science-humanities bridges
  'consciousness', 'mind', 'brain', 'evolution', 'human nature', 'ethics',
  'environment', 'climate', 'energy', 'food', 'health', 'disease',
  // Specific bridge topics
  'cosmology', 'creation', 'time', 'beauty', 'truth', 'knowledge',
  'language', 'mathematics', 'logic', 'statistics', 'data',
  'war', 'peace', 'law', 'rights', 'justice', 'democracy',
  'education', 'childhood', 'aging', 'death',
  'colour', 'color', 'light', 'sound', 'music',
  'water', 'earth', 'fire', 'nature',
];

// Find candidates: books with bridge-indicating content that are in ≤ 2 parts
const candidates = [];

for (const [id, entry] of catalog) {
  const currentParts = vsiParts[id] || new Set();
  const allText = [entry.title, entry.subject || '', entry.abstract || '', (entry.keywords || []).join(' ')].join(' ').toLowerCase();

  // Score by how many bridge terms appear
  let bridgeScore = 0;
  const matchedTerms = [];
  for (const term of bridgeTerms) {
    if (allText.includes(term)) {
      bridgeScore++;
      matchedTerms.push(term);
    }
  }

  // Also flag books with titles that explicitly name cross-domain topics
  const titleLower = entry.title.toLowerCase();
  const explicitBridge = [
    'science and religion', 'galileo', 'copernicus', 'darwin', 'einstein',
    'god', 'atheism', 'consciousness', 'free will', 'bioethics',
    'environmental', 'climate change', 'sustainability',
    'artificial intelligence', 'robotics',
    'medical ethics', 'forensic',
  ].some(t => titleLower.includes(t));

  if (explicitBridge) bridgeScore += 5;

  if (bridgeScore >= 2 && currentParts.size <= 2) {
    candidates.push({
      id,
      title: entry.title,
      author: entry.author,
      currentParts: [...currentParts].sort(),
      bridgeScore,
      matchedTerms: matchedTerms.slice(0, 5),
      hasSummary: !!entry.summaryAI,
    });
  }
}

candidates.sort((a, b) => b.bridgeScore - a.bridgeScore);

console.log(`Found ${candidates.length} bridge candidates (VSI books in ≤2 parts with cross-domain indicators)`);
console.log();

// Group by priority
const withSummary = candidates.filter(c => c.hasSummary);
const withoutSummary = candidates.filter(c => !c.hasSummary);

console.log(`=== TOP CANDIDATES WITH summaryAI (ready for discover mode) ===`);
withSummary.slice(0, 30).forEach((c, i) => {
  console.log(`${i + 1}. ${c.title} by ${c.author}`);
  console.log(`   Parts: [${c.currentParts.join(', ')}], Bridge score: ${c.bridgeScore}`);
  console.log(`   Terms: ${c.matchedTerms.join(', ')}`);
  console.log(`   Command: --mode discover --item "${c.id}" --type vsi`);
  console.log();
});

if (withoutSummary.length > 0) {
  console.log(`\n=== CANDIDATES NEEDING summaryAI FIRST (${withoutSummary.length}) ===`);
  withoutSummary.slice(0, 10).forEach((c, i) => {
    console.log(`${i + 1}. ${c.title} by ${c.author} (no summaryAI)`);
  });
}

console.log(`\nTo run discover mode for all ready candidates:`);
console.log(`  # Run each individually:`);
withSummary.slice(0, 5).forEach(c => {
  console.log(`  node scripts/generate-mappings-ai.mjs --mode discover --item "${c.id}" --type vsi`);
});
