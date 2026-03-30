#!/usr/bin/env node
/**
 * Scrapes keywords, subjects, and abstracts for Oxford VSI books.
 * Uses alphabetically sorted listing for better discovery.
 *
 * Usage: node scripts/scrape-vsi-tags.mjs
 *
 * Click "Verify you are human" and reject cookies when prompted.
 * Progress saved to scripts/vsi-tags.json (resumable).
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'src/content/vsi/catalog.json');
const TAGS_PATH = resolve(ROOT, 'scripts/vsi-tags.json');

const LIST_URL = 'https://academic.oup.com/very-short-introductions/search-results?sort=Title+-+A+to+Z&f_ContentType=Book&fl_SiteID=6560&cqb=[]&page=1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(t) {
  return t
    .replace(/:\s*a very short introduction/i, '')
    .replace(/\s*\(\d+\w*\s+edn\)/i, '')
    .replace(/\s*get access/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function loadProgress() {
  if (existsSync(TAGS_PATH)) return JSON.parse(readFileSync(TAGS_PATH, 'utf8'));
  return { bookUrls: {}, scraped: {} };
}

function saveProgress(progress) {
  writeFileSync(TAGS_PATH, JSON.stringify(progress, null, 2) + '\n');
}

async function waitForContent(page, timeoutSec = 60) {
  for (let i = 0; i < timeoutSec; i++) {
    try {
      const state = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        if (text.includes('Performing security') || text.includes('Verify you are human')) return 'cf';
        if (text.length > 300 && !text.includes('security verification')) return 'ok';
        return 'loading';
      });
      if (state === 'ok') return true;
      if (state === 'cf' && i % 15 === 0) {
        console.log('  [Cloudflare — click "Verify" in the browser]');
      }
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function extractBookLinksFromPage(page) {
  return page.evaluate(() => {
    const results = [];
    document.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (!href.includes('/book/') || href.includes('/search')) return;
      const text = a.textContent.trim();
      if (text.length > 0 && text.length < 300) {
        results.push({ href: href.startsWith('http') ? href : 'https://academic.oup.com' + href, text });
      }
    });
    return results;
  });
}

async function extractBookData(page) {
  return page.evaluate(() => {
    const subjects = [];
    const keywords = [];
    const pageTitle = document.querySelector('h1')?.textContent?.trim() || '';
    let abstract = '';

    // Abstract
    const absEl = document.querySelector('.abstract');
    if (absEl) {
      abstract = absEl.textContent.replace(/^Abstract\s*/i, '').trim();
    }
    if (!abstract) {
      // Try meta description
      const meta = document.querySelector('meta[name="description"]');
      if (meta) abstract = meta.getAttribute('content')?.trim() || '';
    }

    // dt/dd pairs for Subject and Keywords
    document.querySelectorAll('dt').forEach((dt) => {
      const label = dt.textContent.trim().toLowerCase();
      const dd = dt.nextElementSibling;
      if (!dd) return;
      if (label.includes('subject')) {
        dd.querySelectorAll('a').forEach((a) => {
          const t = a.textContent.trim();
          if (t && t.length < 200) subjects.push(t);
        });
        if (subjects.length === 0) {
          const t = dd.textContent.trim();
          if (t && t.length < 200 && t.toLowerCase() !== 'subject') subjects.push(t);
        }
      }
      if (label.includes('keyword')) {
        dd.querySelectorAll('a').forEach((a) => {
          const t = a.textContent.trim();
          if (t && t.length < 200) keywords.push(t);
        });
        if (keywords.length === 0) {
          dd.textContent.split(',').forEach((s) => {
            const t = s.trim();
            if (t && t.length < 100) keywords.push(t);
          });
        }
      }
    });

    // Fallback: "Keywords:" in body text
    if (keywords.length === 0) {
      const text = document.body?.innerText || '';
      const m = text.match(/Keywords?:\s*([^\n]+)/i);
      if (m) m[1].split(',').forEach((s) => { const t = s.trim(); if (t && t.length < 100) keywords.push(t); });
    }

    // Fallback: class-based selectors
    if (subjects.length === 0) {
      document.querySelectorAll('[class*="subject"] a').forEach((a) => {
        const t = a.textContent.trim();
        if (t && t.length < 200 && !t.includes('Very Short')) subjects.push(t);
      });
    }
    if (keywords.length === 0) {
      document.querySelectorAll('.kwd-text, [class*="keyword"] a').forEach((el) => {
        const t = el.textContent.trim();
        if (t && t.length < 200) keywords.push(t);
      });
    }

    // Fallback: meta tags
    if (keywords.length === 0) {
      document.querySelectorAll('meta[name="keywords"], meta[name="citation_keywords"]').forEach((meta) => {
        const c = meta.getAttribute('content');
        if (c) c.split(/[,;]/).forEach((s) => { const t = s.trim(); if (t) keywords.push(t); });
      });
    }

    return {
      pageTitle,
      abstract,
      subjects: [...new Set(subjects)],
      keywords: [...new Set(keywords)],
    };
  });
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const progress = loadProgress();
  if (!progress.bookUrls) progress.bookUrls = {};
  if (!progress.scraped) progress.scraped = {};

  const alreadyScraped = Object.values(progress.scraped).filter((s) => !s.error).length;
  console.log(`Catalog: ${catalog.titles.length} | Discovered: ${Object.keys(progress.bookUrls).length} | Scraped: ${alreadyScraped}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();

  try {
    console.log('=== Click "Verify you are human" and reject cookies ===\n');
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const ok = await waitForContent(page);
    if (!ok) { console.log('Cloudflare failed.'); return; }

    console.log('Page loaded. Waiting 15s for you to reject cookies...');
    await sleep(15000);

    // Phase 1: Discover all book URLs (alphabetical order)
    console.log('\nPhase 1: Discovering book URLs (A-Z)...\n');
    let pageNum = 0;
    while (true) {
      pageNum++;
      await sleep(1000);

      const links = await extractBookLinksFromPage(page);
      if (links.length === 0) {
        console.log('  No more results. Discovery done.');
        break;
      }

      let newCount = 0;
      for (const link of links) {
        // Store with raw text as key (includes edition info)
        const rawKey = link.text.trim().toLowerCase();
        if (!progress.bookUrls[rawKey]) {
          progress.bookUrls[rawKey] = link.href;
          newCount++;
        }
      }
      saveProgress(progress);
      console.log(`  Page ${pageNum}: ${links.length} books, ${newCount} new (total: ${Object.keys(progress.bookUrls).length})`);

      // Click Next
      try { await page.locator('.preloader-wrap.active').waitFor({ state: 'hidden', timeout: 10000 }); } catch {}
      const nextBtn = page.locator('a[aria-label="Next"]').first();
      if (await nextBtn.count() === 0 || !(await nextBtn.isVisible())) {
        console.log('  No next button. Discovery done.');
        break;
      }
      await nextBtn.click({ force: true });
      await waitForContent(page, 20);
    }

    console.log(`\nDiscovery: ${Object.keys(progress.bookUrls).length} book URLs.\n`);

    // Phase 2: Scrape each book page
    // Build scrape list: everything not yet scraped (or previously errored)
    const toScrape = Object.entries(progress.bookUrls).filter(([key]) => {
      const existing = progress.scraped[key];
      return !existing || existing.error;
    });

    console.log(`Phase 2: Scraping ${toScrape.length} book pages...\n`);

    // Go back to page 1
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForContent(page, 30);
    await sleep(2000);

    let count = 0;
    for (const [key, url] of toScrape) {
      count++;
      console.log(`[${count}/${toScrape.length}] ${key}`);

      try {
        try { await page.locator('.preloader-wrap.active').waitFor({ state: 'hidden', timeout: 5000 }); } catch {}

        const bookHref = url.replace('https://academic.oup.com', '');
        const linkOnPage = page.locator(`a[href="${bookHref}"]`).first();

        if (await linkOnPage.count() > 0 && await linkOnPage.isVisible()) {
          await linkOnPage.click({ force: true });
        } else {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        const bookOk = await waitForContent(page, 30);
        if (!bookOk) {
          console.log('  Blocked');
          progress.scraped[key] = { error: 'cloudflare', url };
          saveProgress(progress);
          await sleep(5000);
          continue;
        }

        await sleep(500);
        const data = await extractBookData(page);

        progress.scraped[key] = {
          url,
          pageTitle: data.pageTitle,
          abstract: data.abstract,
          subjects: data.subjects,
          keywords: data.keywords,
        };
        saveProgress(progress);

        const kw = data.keywords.slice(0, 6).join(', ');
        const sub = data.subjects.join(', ') || '(none)';
        console.log(`  Sub: ${sub} | Kw: ${kw}${data.keywords.length > 6 ? '...' : ''} | Abs: ${data.abstract ? data.abstract.length + ' chars' : 'none'}`);

        // Go back
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await waitForContent(page, 15);
        await sleep(500);

        if (count % 50 === 0) {
          console.log('--- Pausing 15s ---');
          await sleep(15000);
        }
      } catch (err) {
        console.log(`  Error: ${err.message}`);
        progress.scraped[key] = { error: err.message, url };
        saveProgress(progress);
        try {
          await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await waitForContent(page, 30);
        } catch {}
        await sleep(3000);
      }
    }

    // Phase 3: Update catalog
    console.log('\nUpdating catalog...');
    updateCatalog(catalog, progress);
  } finally {
    await browser.close();
  }
}

function updateCatalog(catalog, progress) {
  let updated = 0;

  for (const entry of catalog.titles) {
    const key = norm(entry.title);
    let best = null;

    // Strict match on normalized title
    for (const [sk, sv] of Object.entries(progress.scraped)) {
      if (sv.error) continue;
      if (norm(sk) === key) {
        // Check edition preference
        const pageEdMatch = (sv.pageTitle || '').match(/\((\d+)\w*\s+edn\)/i);
        const pageEd = pageEdMatch ? parseInt(pageEdMatch[1]) : null;
        const catalogEd = entry.edition || 1;

        if (!best || (pageEd === catalogEd) || (!best.edMatch && pageEd !== null)) {
          best = { ...sv, edMatch: pageEd === catalogEd };
        }
      }
    }

    if (!best) continue;

    // Verify page title actually matches
    const pageNorm = norm(best.pageTitle || '');
    if (pageNorm !== key && !pageNorm.includes(key) && !key.includes(pageNorm)) continue;

    if (best.keywords?.length > 0) entry.keywords = best.keywords;
    if (best.subjects?.length > 0) entry.subjects = best.subjects;
    if (best.abstract) entry.abstract = best.abstract;
    if (best.keywords?.length > 0 || best.subjects?.length > 0 || best.abstract) updated++;
  }

  catalog.fetchedAt = new Date().toISOString();
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`Updated ${updated} entries in catalog.json`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
