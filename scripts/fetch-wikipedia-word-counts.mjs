#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, '..', 'src/data/wikipedia-catalog.json');
const CACHE_PATH = resolve(__dirname, 'wikipedia-word-count-cache.json');
const API_BASE = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'PropaediaBot/1.0 (educational project)';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');
const limitFlag = process.argv.find((arg) => arg.startsWith('--limit='));
const batchSizeFlag = process.argv.find((arg) => arg.startsWith('--batch-size='));
const limit = limitFlag ? Number(limitFlag.split('=')[1]) : undefined;
const batchSize = Math.max(1, Number(batchSizeFlag ? batchSizeFlag.split('=')[1] : 25));

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function normalizeTitle(title) {
  return title.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function countWords(text) {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

function cleanWikitextForWordCount(wikitext) {
  return wikitext
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<ref\b[^>]*\/>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\|[\s\S]*?\|\}/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, ' $1 ')
    .replace(/\[(?:https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/g, ' $1 ')
    .replace(/^=+\s*(.*?)\s*=+$/gm, ' $1 ')
    .replace(/^\s*[\*\#;:]+\s*/gm, ' ')
    .replace(/'{2,}/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchWordCountsForBatch(titles) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    titles: titles.join('|'),
    rvprop: 'content',
    rvslots: 'main',
    redirects: '1',
    format: 'json',
    formatversion: '2',
  });

  const response = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Wikipedia API responded with ${response.status}`);
  }

  const text = await response.text();
  if (text.startsWith('<') || text.includes('too many requests')) {
    throw new Error('Wikipedia API returned HTML or rate-limit response');
  }

  const data = JSON.parse(text);
  const redirects = new Map(
    (data.query?.redirects ?? []).map((entry) => [normalizeTitle(entry.from), normalizeTitle(entry.to)]),
  );
  const counts = new Map();

  for (const page of data.query?.pages ?? []) {
    const wikitext = page.revisions?.[0]?.slots?.main?.content;
    if (page.missing || typeof wikitext !== 'string') continue;
    const normalizedPageTitle = normalizeTitle(page.title);
    const wordCount = countWords(cleanWikitextForWordCount(wikitext));
    counts.set(normalizedPageTitle, wordCount);

    for (const [from, to] of redirects.entries()) {
      if (to === normalizedPageTitle) {
        counts.set(from, wordCount);
      }
    }
  }

  return counts;
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const cache = force
    ? {}
    : existsSync(CACHE_PATH)
      ? JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
      : {};

  const allArticles = catalog.articles.map((article) => ({
    ...article,
    _normalizedTitle: normalizeTitle(article.title),
  }));

  const pendingArticles = allArticles.filter((article) => {
    if (force) return true;
    if (typeof article.wordCount === 'number' && article.wordCount > 0) return false;
    if (typeof cache[article._normalizedTitle] === 'number' && cache[article._normalizedTitle] > 0) return false;
    return true;
  });

  const selectedArticles = typeof limit === 'number' && Number.isFinite(limit)
    ? pendingArticles.slice(0, limit)
    : pendingArticles;

  console.log(`Wikipedia catalog entries: ${allArticles.length}`);
  console.log(`Existing word counts in catalog: ${allArticles.filter((article) => typeof article.wordCount === 'number' && article.wordCount > 0).length}`);
  console.log(`Cached word counts: ${Object.keys(cache).length}`);
  console.log(`Fetching word counts for: ${selectedArticles.length}`);

  if (!dryRun) {
    const batches = chunk(selectedArticles, batchSize);
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const counts = await fetchWordCountsForBatch(batch.map((article) => article.title));
      for (const article of batch) {
        const wordCount = counts.get(article._normalizedTitle);
        if (typeof wordCount === 'number' && wordCount > 0) {
          cache[article._normalizedTitle] = wordCount;
        }
      }

      process.stdout.write(`\r  Batch ${index + 1}/${batches.length}`);
      writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
      await sleep(250);
    }
    process.stdout.write('\n');
  }

  let updated = 0;
  catalog.articles = catalog.articles.map((article) => {
    const normalizedTitle = normalizeTitle(article.title);
    const cachedWordCount = cache[normalizedTitle];
    const { wordCount: existingWordCount, ...rest } = article;
    if (typeof cachedWordCount === 'number' && cachedWordCount > 0) {
      updated += 1;
      return {
        ...rest,
        wordCount: cachedWordCount,
      };
    }

    return force ? rest : article;
  });

  catalog.wordCountsFetchedAt = new Date().toISOString();

  if (!dryRun) {
    writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
  }

  const missing = catalog.articles.filter((article) => !(typeof article.wordCount === 'number' && article.wordCount > 0));
  console.log(`Updated catalog entries with word counts: ${updated}`);
  console.log(`Remaining without word counts: ${missing.length}`);
  if (missing.length > 0) {
    console.log(`Missing sample: ${missing.slice(0, 10).map((article) => article.title).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
