#!/usr/bin/env node
/**
 * Fetches Wikipedia Vital Articles (Levels 2 and 3) and saves them as JSON.
 *
 * Usage: node scripts/fetch-wikipedia-vital.mjs
 *
 * Output: src/data/wikipedia-vital-articles.json
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '..', 'src/data/wikipedia-vital-articles.json');

const API_BASE = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'PropaediaBot/1.0 (https://github.com; educational project)';

async function fetchWikitext(pageTitle) {
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pageTitle}`);
  const data = await res.json();
  if (data.error) throw new Error(`API error: ${data.error.info}`);
  return data.parse.wikitext['*'];
}

function parseArticles(wikitext) {
  const articles = [];
  const lines = wikitext.split('\n');

  for (const line of lines) {
    // Match lines starting with * or # that contain [[wikilinks]]
    if (!/^[*#]/.test(line.trim())) continue;
    if (!line.includes('[[')) continue;

    // Extract all wikilinks, skip Wikipedia/Category/File namespaces
    const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const target = match[1].trim();
      const display = (match[2] || target).trim();

      // Skip namespace links
      if (/^(Wikipedia|Category|File|Template|Portal|Talk):/i.test(target)) continue;

      // Determine the level marker (bold = higher level)
      const isBold = line.includes("'''" + '[[' + target) || line.includes("'''[[" + target);

      // Extract quality icon if present before this link
      const beforeLink = line.substring(0, match.index);
      const qualityMatch = beforeLink.match(/\{\{Icon\|(\w+)\}\}\s*$/);
      const quality = qualityMatch ? qualityMatch[1] : null;

      // Determine depth from bullet indentation
      const depthMatch = line.match(/^([*#]+)/);
      const depth = depthMatch ? depthMatch[1].length : 1;

      articles.push({
        title: target,
        displayTitle: display !== target ? display : undefined,
        url: `https://en.wikipedia.org/wiki/${target.replace(/ /g, '_')}`,
        quality: quality || undefined,
        depth,
      });

      // Only take the first article link per line (the main one)
      break;
    }
  }

  return articles;
}

function extractCategories(wikitext, articles) {
  // Parse section headings to assign categories
  const lines = wikitext.split('\n');
  let currentCategory = null;
  let currentSubcategory = null;
  const result = [];
  let articleIndex = 0;

  for (const line of lines) {
    // Match section headings
    const h2 = line.match(/^==\s*(.+?)\s*==\s*$/);
    const h3 = line.match(/^===\s*(.+?)\s*===\s*$/);
    const h4 = line.match(/^====\s*(.+?)\s*====\s*$/);

    if (h2) {
      currentCategory = h2[1].replace(/\[\[.*?\|?|\]\]/g, '').trim();
      currentSubcategory = null;
      continue;
    }
    if (h3) {
      currentSubcategory = h3[1].replace(/\[\[.*?\|?|\]\]/g, '').trim();
      continue;
    }
    if (h4) {
      currentSubcategory = h4[1].replace(/\[\[.*?\|?|\]\]/g, '').trim();
      continue;
    }

    // Match article lines
    if (/^[*#]/.test(line.trim()) && line.includes('[[')) {
      if (articleIndex < articles.length) {
        articles[articleIndex].category = currentCategory || undefined;
        articles[articleIndex].subcategory = currentSubcategory || undefined;
        articleIndex++;
      }
    }
  }

  return articles;
}

async function main() {
  console.log('Fetching Wikipedia Vital Articles...\n');

  // Fetch Level 2
  console.log('Level 2...');
  const wikitext2 = await fetchWikitext('Wikipedia:Vital_articles/Level/2');
  const level2Raw = parseArticles(wikitext2);
  const level2 = extractCategories(wikitext2, level2Raw);
  console.log(`  ${level2.length} articles`);

  // Fetch Level 3
  console.log('Level 3...');
  const wikitext3 = await fetchWikitext('Wikipedia:Vital_articles/Level/3');
  const level3Raw = parseArticles(wikitext3);
  const level3 = extractCategories(wikitext3, level3Raw);
  console.log(`  ${level3.length} articles`);

  // Deduplicate: mark which level each article first appears at
  const level2Titles = new Set(level2.map((a) => a.title));

  const output = {
    fetchedAt: new Date().toISOString(),
    levels: {
      2: {
        count: level2.length,
        articles: level2,
      },
      3: {
        count: level3.length,
        articles: level3,
      },
    },
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWritten to ${OUTPUT_PATH}`);
  console.log(`Level 2: ${level2.length} articles`);
  console.log(`Level 3: ${level3.length} articles`);

  // Show category breakdown for Level 3
  const cats = {};
  level3.forEach((a) => {
    const cat = a.category || 'Uncategorized';
    cats[cat] = (cats[cat] || 0) + 1;
  });
  console.log('\nLevel 3 categories:');
  Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
