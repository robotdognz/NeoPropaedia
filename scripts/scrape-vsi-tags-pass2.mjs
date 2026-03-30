#!/usr/bin/env node
/**
 * Second pass: discovers remaining book URLs from later list pages,
 * then scrapes missing + wrong-edition books.
 *
 * Usage: node scripts/scrape-vsi-tags-pass2.mjs
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'src/content/vsi/catalog.json');
const TAGS_PATH = resolve(ROOT, 'scripts/vsi-tags.json');

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

    if (keywords.length === 0) {
      const text = document.body?.innerText || '';
      const m = text.match(/Keywords?:\s*([^\n]+)/i);
      if (m) m[1].split(',').forEach((s) => { const t = s.trim(); if (t && t.length < 100) keywords.push(t); });
    }

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
    if (keywords.length === 0) {
      document.querySelectorAll('meta[name="keywords"], meta[name="citation_keywords"]').forEach((meta) => {
        const c = meta.getAttribute('content');
        if (c) c.split(/[,;]/).forEach((s) => { const t = s.trim(); if (t) keywords.push(t); });
      });
    }

    return { pageTitle, subjects: [...new Set(subjects)], keywords: [...new Set(keywords)] };
  });
}

async function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const progress = loadProgress();
  if (!progress.bookUrls) progress.bookUrls = {};
  if (!progress.scraped) progress.scraped = {};

  // Figure out what's missing and wrong-edition
  const scrapedKeys = new Set(Object.keys(progress.scraped).map(norm));
  const missingTitles = catalog.titles.filter((e) => !scrapedKeys.has(norm(e.title)));

  const wrongEditionTitles = [];
  for (const entry of catalog.titles) {
    const key = norm(entry.title);
    const found = Object.entries(progress.scraped).find(([sk]) => norm(sk) === key);
    if (!found) continue;
    const pageTitle = found[1].pageTitle || '';
    const pageEdMatch = pageTitle.match(/\((\d+)\w*\s+edn\)/i);
    const pageEd = pageEdMatch ? parseInt(pageEdMatch[1]) : null;
    const catalogEd = entry.edition || 1;
    if (pageEd !== null && pageEd !== catalogEd) {
      wrongEditionTitles.push(entry);
    }
  }

  console.log('Missing:', missingTitles.length);
  console.log('Wrong edition:', wrongEditionTitles.length);
  console.log('Total to scrape:', missingTitles.length + wrongEditionTitles.length);

  if (missingTitles.length + wrongEditionTitles.length === 0) {
    console.log('Nothing to do!');
    return;
  }

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
    // Start from page 1 to pass Cloudflare, then click through to later pages
    const listUrl = 'https://academic.oup.com/very-short-introductions/search-results?f_ContentType=Book&fl_SiteID=6560&cqb=[]&page=1';

    console.log('\nNavigating to page 1...');
    console.log('=== Click "Verify you are human" and reject cookies ===\n');
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const ok = await waitForContent(page);
    if (!ok) { console.log('Cloudflare failed.'); return; }

    console.log('Page loaded. Waiting 15s for cookies...');
    await sleep(15000);

    // Phase 1: Discover more book URLs — click through all pages
    console.log('\nDiscovering book URLs (clicking through all pages)...\n');
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
        const key = norm(link.text);
        if (!progress.bookUrls[key] && !progress.bookUrls[link.text.toLowerCase()]) {
          // Store with the raw text as key too for better matching
          progress.bookUrls[key] = link.href;
          newCount++;
        }
      }
      saveProgress(progress);
      console.log(`  Page ${pageNum}: ${links.length} books, ${newCount} new (total: ${Object.keys(progress.bookUrls).length})`);

      // Wait for overlay then click Next
      try { await page.locator('.preloader-wrap.active').waitFor({ state: 'hidden', timeout: 10000 }); } catch {}
      const nextBtn = page.locator('a[aria-label="Next"]').first();
      if (await nextBtn.count() === 0 || !(await nextBtn.isVisible())) {
        console.log('  No next button. Discovery done.');
        break;
      }
      await nextBtn.click({ force: true });
      await waitForContent(page, 20);
    }

    console.log(`\nTotal discovered: ${Object.keys(progress.bookUrls).length}\n`);

    // Phase 2: Build scrape list — missing + wrong edition
    const toScrape = [];

    // Missing titles: find their URL in discovered
    for (const entry of missingTitles) {
      const key = norm(entry.title);
      let url = progress.bookUrls[key];
      if (!url) {
        // Look for edition-specific match
        for (const [dk, durl] of Object.entries(progress.bookUrls)) {
          const dnorm = norm(dk);
          if (dnorm === key) { url = durl; break; }
        }
      }
      if (url) {
        toScrape.push({ entry, url, key, reason: 'missing' });
      }
    }

    // Wrong edition: find the correct edition URL
    for (const entry of wrongEditionTitles) {
      const key = norm(entry.title);
      const targetEd = entry.edition || 1;
      // Look for a discovered URL with the right edition
      let url = null;
      for (const [dk, durl] of Object.entries(progress.bookUrls)) {
        const dnorm = norm(dk);
        if (dnorm !== key) continue;
        // Check if this discovery key has the right edition
        const edMatch = dk.match(/\((\d+)\w*\s+edn\)/i);
        const ed = edMatch ? parseInt(edMatch[1]) : null;
        if (ed === targetEd) { url = durl; break; }
        if (!url) url = durl; // fallback to any match
      }
      if (url) {
        toScrape.push({ entry, url, key, reason: 'wrong edition' });
      }
    }

    console.log(`Phase 2: Scraping ${toScrape.length} books...\n`);

    // Navigate back to list page for clicking
    await page.goto(`https://academic.oup.com/very-short-introductions/search-results?f_ContentType=Book&fl_SiteID=6560&cqb=[]&page=1`, {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await waitForContent(page, 30);
    await sleep(2000);

    let count = 0;
    for (const { entry, url, key, reason } of toScrape) {
      count++;
      console.log(`[${count}/${toScrape.length}] ${entry.title} (${reason})`);

      try {
        // Try clicking the link on current page, fall back to goto
        const bookHref = url.replace('https://academic.oup.com', '');
        const linkOnPage = page.locator(`a[href="${bookHref}"]`).first();

        try { await page.locator('.preloader-wrap.active').waitFor({ state: 'hidden', timeout: 5000 }); } catch {}

        if (await linkOnPage.count() > 0 && await linkOnPage.isVisible()) {
          await linkOnPage.click({ force: true });
        } else {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }

        const bookOk = await waitForContent(page, 30);
        if (!bookOk) {
          console.log('  Blocked');
          await sleep(5000);
          continue;
        }

        await sleep(500);
        const data = await extractBookData(page);

        // Overwrite any previous scrape for this title
        progress.scraped[key] = {
          url,
          pageTitle: data.pageTitle,
          subjects: data.subjects,
          keywords: data.keywords,
        };
        saveProgress(progress);

        if (data.subjects.length === 0 && data.keywords.length === 0) {
          console.log(`  No tags. Page: "${data.pageTitle}"`);
        } else {
          console.log(`  Subjects: ${data.subjects.join(', ') || '(none)'}`);
          console.log(`  Keywords: ${data.keywords.slice(0, 8).join(', ')}${data.keywords.length > 8 ? '...' : ''}`);
        }

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
        await sleep(3000);
        try {
          await page.goto('https://academic.oup.com/very-short-introductions/search-results?f_ContentType=Book&fl_SiteID=6560&cqb=[]&page=1', {
            waitUntil: 'domcontentloaded', timeout: 30000,
          });
          await waitForContent(page, 30);
        } catch {}
      }
    }

    // Phase 3: Update catalog
    console.log('\nUpdating catalog...');
    let updated = 0;
    for (const entry of catalog.titles) {
      const key = norm(entry.title);
      const found = Object.entries(progress.scraped).find(([sk]) => norm(sk) === key);
      if (!found) continue;
      const sv = found[1];
      if (!sv.keywords?.length) continue;

      // Verify page title matches
      const pageNorm = norm(sv.pageTitle || '');
      if (pageNorm !== key && !pageNorm.includes(key) && !key.includes(pageNorm)) continue;

      entry.keywords = sv.keywords;
      if (sv.subjects?.length > 0) entry.subjects = sv.subjects;
      updated++;
    }
    catalog.fetchedAt = new Date().toISOString();
    writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
    console.log(`Updated ${updated} entries in catalog.json`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
