#!/usr/bin/env node

import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'src/content/vsi/catalog.json');
const CACHE_PATH = resolve(ROOT, 'scripts/vsi-page-count-cache.json');
const MANUAL_LISTINGS_PATH = resolve(ROOT, 'scripts/vsi-manual-listings.json');
const MANUAL_PRODUCTS_PATH = resolve(ROOT, 'scripts/vsi-manual-products.json');
const SCRAPE_EXCLUSIONS_PATH = resolve(ROOT, 'scripts/vsi-scrape-exclusions.json');
const OUTPUT_DIR = resolve(ROOT, 'scripts/output');
const SCRAPED_CATALOG_PATH = resolve(OUTPUT_DIR, 'vsi-oup-catalog.json');
const DIFF_REPORT_PATH = resolve(OUTPUT_DIR, 'vsi-oup-catalog-diff.json');
const LIST_BASE_URL = 'https://global.oup.com/academic/content/series/v/very-short-introductions-vsi/?type=listing&lang=en&cc=nz';
const AVG_VSI_PAGES = 160;
const AVG_VSI_WORDS = 35000;
const WORDS_PER_PAGE = AVG_VSI_WORDS / AVG_VSI_PAGES;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');
const forceListings = args.has('--force-listings');
const forceProducts = args.has('--force-products');
const listingOnly = args.has('--listing-only');
const applyCatalog = args.has('--apply');
const untilComplete = args.has('--until-complete');
const inspectSortOptions = args.has('--inspect-sort-options');
const limitFlag = process.argv.find((arg) => arg.startsWith('--limit='));
const titleFlag = process.argv.find((arg) => arg.startsWith('--title='));
const resultsPerPageFlag = process.argv.find((arg) => arg.startsWith('--results-per-page='));
const listingStartFlag = process.argv.find((arg) => arg.startsWith('--listing-start='));
const pauseSecondsFlag = process.argv.find((arg) => arg.startsWith('--pause-seconds='));
const blockedPauseSecondsFlag = process.argv.find((arg) => arg.startsWith('--blocked-pause-seconds='));
const stalledPauseSecondsFlag = process.argv.find((arg) => arg.startsWith('--stalled-pause-seconds='));
const sortFieldFlag = process.argv.find((arg) => arg.startsWith('--sort-field='));
const sortFieldsFlag = process.argv.find((arg) => arg.startsWith('--sort-fields='));
const windowXFlag = process.argv.find((arg) => arg.startsWith('--window-x='));
const windowYFlag = process.argv.find((arg) => arg.startsWith('--window-y='));
const windowWidthFlag = process.argv.find((arg) => arg.startsWith('--window-width='));
const windowHeightFlag = process.argv.find((arg) => arg.startsWith('--window-height='));
const limit = limitFlag ? Number(limitFlag.split('=')[1]) : undefined;
const titleFilter = titleFlag ? titleFlag.split('=').slice(1).join('=').trim() : undefined;
const resultsPerPage = resultsPerPageFlag ? Number(resultsPerPageFlag.split('=')[1]) : 20;
const explicitListingStart = listingStartFlag ? Number(listingStartFlag.split('=')[1]) : undefined;
const pauseSeconds = pauseSecondsFlag ? Number(pauseSecondsFlag.split('=')[1]) : 120;
const blockedPauseSeconds = blockedPauseSecondsFlag
  ? Number(blockedPauseSecondsFlag.split('=')[1])
  : Math.max(Math.round(pauseSeconds * 2), 120);
const stalledPauseSeconds = stalledPauseSecondsFlag
  ? Number(stalledPauseSecondsFlag.split('=')[1])
  : Math.max(Math.round(pauseSeconds * 5), 300);
const explicitSortField = sortFieldFlag ? Number(sortFieldFlag.split('=')[1]) : undefined;
const explicitSortFields = sortFieldsFlag
  ? sortFieldsFlag.split('=').slice(1).join('=').split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value))
  : undefined;
const browserWindowX = windowXFlag
  ? Number(windowXFlag.split('=')[1])
  : Number.isFinite(Number(process.env.VSI_BROWSER_WINDOW_X))
    ? Number(process.env.VSI_BROWSER_WINDOW_X)
    : 0;
const browserWindowY = windowYFlag
  ? Number(windowYFlag.split('=')[1])
  : Number.isFinite(Number(process.env.VSI_BROWSER_WINDOW_Y))
    ? Number(process.env.VSI_BROWSER_WINDOW_Y)
    : 40;
const browserWindowWidth = windowWidthFlag
  ? Number(windowWidthFlag.split('=')[1])
  : Number.isFinite(Number(process.env.VSI_BROWSER_WINDOW_WIDTH))
    ? Number(process.env.VSI_BROWSER_WINDOW_WIDTH)
    : 1180;
const browserWindowHeight = windowHeightFlag
  ? Number(windowHeightFlag.split('=')[1])
  : Number.isFinite(Number(process.env.VSI_BROWSER_WINDOW_HEIGHT))
    ? Number(process.env.VSI_BROWSER_WINDOW_HEIGHT)
    : 900;
const hasExplicitWindowPosition = Boolean(windowXFlag || windowYFlag || process.env.VSI_BROWSER_WINDOW_X || process.env.VSI_BROWSER_WINDOW_Y);
const hasExplicitWindowSize = Boolean(windowWidthFlag || windowHeightFlag || process.env.VSI_BROWSER_WINDOW_WIDTH || process.env.VSI_BROWSER_WINDOW_HEIGHT);

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function detectMacDisplays() {
  if (process.platform !== 'darwin') return [];

  try {
    const raw = execFileSync('osascript', [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit"); var out=[]; var screens=$.NSScreen.screens; for (var i=0;i<screens.count;i++){ var screen=screens.objectAtIndex(i); var f=screen.frame; out.push({x:f.origin.x,y:f.origin.y,w:f.size.width,h:f.size.height}); } JSON.stringify(out);',
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const displays = JSON.parse(raw);
    return Array.isArray(displays)
      ? displays.filter((display) => Number.isFinite(display?.x) && Number.isFinite(display?.y) && Number.isFinite(display?.w) && Number.isFinite(display?.h))
      : [];
  } catch {
    return [];
  }
}

function resolveBrowserWindowPlacement() {
  const fallback = {
    x: browserWindowX,
    y: browserWindowY,
    width: browserWindowWidth,
    height: browserWindowHeight,
    target: 'manual',
  };

  if (hasExplicitWindowPosition || hasExplicitWindowSize) {
    return fallback;
  }

  const displays = detectMacDisplays();
  if (displays.length === 0) {
    return { ...fallback, target: 'default' };
  }

  const targetDisplay = displays.reduce((smallest, current) => {
    const smallestArea = smallest.w * smallest.h;
    const currentArea = current.w * current.h;
    return currentArea < smallestArea ? current : smallest;
  });
  const horizontalPadding = 40;
  const verticalPadding = 56;
  const width = Math.max(960, Math.min(browserWindowWidth, targetDisplay.w - horizontalPadding * 2));
  const height = Math.max(720, Math.min(browserWindowHeight, targetDisplay.h - verticalPadding * 2));

  return {
    x: Math.round(targetDisplay.x + (targetDisplay.w - width) / 2),
    y: Math.round(targetDisplay.y + Math.max(24, (targetDisplay.h - height) / 3)),
    width,
    height,
    target: 'smallest-display',
  };
}

function normalizeTitle(title) {
  return normalizeWhitespace(title)
    .replace(/:\s*a very short introduction/i, '')
    .replace(/\s*\((?:\d+\w*|new)\s+(?:edn|edition)\)/i, '')
    .toLowerCase();
}

function cleanVsiTitle(title) {
  return normalizeWhitespace(title)
    .replace(/:\s*a very short introduction/i, '')
    .replace(/\s*\((?:\d+\w*|new)\s+(?:edn|edition)\)/i, '')
    .trim();
}

function parseEdition(text) {
  const match = normalizeWhitespace(text).match(/\((\d+)\w*\s+(?:edn|edition)\)/i)
    ?? normalizeWhitespace(text).match(/\b(\d+)\w*\s+(?:edn|edition)\b/i);
  return match ? Number(match[1]) : undefined;
}

function normalizeIsbn(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (normalized.length === 10 || normalized.length === 13) return normalized;
  return undefined;
}

function estimateWordCount(pageCount) {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return undefined;
  return Math.round(pageCount * WORDS_PER_PAGE);
}

function normalizeAuthor(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeAuthorNameKey(value) {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s.'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function looksLikeAuthorName(value) {
  const text = normalizeWhitespace(value);
  if (!text || text.length > 80) return false;
  if (/[0-9]/.test(text)) return false;
  if (/(very short introductions?|about the series|connect with oup|from our blog|higher education|international history|barack obama administration|condensed concepts|professor|emeritus|university|college|department|school|centre|center|institute|faculty|press|blog|administration)/i.test(text)) {
    return false;
  }
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 6) return false;
  return parts.every((part) => /^(?:[A-Z][A-Za-z.'’-]*|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)$/i.test(part));
}

function uniqueAuthorNames(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = normalizeWhitespace(value);
    if (!looksLikeAuthorName(text)) continue;
    const key = normalizeAuthorNameKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function extractAuthorNamesFromDelimitedText(value) {
  const text = normalizeWhitespace(value);
  if (!text) return [];
  return uniqueAuthorNames(
    text
      .split(/\s*(?:,|&|\band\b)\s*/i)
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean),
  );
}

function extractAuthorNamesFromAuthorInformation(value) {
  const text = normalizeWhitespace(value).replace(/^Author Information\s*/i, '');
  if (!text) return [];

  const names = [];
  const repeatedLeadingName = text.match(/^([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})\s+\1\b/);
  if (repeatedLeadingName?.[1]) {
    return uniqueAuthorNames([repeatedLeadingName[1]]);
  }

  const bylinePrefix = text
    .slice(0, 360)
    .split(/\b(?:recently|researched|wrote|teaches|works|worked|is|was|has|holds|served|serves)\b/i)[0]
    .trim();

  const leadingName = bylinePrefix.match(/^([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})(?=,\s)/);
  if (leadingName?.[1]) {
    names.push(leadingName[1]);
  }

  const additionalNamePattern = /,\s+and\s+([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})(?=,\s)/g;
  let match;
  while ((match = additionalNamePattern.exec(bylinePrefix)) !== null) {
    names.push(match[1]);
  }

  if (names.length === 0) {
    const leadingSegment = text.slice(0, 160).replace(/\.\s.*$/, '');
    names.push(...extractAuthorNamesFromDelimitedText(leadingSegment));
  }

  return uniqueAuthorNames(names);
}

function extractAuthorNamesFromFullDescription(value) {
  const text = normalizeWhitespace(value);
  if (!text) return [];

  const patterns = [
    /\bIn this Very Short Introduction,\s*([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5}(?:\s*(?:,|and)\s*[A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})*)\s+(?:provides|provide|explores|explore|offers|offer|examines|examine|considers|consider|argues|argue|shows|show|traces|trace|discusses|discuss|explains|explain)\b/i,
    /\bauthor(?:s)?\s+([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5}(?:\s*(?:,|and)\s*[A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|St|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})*)\s+(?:provides|provide|explores|explore|offers|offer|examines|examine|considers|consider|argues|argue|shows|show|traces|trace|discusses|discuss|explains|explain)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const names = extractAuthorNamesFromDelimitedText(match[1].replace(/\sand\s/gi, ', '));
    if (names.length > 0) return names;
  }

  return [];
}

function resolvePreferredProductAuthor(currentEntry, product) {
  const authorInfoNames = extractAuthorNamesFromAuthorInformation(product?.authorInformation);
  if (authorInfoNames.length > 0) {
    return authorInfoNames.join(', ');
  }

  const explicitNames = extractAuthorNamesFromDelimitedText(product?.author);
  if (explicitNames.length > 0) {
    return explicitNames.join(', ');
  }

  const descriptionNames = extractAuthorNamesFromFullDescription(product?.fullDescription);
  if (descriptionNames.length > 0) {
    return descriptionNames.join(', ');
  }

  return product?.author || currentEntry.author;
}

function cacheKeyForEntry(entry) {
  return `${normalizeTitle(entry.title)}::${normalizeAuthor(entry.author)}::${entry.edition ?? 1}`;
}

function listingMatchKey(entry) {
  return `${normalizeTitle(entry.title)}::${entry.edition ?? 1}`;
}

function buildListUrl(start = 0, sortField = 8) {
  return `${LIST_BASE_URL}&prevNumResPerPage=${resultsPerPage}&prevSortField=${sortField}&resultsPerPage=${resultsPerPage}&sortField=${sortField}&start=${start}`;
}

function canonicalProductUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url || '').split('?')[0];
  }
}

function canonicalizeListings(listings) {
  const deduped = {};
  for (const listing of Object.values(listings || {})) {
    if (!listing?.href || !listing?.rawTitle) continue;
    const key = `${normalizeTitle(listing.rawTitle)}::${listing.edition ?? ''}::${canonicalProductUrl(listing.href)}`;
    const existing = deduped[key];
    const existingHasPageCount = Number.isFinite(existing?.pageCount) && existing.pageCount > 0 && existing.pageCount !== resultsPerPage;
    const nextHasPageCount = Number.isFinite(listing.pageCount) && listing.pageCount > 0 && listing.pageCount !== resultsPerPage;
    if (!existing || (!existingHasPageCount && nextHasPageCount)) {
      deduped[key] = listing;
    }
  }
  return deduped;
}

function canonicalizeListingArray(listings) {
  return Object.values(
    canonicalizeListings(
      Object.fromEntries(
        listings.map((listing, index) => [`listing-${index}`, listing]),
      ),
    ),
  );
}

function listingStartOffset(listing) {
  try {
    const url = new URL(listing.href);
    const start = url.searchParams.get('start');
    return start ? Number(start) : 0;
  } catch {
    return 0;
  }
}

function getKnownListingStarts(listings) {
  return Array.from(
    new Set(
      listings
        .map((listing) => listingStartOffset(listing))
        .filter((value) => Number.isFinite(value) && value >= 0),
    ),
  ).sort((left, right) => left - right);
}

function findGridListingHoles(listings) {
  const knownStarts = getKnownListingStarts(listings);
  if (knownStarts.length === 0) return [];

  const knownSet = new Set(knownStarts);
  const maxStart = knownStarts.at(-1) ?? 0;
  const holes = [];
  for (let start = 0; start <= maxStart; start += 20) {
    if (!knownSet.has(start)) {
      holes.push(start);
    }
  }
  return holes;
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) {
    return { listings: {}, products: {}, updatedAt: undefined };
  }

  const cache = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  const canonicalProducts = {};
  for (const [key, value] of Object.entries(cache.products ?? {})) {
    canonicalProducts[canonicalProductUrl(key)] = value;
  }
  return {
    listings: canonicalizeListings(cache.listings ?? {}),
    products: canonicalProducts,
    updatedAt: cache.updatedAt,
  };
}

function loadManualListings(catalogEntries) {
  if (!existsSync(MANUAL_LISTINGS_PATH)) {
    return [];
  }

  const overrides = JSON.parse(readFileSync(MANUAL_LISTINGS_PATH, 'utf8'));
  const entryLookup = new Map(catalogEntries.map((entry) => [entry.title, entry]));

  return overrides.flatMap((override) => {
    const entry = entryLookup.get(override.title);
    if (!entry || !override.href) return [];
    return [{
      href: override.href,
      rawTitle: entry.title,
      edition: override.edition ?? entry.edition,
      context: override.note ?? 'Manual product URL override',
    }];
  });
}

function loadManualProducts(catalogEntries) {
  if (!existsSync(MANUAL_PRODUCTS_PATH)) {
    return [];
  }

  const overrides = JSON.parse(readFileSync(MANUAL_PRODUCTS_PATH, 'utf8'));
  const entryLookup = new Map(catalogEntries.map((entry) => [entry.title, entry]));

  return overrides.flatMap((override) => {
    const catalogTitle = override.catalogTitle ?? override.title;
    const entry = entryLookup.get(catalogTitle);
    if (!entry || !override.url) return [];
    return [{
      ...override,
      rawTitle: override.rawTitle ?? `${override.scrapedTitle ?? override.title ?? entry.title}: A Very Short Introduction`,
      title: override.scrapedTitle ?? override.title ?? entry.title,
      edition: override.edition ?? entry.edition,
      publicationYear: override.publicationYear ?? entry.publicationYear,
      url: canonicalProductUrl(override.url),
    }];
  });
}

function loadScrapeExclusions() {
  if (!existsSync(SCRAPE_EXCLUSIONS_PATH)) {
    return [];
  }

  const exclusions = JSON.parse(readFileSync(SCRAPE_EXCLUSIONS_PATH, 'utf8'));
  return Array.isArray(exclusions) ? exclusions : [];
}

function saveCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify({
    ...cache,
    listings: canonicalizeListings(cache.listings ?? {}),
  }, null, 2) + '\n');
}

function chooseListingForEntry(entry, listingLookup) {
  const candidates = listingLookup.get(normalizeTitle(entry.title)) ?? [];
  if (candidates.length === 0) return undefined;

  if (entry.edition) {
    const exactEdition = candidates.find((candidate) => candidate.edition === entry.edition);
    if (exactEdition) return exactEdition;
  }

  const unversioned = candidates.find((candidate) => candidate.edition == null);
  if (unversioned) return unversioned;

  if (!entry.edition) {
    const firstEdition = candidates.find((candidate) => candidate.edition === 1);
    if (firstEdition) return firstEdition;
  }

  return candidates[0];
}

function getCachedProductForListing(cache, listing) {
  if (!listing?.href) return undefined;
  const productKey = canonicalProductUrl(listing.href);
  return cache.products[productKey] ?? cache.products[listing.href];
}

async function waitForAccess(page, timeoutSec = 90) {
  for (let index = 0; index < timeoutSec; index += 1) {
    try {
      const state = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        const title = document.title || '';
        const combined = `${title}\n${text}`;
        if (
          /403\b|forbidden|access denied|request could not be satisfied|sorry, you have been blocked|temporarily unavailable/i.test(combined)
        ) {
          return 'blocked';
        }
        if (
          text.includes('Verify you are human')
          || text.includes('Performing security')
          || text.includes('security check')
        ) {
          return 'challenge';
        }

        if (text.length > 500) {
          return 'ok';
        }

        return 'loading';
      });

      if (state === 'ok') return true;
      if (state === 'blocked') return 'blocked';
      if (state === 'challenge' && index % 15 === 0) {
        console.log('  [OUP security challenge - solve it once in the browser window]');
      }
    } catch {
      // retry
    }

    await sleep(1000);
  }

  return false;
}

async function gotoWithAccess(page, url, label) {
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (error) {
    const blocked = await page.evaluate(() => {
      const text = `${document.title || ''}\n${document.body?.innerText || ''}`;
      return /403\b|forbidden|access denied|request could not be satisfied|sorry, you have been blocked|temporarily unavailable/i.test(text);
    }).catch(() => false);

    if (blocked) {
      return { state: 'blocked', status: 403 };
    }

    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const status = response?.status?.() ?? undefined;
  if (status === 403 || status === 429) {
    return { state: 'blocked', status };
  }

  const access = await waitForAccess(page, 90);
  if (access === true) return { state: 'ok', status };
  if (access === 'blocked') return { state: 'blocked', status: status ?? 403 };
  return { state: 'timeout', status };
}

async function setResultsPerPage(page) {
  if (!Number.isFinite(resultsPerPage) || resultsPerPage === 20) return false;

  const changed = await page.evaluate((value) => {
    const normalize = (input) => String(input || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const wanted = String(value);
    const candidates = Array.from(document.querySelectorAll('a, button, option, input, label'));

    const target = candidates.find((element) => {
      const ownText = normalize(
        element.textContent
        || element.getAttribute('value')
        || element.getAttribute('aria-label')
        || '',
      );
      if (ownText !== wanted) return false;
      const context = normalize(element.closest('form, fieldset, nav, section, div, ul')?.innerText || '');
      return context.includes('results per page');
    });

    if (!target) return false;

    if (target instanceof HTMLOptionElement && target.parentElement instanceof HTMLSelectElement) {
      target.selected = true;
      target.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (target instanceof HTMLInputElement) {
      target.click();
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (target instanceof HTMLElement) {
      target.click();
      return true;
    }

    return false;
  }, resultsPerPage).catch(() => false);

  if (!changed) return false;

  await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
  await sleep(1000);
  return true;
}

async function extractListingsFromPage(page) {
  return page.evaluate(() => {
    const normalize = (value) => value.replace(/\s+/g, ' ').trim();
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.getClientRects().length === 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const results = [];
    const seen = new Set();

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const anchor of anchors) {
      if (!isVisible(anchor)) continue;
      const href = anchor.href || anchor.getAttribute('href') || '';
      if (!href.includes('/academic/product/')) continue;

      const rawTitle = normalize(anchor.textContent || '');
      if (!rawTitle || rawTitle.length > 220) continue;

      let container = anchor;
      let context = '';
      let fallbackContext = '';
      for (let depth = 0; depth < 8; depth += 1) {
        container = container.parentElement;
        if (!container) break;
        const candidate = normalize(container.innerText || '');
        if (!candidate || !candidate.includes(rawTitle)) continue;
        if (/very short introductions?/i.test(candidate) && candidate.length < 1200) {
          fallbackContext = candidate;
        }
        if (
          /very short introductions?/i.test(candidate)
          && /\b(?:paperback|hardback|ebook|epub)\b/i.test(candidate)
          && candidate.length < 900
        ) {
          context = candidate;
          break;
        }
      }

      context ||= fallbackContext;
      if (!context) continue;

      const pageCountMatches = Array.from(
        context.matchAll(/\b(\d{2,4})\s+pages?\b(?!\s+\d+\s+of\b)/ig),
      );
      const pageCount = pageCountMatches.length > 0
        ? Number(pageCountMatches.at(-1)?.[1] || '')
        : undefined;

      const editionMatch = context.match(/\((\d+)\w*\s+(?:edn|edition)\)/i)
        ?? context.match(/\b(\d+)\w*\s+(?:edn|edition)\b/i);
      const edition = editionMatch ? Number(editionMatch[1]) : undefined;
      const key = `${href}::${edition ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        href,
        rawTitle,
        pageCount,
        edition,
        context,
      });
    }

    return results;
  });
}

async function expandProductSections(page) {
  const labels = ['Description', 'Table of contents', 'Author Information'];
  for (const label of labels) {
    await page.evaluate((targetLabel) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const wanted = normalize(targetLabel);
      const candidates = Array.from(document.querySelectorAll('button, summary, [role="button"], a[href^="#"], h2, h3, h4'));
      const target = candidates.find((element) => {
        const text = normalize(element.textContent || '');
        return text === wanted || text.startsWith(`${wanted} `) || text.includes(wanted);
      });
      if (!target) return false;
      const clickable = target.matches('button, summary, [role="button"], a[href^="#"]')
        ? target
        : target.closest('button, summary, [role="button"], a[href^="#"]');
      const element = clickable || target;
      if (element instanceof HTMLElement) {
        element.click();
        return true;
      }
      return false;
    }, label).catch(() => false);
    await page.waitForTimeout(250);
  }
}

async function extractSortOptions(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const candidates = Array.from(document.querySelectorAll('select'))
      .map((select) => ({
        options: Array.from(select.querySelectorAll('option')).map((option) => ({
          value: option.getAttribute('value') || option.value || '',
          text: normalize(option.textContent || ''),
          selected: option.selected,
        })),
        context: normalize(select.closest('form, fieldset, nav, section, div')?.innerText || ''),
      }))
      .filter((entry) => entry.options.length > 0 && /sort by/i.test(entry.context));
    return candidates[0]?.options ?? [];
  });
}

async function extractProductData(page) {
  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const looksLikePersonName = (value) => {
      const text = normalize(value);
      if (!text || text.length > 80) return false;
      if (/[0-9]/.test(text)) return false;
      if (/author information|very short introductions?/i.test(text)) return false;
      if (/(about the series|professor|university|academy|award|emeritus|director|editor|paperback|hardback|introduction|very short)/i.test(text)) {
        return false;
      }
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length < 2 || parts.length > 6) return false;
      return parts.every((part) => /^(?:[A-Z][A-Za-z.'’-]*|[A-Z]\.|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)$/i.test(part));
    };
    const parseAuthorLine = (value) => {
      const text = normalize(value);
      if (!text || text.length > 160) return undefined;
      if (/(edition|very short introductions?|new to this edition|show more|pages|isbn|paperback|hardback|publication date|description|table of contents|author information|notify me when in stock|in stock|buy now|add to basket|ebook)/i.test(text)) {
        return undefined;
      }
      const parts = text
        .split(/\s*(?:,|&| and )\s*/i)
        .map((part) => normalize(part))
        .filter(Boolean);
      if (parts.length === 0 || parts.some((part) => !looksLikePersonName(part))) {
        return undefined;
      }
      return parts.join(', ');
    };
    const isHeroBulletLine = (value) => {
      const text = normalize(value);
      if (!text || text.length < 20 || text.length > 220) return false;
      if (
        /^(new to this edition:?|very short introductions?|description|table of contents|author information|read more|show more|notify me when in stock|view all formats and editions)$/i.test(text)
      ) {
        return false;
      }
      if (/(publication date|print isbn|pages|paperback|hardback|price|quantity|buy now|add to basket|ebook|amazon|author information)/i.test(text)) {
        return false;
      }
      if (parseAuthorLine(text)) return false;
      return true;
    };
    const cleanHeroListItem = (value) => {
      const text = normalize(value).replace(/^[•\-]\s*/, '');
      if (!text) return undefined;
      if (/^(show more|read more|view all formats and editions)$/i.test(text)) return undefined;
      return text;
    };
    const findHeroContainer = (titleElement) => {
      let node = titleElement;
      while (node) {
        if (!(node instanceof HTMLElement)) {
          node = node?.parentElement || null;
          continue;
        }
        const text = normalize(node.innerText || '');
        if (!/very short introductions?/i.test(text) || text.length > 5000) {
          node = node.parentElement;
          continue;
        }
        const listCount = Array.from(node.querySelectorAll('ul, ol')).filter((list) => list.querySelector(':scope > li')).length;
        if (listCount > 0) return node;
        node = node.parentElement;
      }
      return titleElement?.closest('section, article, div') ?? null;
    };
    const extractHeroLists = (container) => {
      if (!(container instanceof HTMLElement)) {
        return { highlights: undefined, newToThisEdition: undefined };
      }

      const listEntries = Array.from(container.querySelectorAll('ul, ol'))
        .map((list) => {
          const items = Array.from(list.querySelectorAll(':scope > li'))
            .map((item) => cleanHeroListItem(item.innerText || item.textContent || ''))
            .filter(Boolean);
          if (items.length === 0) return null;

          const contextParts = [];
          let sibling = list.previousElementSibling;
          for (let index = 0; sibling && index < 12; index += 1) {
            const text = normalize(sibling.textContent || sibling.innerText || '');
            if (text) contextParts.unshift(text);
            sibling = sibling.previousElementSibling;
          }

          return {
            items,
            context: normalize(contextParts.join(' ')).toLowerCase(),
          };
        })
        .filter(Boolean);

      if (listEntries.length === 0) {
        return { highlights: undefined, newToThisEdition: undefined };
      }

      const collectItems = (section) => {
        const items = [];
        for (const entry of listEntries) {
          const belongsToSection = section === 'newToThisEdition'
            ? /new to this edition/.test(entry.context)
            : !/new to this edition/.test(entry.context);
          if (!belongsToSection) continue;
          for (const item of entry.items) {
            if (!items.includes(item)) items.push(item);
          }
        }
        return items.length > 0 ? items : undefined;
      };

      return {
        highlights: collectItems('highlights'),
        newToThisEdition: collectItems('newToThisEdition'),
      };
    };
    const collectHeroBulletLines = (startIndex, stopIndex = bodyLines.length) => {
      const items = [];
      for (let index = startIndex; index < Math.min(stopIndex, bodyLines.length); index += 1) {
        const line = normalize(bodyLines[index]).replace(/^[•\-]\s*/, '');
        if (!line) continue;
        if (
          /^(new to this edition:?|description|table of contents|author information|read more|show more|view all formats and editions)$/i.test(line)
          || /(publication date|print isbn|pages|paperback|hardback|price|quantity)/i.test(line)
        ) {
          break;
        }
        if (isHeroBulletLine(line)) {
          items.push(line);
          continue;
        }
        if (items.length > 0) {
          break;
        }
      }
      return items.length > 0 ? items : undefined;
    };
    const normalizeIsbnLocal = (value) => {
      const normalized = String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
      if (normalized.length === 10 || normalized.length === 13) return normalized;
      return undefined;
    };
    const parseEditionLocal = (text) => {
      const normalized = normalize(text);
      const match = normalized.match(/\((\d+)\w*\s+(?:edn|edition)\)/i)
        ?? normalized.match(/\b(\d+)\w*\s+(?:edn|edition)\b/i);
      return match ? Number(match[1]) : undefined;
    };
    const toAuthorString = (value) => {
      if (!value) return undefined;
      const values = Array.isArray(value) ? value : [value];
      const names = values
        .map((entry) => {
          if (typeof entry === 'string') return normalize(entry);
          if (entry && typeof entry === 'object') return normalize(entry.name || entry['@name'] || '');
          return '';
        })
        .filter(Boolean);
      return names.length > 0 ? names.join(', ') : undefined;
    };
    const flattenLdJson = (value) => {
      if (Array.isArray(value)) return value.flatMap(flattenLdJson);
      if (value && typeof value === 'object' && Array.isArray(value['@graph'])) {
        return value['@graph'].flatMap(flattenLdJson);
      }
      return value ? [value] : [];
    };
    const findSectionTrigger = (label) => {
      const normalizedLabel = normalize(label).toLowerCase();
      const candidates = Array.from(document.querySelectorAll('button, summary, [role="button"], a[href^="#"], h2, h3, h4'));
      return candidates.find((element) => {
        const text = normalize(element.textContent || '').toLowerCase();
        return text === normalizedLabel || text.startsWith(`${normalizedLabel} `) || text.includes(normalizedLabel);
      });
    };
    const extractSection = (label) => {
      const cleanedText = (value) => normalize(value || '').replace(new RegExp(`^${label}\\s*`, 'i'), '').trim();
      const trigger = findSectionTrigger(label);

      if (trigger) {
        const controlsId = trigger.getAttribute('aria-controls')
          || (trigger instanceof HTMLAnchorElement && trigger.getAttribute('href')?.startsWith('#')
            ? trigger.getAttribute('href')?.slice(1)
            : null);
        if (controlsId) {
          const controlled = document.getElementById(controlsId);
          const text = cleanedText(controlled?.innerText || '');
          if (text) return text;
        }

        const container = trigger.closest('section, details, article, div, li');
        const containerText = cleanedText(container?.innerText || '');
        if (containerText && containerText.length > normalizedLabel.length + 20) {
          return containerText;
        }
      }

      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      const normalizedLabel = normalize(label).toLowerCase();
      const heading = headings.find((element) => {
        const text = normalize(element.textContent || '').toLowerCase();
        return text === normalizedLabel || text.startsWith(`${normalizedLabel} `) || text.includes(normalizedLabel);
      });
      if (!heading) return undefined;

      const fragments = [];
      let node = heading.nextElementSibling;
      while (node && !/^H[1-6]$/.test(node.tagName)) {
        const text = normalize(node.innerText || '');
        if (text) fragments.push(text);
        node = node.nextElementSibling;
      }

      const text = cleanedText(fragments.join(' '));
      return text || undefined;
    };
    const extractAuthorNames = () => {
      const trigger = findSectionTrigger('Author Information');
      let container = null;
      if (trigger) {
        const controlsId = trigger.getAttribute('aria-controls')
          || (trigger instanceof HTMLAnchorElement && trigger.getAttribute('href')?.startsWith('#')
            ? trigger.getAttribute('href')?.slice(1)
            : null);
        container = controlsId ? document.getElementById(controlsId) : null;
        if (!container) {
          container = trigger.closest('section, details, article, div, li');
        }
      }

      const unique = (values) => Array.from(new Set(values.map((value) => normalize(value)).filter(Boolean)));
      const sectionCandidates = container
        ? unique(
          Array.from(container.querySelectorAll('a, h2, h3, h4, h5, strong, b, [itemprop="name"]'))
            .map((element) => element.textContent || '')
            .filter(looksLikePersonName),
        )
        : [];
      if (sectionCandidates.length > 0) {
        return sectionCandidates.join(', ');
      }

      const sectionText = normalize(container?.innerText || '');
      if (!sectionText) return undefined;

      const matches = [];
      const pattern = /(?:^|[.]\s+)([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})(?=,\s)/g;
      let match;
      while ((match = pattern.exec(sectionText)) !== null) {
        if (looksLikePersonName(match[1])) {
          matches.push(match[1]);
        }
      }

      const uniqueMatches = unique(matches);
      return uniqueMatches.length > 0 ? uniqueMatches.join(', ') : undefined;
    };

    const rawBodyText = document.body?.innerText || '';
    const bodyText = normalize(rawBodyText);
    const bodyLines = rawBodyText
      .split(/\n+/)
      .map((line) => normalize(line))
      .filter(Boolean);
    const ldNodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap((script) => {
        try {
          return flattenLdJson(JSON.parse(script.textContent || 'null'));
        } catch {
          return [];
        }
      });
    const bookNode = ldNodes.find((node) => {
      const types = Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']];
      return types.some((type) => type === 'Book' || type === 'Product');
    }) ?? {};

    const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim() || '';
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || location.href;
    const titleElement = document.querySelector('h1');
    const titleRaw = normalize(
      titleElement?.textContent
      || bookNode.name
      || meta('meta[property="og:title"]')
      || '',
    );
    const title = titleRaw
      .replace(/:\s*a very short introduction/i, '')
      .replace(/\s*\((?:\d+\w*|new)\s+(?:edn|edition)\)/i, '')
      .trim();
    const titleIndex = bodyLines.findIndex((line) => {
      const normalizedLine = normalize(line).toLowerCase();
      return normalizedLine === normalize(titleRaw).toLowerCase()
        || normalizedLine === normalize(title).toLowerCase();
    });
    const seriesIndex = titleIndex >= 0
      ? bodyLines.findIndex((line, index) => index > titleIndex && /^very short introductions?$/i.test(normalize(line)))
      : -1;
    const heroAuthor = titleIndex >= 0
      ? bodyLines
        .slice(titleIndex + 1, seriesIndex > titleIndex ? seriesIndex : titleIndex + 8)
        .map((line) => parseAuthorLine(line))
        .filter(Boolean)
        .at(-1)
      : undefined;
    const heroContainer = findHeroContainer(titleElement);
    const heroLists = extractHeroLists(heroContainer);
    const newToThisEditionIndex = seriesIndex >= 0
      ? bodyLines.findIndex((line, index) => index > seriesIndex && /^new to this edition:?$/i.test(normalize(line)))
      : -1;
    const highlights = heroLists.highlights
      ?? (
        seriesIndex >= 0
          ? collectHeroBulletLines(
            seriesIndex + 1,
            newToThisEditionIndex > seriesIndex ? newToThisEditionIndex : bodyLines.length,
          )
          : undefined
      );
    const newToThisEdition = heroLists.newToThisEdition
      ?? (
        newToThisEditionIndex >= 0
          ? collectHeroBulletLines(newToThisEditionIndex + 1)
          : undefined
      );
    const description = normalize(
      bookNode.description
      || meta('meta[name="description"]')
      || meta('meta[property="og:description"]')
      || '',
    ) || undefined;
    const publicationDateMatch = bodyText.match(/Publication Date\s*[:\n]\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|[A-Za-z]+\s+[0-9]{4})/i)
      ?? bodyText.match(/Published\s*[:\n]\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|[A-Za-z]+\s+[0-9]{4})/i);
    const publicationDate = normalize(
      bookNode.datePublished
      || (publicationDateMatch?.[1] ?? ''),
    ) || undefined;
    const printIsbn = normalizeIsbnLocal(
      bookNode.isbn
      || (bodyText.match(/(?:Print ISBN|ISBN(?:-13)?)\s*[:\n]\s*([0-9X -]+)/i)?.[1] ?? ''),
    );
    const pageCountMatch = bodyText.match(/\b(\d{2,4})\s+pages?\b/i);
    const pageCount = pageCountMatch ? Number(pageCountMatch[1]) : undefined;
    const edition = parseEditionLocal(bookNode.bookEdition || titleRaw || bodyText);
    const fullDescription = extractSection('Description')?.replace(/\bShow more\b\s*$/i, '').trim();
    const tableOfContents = extractSection('Table of contents');
    const authorInformation = extractSection('Author Information');
    const authorFromAuthorInfoText = normalize(authorInformation || '')
      .replace(/^Author Information\s*/i, '')
      .match(/([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})(?=,\s)/)?.[1];
    const authorFromFullDescription = normalize(fullDescription || '')
      .match(/\bauthor\s+([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})(?=\s+(?:provides|explores|offers|examines|considers|argues|shows|traces|discusses))/i)?.[1];
    const author = extractAuthorNames()
      || authorFromAuthorInfoText
      || heroAuthor
      || authorFromFullDescription
      || toAuthorString(bookNode.author)
      || meta('meta[name="citation_author"]')
      || meta('meta[name="dc.creator"]')
      || meta('meta[property="book:author"]')
      || (bodyText.match(/\bBy\s+([A-Z][A-Za-z.'’-]+(?:\s+(?:[A-Z][A-Za-z.'’-]+|[A-Z]\.|de|da|del|della|di|du|la|le|van|von|bin|ibn|al)){1,5})\b/)?.[1] ?? '')
      || (bodyText.match(/(?:Author|Authors)\s*[:\n]\s*(.+?)(?=(?:Publication Date|Pages|ISBN|Format|Price)\b)/i)?.[1]?.trim())
      || undefined;
    const amazonEbookUrl = Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => ({
        href: anchor.href,
        text: normalize(anchor.textContent || ''),
      }))
      .find(({ href, text }) => /amazon\./i.test(href) && /kindle|ebook/i.test(`${text} ${href}`))
      ?.href
      || Array.from(document.querySelectorAll('a[href]'))
        .map((anchor) => anchor.href)
        .find((href) => /amazon\./i.test(href))
      || undefined;

    return {
      url: canonicalUrl,
      rawTitle: titleRaw,
      title,
      author,
      edition,
      publicationDate,
      printIsbn,
      description,
      highlights,
      newToThisEdition,
      fullDescription,
      tableOfContents,
      authorInformation,
      amazonEbookUrl,
      pageCount,
    };
  });
}

function resolveSortFieldForPass(passNumber) {
  if (explicitSortFields && explicitSortFields.length > 0) {
    return explicitSortFields[(passNumber - 1) % explicitSortFields.length];
  }
  if (Number.isFinite(explicitSortField)) {
    return explicitSortField;
  }
  return 8;
}

async function ensureListingCache(page, cache, catalogEntries, sortField = 8, options = {}) {
  if (force || forceListings) {
    cache.listings = {};
  }
  const existingListings = Object.values(cache.listings || {});
  const remainingTargets = new Set(catalogEntries.map((entry) => listingMatchKey(entry)));
  if (!(force || forceListings)) {
    for (const listing of existingListings) {
      const titleKey = normalizeTitle(listing.rawTitle);
      remainingTargets.delete(`${titleKey}::${listing.edition ?? 1}`);
      if (listing.edition == null) {
        for (const key of Array.from(remainingTargets)) {
          if (key.startsWith(`${titleKey}::`)) {
            remainingTargets.delete(key);
          }
        }
      }
    }
  }

  if (!(force || forceListings) && existingListings.length > 0 && remainingTargets.size === 0) {
    return { listings: existingListings, blocked: false, requestedStartLoaded: false };
  }

  const listings = (force || forceListings) ? [] : existingListings.slice();
  const requestedStart = Math.max(0, Number.isFinite(options.start) ? options.start : 0);
  let start = requestedStart;
  const seenPageSignatures = new Set();
  let blocked = false;
  let requestedStartLoaded = false;
  if (!(force || forceListings) && existingListings.length > 0) {
    console.log(`Refreshing listing crawl from start=${start} with ${existingListings.length} cached listings using sort field ${sortField}.`);
  }

  while (true) {
    const url = buildListUrl(start, sortField);
    console.log(`\nLoading listings page starting at ${start}...`);
    let result = { state: 'timeout' };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      result = await gotoWithAccess(page, url, `Listing page start=${start}`);
      if (result.state === 'ok' || result.state === 'blocked') break;
      console.log(`  Retry ${attempt + 1} for start=${start}...`);
    }
    if (result.state !== 'ok') {
      if (result.state === 'blocked' && listings.length > 0) {
        blocked = true;
        console.log(`  Stopping at start=${start} after ${result.status ?? 403} block; keeping ${listings.length} scraped listings.`);
        break;
      }
      if (listings.length > 0) {
        console.log(`  Stopping at start=${start} after timeout; keeping ${listings.length} scraped listings.`);
        break;
      }
      throw new Error(`Could not access OUP listing page at start=${start}${result.status ? ` (status ${result.status})` : ''}`);
    }

    await sleep(1500);
    const pageListings = await extractListingsFromPage(page);
    const freshListings = pageListings.filter((listing) => listing.href && listing.rawTitle);
    console.log(`  Extracted ${freshListings.length} listings from this page.`);

    if (freshListings.length === 0) break;
    if (start === requestedStart) {
      requestedStartLoaded = true;
    }
    const pageSignature = freshListings.map((listing) => canonicalProductUrl(listing.href)).join('|');
    if (seenPageSignatures.has(pageSignature)) {
      console.log('  Listing page repeated previous results; stopping crawl.');
      break;
    }
    seenPageSignatures.add(pageSignature);

    listings.push(...freshListings);
    for (const listing of freshListings) {
      const titleKey = normalizeTitle(listing.rawTitle);
      cache.listings[`${titleKey}::${listing.edition ?? ''}::${canonicalProductUrl(listing.href)}`] = listing;
      remainingTargets.delete(`${titleKey}::${listing.edition ?? 1}`);
      if (listing.edition == null) {
        for (const key of Array.from(remainingTargets)) {
          if (key.startsWith(`${titleKey}::`)) {
            remainingTargets.delete(key);
          }
        }
      }
    }
    cache.updatedAt = new Date().toISOString();
    saveCache(cache);

    if (remainingTargets.size === 0) {
      console.log('  Found listings for all requested catalog entries; stopping listing crawl early.');
      break;
    }

    if (freshListings.length < 20) break;
    start += freshListings.length;
  }

  return { listings: Object.values(cache.listings), blocked, requestedStartLoaded };
}

function buildListingLookup(listings) {
  const listingLookup = new Map();

  for (const listing of listings) {
    const key = normalizeTitle(listing.rawTitle);
    const bucket = listingLookup.get(key) ?? [];
    const existingIndex = bucket.findIndex((candidate) => canonicalProductUrl(candidate.href) === canonicalProductUrl(listing.href) && candidate.edition === listing.edition);
    if (existingIndex >= 0) {
      const existing = bucket[existingIndex];
      const existingHasPageCount = Number.isFinite(existing.pageCount) && existing.pageCount > 0 && existing.pageCount !== resultsPerPage;
      const nextHasPageCount = Number.isFinite(listing.pageCount) && listing.pageCount > 0 && listing.pageCount !== resultsPerPage;
      if (!existingHasPageCount && nextHasPageCount) {
        bucket[existingIndex] = listing;
      }
    } else {
      bucket.push(listing);
      listingLookup.set(key, bucket);
    }
  }

  return listingLookup;
}

function buildScrapedEntry(entry, listing, product) {
  if (!listing && !product) return null;

  const publicationDate = product?.publicationDate;
  const publicationYearMatch = publicationDate?.match(/\b(19|20)\d{2}\b/);

  return {
    title: product?.title || cleanVsiTitle(listing?.rawTitle || entry.title),
    author: resolvePreferredProductAuthor(entry, product),
    edition: product?.edition ?? listing?.edition ?? entry.edition,
    publicationDate: publicationDate || undefined,
    publicationYear: publicationYearMatch ? Number(publicationYearMatch[0]) : undefined,
    printIsbn: product?.printIsbn,
    pageCount: product?.pageCount ?? listing?.pageCount,
    wordCount: estimateWordCount(product?.pageCount ?? listing?.pageCount),
    description: product?.description,
    highlights: product?.highlights,
    newToThisEdition: product?.newToThisEdition,
    fullDescription: product?.fullDescription,
    tableOfContents: product?.tableOfContents,
    authorInformation: product?.authorInformation,
    amazonEbookUrl: product?.amazonEbookUrl,
    productUrl: product?.url ?? listing?.href,
    listingUrl: listing?.href,
  };
}

function compareValues(left, right) {
  return normalizeWhitespace(left || '') === normalizeWhitespace(right || '');
}

function compareStringArrays(left, right) {
  const normalizeArray = (value) => (Array.isArray(value) ? value.map((item) => normalizeWhitespace(item)).filter(Boolean) : []);
  const leftItems = normalizeArray(left);
  const rightItems = normalizeArray(right);
  if (leftItems.length !== rightItems.length) return false;
  return leftItems.every((item, index) => item === rightItems[index]);
}

function buildDiffReport(catalog, scrapedEntries) {
  const entries = [];
  const fieldCounts = {};
  const missingFromScrape = [];

  for (const catalogEntry of catalog.titles) {
    const scraped = scrapedEntries.get(cacheKeyForEntry(catalogEntry));
    if (!scraped) {
      missingFromScrape.push({
        title: catalogEntry.title,
        author: catalogEntry.author,
        edition: catalogEntry.edition,
      });
      continue;
    }

    const differences = {};
    const checkDifference = (field, currentValue, scrapedValue, formatter = (value) => value) => {
      if (scrapedValue == null || scrapedValue === '') return;
      if (currentValue == null || currentValue === '') {
        differences[field] = { current: currentValue ?? null, scraped: formatter(scrapedValue) };
        fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
        return;
      }
      const same = typeof currentValue === 'string' || typeof scrapedValue === 'string'
        ? compareValues(currentValue, scrapedValue)
        : currentValue === scrapedValue;
      if (!same) {
        differences[field] = { current: currentValue, scraped: formatter(scrapedValue) };
        fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
      }
    };

    checkDifference('title', catalogEntry.title, scraped.title);
    checkDifference('author', catalogEntry.author, scraped.author);
    checkDifference('edition', catalogEntry.edition ?? 1, scraped.edition ?? 1);
    checkDifference('publicationYear', catalogEntry.publicationYear, scraped.publicationYear);
    checkDifference('publicationDate', catalogEntry.publicationDate, scraped.publicationDate);
    checkDifference('printIsbn', catalogEntry.printIsbn, scraped.printIsbn);
    checkDifference('pageCount', catalogEntry.pageCount, scraped.pageCount);
    checkDifference('wordCount', catalogEntry.wordCount, scraped.wordCount);
    checkDifference('productUrl', undefined, scraped.productUrl);
    if ((scraped.highlights?.length ?? 0) > 0 && !compareStringArrays(catalogEntry.highlights, scraped.highlights)) {
      differences.highlights = {
        current: catalogEntry.highlights ?? null,
        scraped: scraped.highlights,
      };
      fieldCounts.highlights = (fieldCounts.highlights ?? 0) + 1;
    }
    if ((scraped.newToThisEdition?.length ?? 0) > 0 && !compareStringArrays(catalogEntry.newToThisEdition, scraped.newToThisEdition)) {
      differences.newToThisEdition = {
        current: catalogEntry.newToThisEdition ?? null,
        scraped: scraped.newToThisEdition,
      };
      fieldCounts.newToThisEdition = (fieldCounts.newToThisEdition ?? 0) + 1;
    }

    if (Object.keys(differences).length > 0) {
      entries.push({
        title: catalogEntry.title,
        author: catalogEntry.author,
        edition: catalogEntry.edition,
        differences,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalCatalogEntries: catalog.titles.length,
    scrapedMatches: catalog.titles.length - missingFromScrape.length,
    missingFromScrape,
    differingEntries: entries.length,
    differingFields: fieldCounts,
    entries,
  };
}

function isBlockLikeMessage(value) {
  return /403\b|blocked|forbidden|access denied|request could not be satisfied|temporarily unavailable/i.test(String(value || ''));
}

async function runScrapePass(passNumber = 1) {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const cache = loadCache();
  const scrapeExclusions = loadScrapeExclusions();
  const excludedTitleSet = new Set(scrapeExclusions.map((entry) => normalizeTitle(entry.title)).filter(Boolean));
  const titleMatchedEntries = titleFilter
    ? catalog.titles.filter((entry) => normalizeTitle(entry.title) === normalizeTitle(titleFilter))
    : catalog.titles;
  const includedTitleMatchedEntries = titleMatchedEntries.filter((entry) => !excludedTitleSet.has(normalizeTitle(entry.title)));
  const catalogEntries = Number.isFinite(limit) ? includedTitleMatchedEntries.slice(0, limit) : includedTitleMatchedEntries;
  const manualListings = loadManualListings(catalogEntries);
  const manualProducts = loadManualProducts(catalogEntries);

  if (titleFilter && catalogEntries.length === 0) {
    throw new Error(`No VSI catalog entry matched --title=${titleFilter}`);
  }

  if (untilComplete) {
    console.log(`\n=== Scrape pass ${passNumber} ===`);
  }
  const sortFieldForPass = resolveSortFieldForPass(passNumber);
  console.log(`VSI catalog entries selected: ${catalogEntries.length}`);
  if (scrapeExclusions.length > 0) {
    console.log(`Excluded from scrape target: ${scrapeExclusions.map((entry) => entry.title).join(', ')}`);
  }
  console.log(`Using listing sort field: ${sortFieldForPass}`);
  const browserWindow = resolveBrowserWindowPlacement();
  console.log(
    `Browser window: ${browserWindow.width}x${browserWindow.height} at (${browserWindow.x}, ${browserWindow.y}) [${browserWindow.target}]`,
  );

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      `--window-position=${browserWindow.x},${browserWindow.y}`,
      `--window-size=${browserWindow.width},${browserWindow.height}`,
    ],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: null,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await context.newPage();

  try {
    for (const product of manualProducts) {
      const productKey = canonicalProductUrl(product.url);
      cache.products[productKey] ??= product;
    }

    const cachedListings = canonicalizeListingArray([
      ...Object.values(cache.listings ?? {}),
      ...manualListings,
    ]);
    const cachedListingLookup = buildListingLookup(cachedListings);
    const entryListingState = catalogEntries.map((entry, index) => {
      const listing = chooseListingForEntry(entry, cachedListingLookup);
      return {
        entry,
        index,
        listing,
        hasCachedProduct: Boolean(getCachedProductForListing(cache, listing)),
      };
    });
    const pendingKnownProducts = entryListingState.filter((item) => item.listing && !item.hasCachedProduct).length;
    const shouldRefreshListings = Number.isFinite(explicitListingStart)
      || force
      || forceListings
      || !untilComplete
      || cachedListings.length === 0
      || pendingKnownProducts === 0;
    let listingAccessBlocked = false;

    console.log('Open browser launched.');
    console.log('If prompted, reject cookies and complete any security check once.');
    const initialListingStart = Number.isFinite(explicitListingStart) ? explicitListingStart : 0;
    const initial = await gotoWithAccess(page, buildListUrl(initialListingStart, sortFieldForPass), 'Initial OUP listing page');
    if (initial.state !== 'ok') {
      if (inspectSortOptions) {
        throw new Error(`Could not access initial OUP page${initial.status ? ` (status ${initial.status})` : ''}.`);
      }
      if (cachedListings.length > 0 && untilComplete) {
        listingAccessBlocked = true;
        console.log(`Initial OUP page blocked${initial.status ? ` (status ${initial.status})` : ''}; using cached listings for this pass.`);
      } else {
        throw new Error(`Could not access initial OUP page${initial.status ? ` (status ${initial.status})` : ''}.`);
      }
    }

    if (inspectSortOptions) {
      const options = await extractSortOptions(page);
      console.log(JSON.stringify(options, null, 2));
      return {
        catalogEntries: catalogEntries.length,
        scrapedMatches: 0,
        missingFromScrape: catalogEntries.length,
        differingEntries: 0,
        cacheListings: Object.keys(cache.listings ?? {}).length,
        cacheProducts: Object.keys(cache.products ?? {}).length,
        stoppedReason: undefined,
      };
    }

    let listings = cachedListings;
    let blockedDuringPass = listingAccessBlocked;
    let listingProbeSucceeded = false;
    if (shouldRefreshListings && !listingAccessBlocked) {
      const deepestStart = cachedListings.length > 0
        ? Math.max(...cachedListings.map((listing) => listingStartOffset(listing)))
        : 0;
      const gridHoles = untilComplete && cachedListings.length > 0 && pendingKnownProducts === 0
        ? findGridListingHoles(cachedListings)
        : [];
      const holeIndex = gridHoles.length > 0
        ? (Math.max(1, passNumber) - 1) % gridHoles.length
        : 0;
      const listingRefreshStart = Number.isFinite(explicitListingStart)
        ? explicitListingStart
        : untilComplete && cachedListings.length > 0
          ? (gridHoles[holeIndex] ?? Math.max(0, deepestStart - 40))
          : 0;
      if (Number.isFinite(explicitListingStart)) {
        console.log(`Targeting explicit listing range start=${listingRefreshStart}.`);
      } else if (gridHoles.length > 0) {
        console.log(`Targeting uncovered listing range starting at ${listingRefreshStart} (${holeIndex + 1}/${gridHoles.length}) before probing the frontier.`);
      }
      const listingRefreshResult = await ensureListingCache(page, cache, catalogEntries, sortFieldForPass, { start: listingRefreshStart });
      listings = listingRefreshResult.listings;
      blockedDuringPass = blockedDuringPass || listingRefreshResult.blocked;
      listingProbeSucceeded = listingRefreshResult.requestedStartLoaded;
    } else if (shouldRefreshListings && listingAccessBlocked) {
      console.log('Skipping listing refresh because live OUP access is blocked for this pass.');
    } else {
      console.log(`Skipping listing refresh; ${pendingKnownProducts} known product pages are still uncached.`);
    }
    const augmentedListings = canonicalizeListingArray([
      ...listings,
      ...manualListings,
    ]);
    listings = augmentedListings;
    if (manualListings.length > 0) {
      console.log(`Applied ${manualListings.length} manual listing override${manualListings.length === 1 ? '' : 's'}.`);
    }
    if (manualProducts.length > 0) {
      console.log(`Applied ${manualProducts.length} manual product override${manualProducts.length === 1 ? '' : 's'}.`);
    }
    console.log(`Cached OUP listings with page counts: ${listings.length}`);

    if (listingOnly) {
      return {
        catalogEntries: catalogEntries.length,
        scrapedMatches: 0,
        missingFromScrape: catalogEntries.length,
        differingEntries: 0,
        cacheListings: Object.keys(cache.listings ?? {}).length,
        cacheProducts: Object.keys(cache.products ?? {}).length,
        stoppedReason: listingProbeSucceeded
          ? `Loaded listing page at start=${Number.isFinite(explicitListingStart) ? explicitListingStart : 0}`
          : undefined,
        wasBlocked: blockedDuringPass,
        pendingKnownProducts,
        listingProbeSucceeded,
      };
    }

    const listingLookup = buildListingLookup(listings);
    const scrapedEntries = new Map();
    let stoppedReason;
    let productFetchBlocked = false;
    let queue = catalogEntries
      .map((entry, index) => {
        const listing = chooseListingForEntry(entry, listingLookup);
        const hasCachedProduct = Boolean(getCachedProductForListing(cache, listing));
        return { entry, index, listing, hasCachedProduct };
      })
      .sort((left, right) => {
        const leftPriority = left.listing ? (left.hasCachedProduct ? 1 : 2) : 0;
        const rightPriority = right.listing ? (right.hasCachedProduct ? 1 : 2) : 0;
        return rightPriority - leftPriority || left.index - right.index;
      });
    const pendingQueue = queue.filter((item) => item.listing && !item.hasCachedProduct);
    if (untilComplete && pendingQueue.length > 1) {
      const offset = (Math.max(1, passNumber) - 1) % pendingQueue.length;
      const rotatedPending = pendingQueue.slice(offset).concat(pendingQueue.slice(0, offset));
      const settledQueue = queue.filter((item) => item.hasCachedProduct || !item.listing);
      queue = rotatedPending.concat(settledQueue);
    }

    for (let index = 0; index < queue.length; index += 1) {
      const { entry, listing } = queue[index];
      if (!listing) {
        process.stdout.write(`\r  [${index + 1}/${queue.length}] missing listing for ${entry.title}          `);
        continue;
      }

      const productKey = canonicalProductUrl(listing.href);
      let product = getCachedProductForListing(cache, listing);
      if ((!product || force || forceProducts) && !productFetchBlocked) {
        const productResult = await gotoWithAccess(page, productKey, `Product page ${productKey}`);
        if (productResult.state !== 'ok') {
          blockedDuringPass = blockedDuringPass || productResult.state === 'blocked';
          if (!stoppedReason) {
            stoppedReason = `Stopped product crawl at ${entry.title}${productResult.status ? ` (status ${productResult.status})` : ''}`;
            console.log(`\n  ${stoppedReason}`);
          }
          productFetchBlocked = true;
        } else {
          await expandProductSections(page);
          await sleep(1000);
          product = await extractProductData(page);
          cache.products[productKey] = product;
          cache.updatedAt = new Date().toISOString();
          if (!dryRun) saveCache(cache);
        }
      }

      const scrapedEntry = buildScrapedEntry(entry, listing, product);
      if (scrapedEntry) {
        scrapedEntries.set(cacheKeyForEntry(entry), scrapedEntry);
      }
      process.stdout.write(`\r  [${index + 1}/${queue.length}] ${entry.title}          `);
    }
    process.stdout.write('\n');

    const scrapedCatalog = catalogEntries.map((entry) => ({
      current: {
        title: entry.title,
        author: entry.author,
        edition: entry.edition,
        publicationDate: entry.publicationDate,
        publicationYear: entry.publicationYear,
        printIsbn: entry.printIsbn,
        pageCount: entry.pageCount,
        wordCount: entry.wordCount,
        highlights: entry.highlights,
        newToThisEdition: entry.newToThisEdition,
        abstract: entry.abstract,
      },
      scraped: scrapedEntries.get(cacheKeyForEntry(entry)) ?? null,
    }));

    const diffReport = buildDiffReport(
      {
        ...catalog,
        titles: catalogEntries,
      },
      scrapedEntries,
    );

    if (!dryRun) {
      writeFileSync(SCRAPED_CATALOG_PATH, JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: 'global.oup.com VSI catalogue scrape',
        entries: scrapedCatalog,
      }, null, 2) + '\n');
      writeFileSync(DIFF_REPORT_PATH, JSON.stringify(diffReport, null, 2) + '\n');
    }

    if (applyCatalog && !dryRun) {
      const updatedTitles = catalog.titles.map((entry) => {
        const scraped = scrapedEntries.get(cacheKeyForEntry(entry));
        if (!scraped) return entry;
        return {
          ...entry,
          publicationDate: scraped.publicationDate ?? entry.publicationDate,
          publicationYear: scraped.publicationYear ?? entry.publicationYear,
          printIsbn: scraped.printIsbn ?? entry.printIsbn,
          pageCount: scraped.pageCount ?? entry.pageCount,
          wordCount: scraped.wordCount ?? entry.wordCount,
          highlights: scraped.highlights ?? entry.highlights,
          newToThisEdition: scraped.newToThisEdition ?? entry.newToThisEdition,
        };
      });

      writeFileSync(CATALOG_PATH, JSON.stringify({
        ...catalog,
        titles: updatedTitles,
        pageCountsFetchedAt: cache.updatedAt ?? new Date().toISOString(),
      }, null, 2) + '\n');
    }

    console.log(`Scraped entries written to: ${SCRAPED_CATALOG_PATH}`);
    console.log(`Diff report written to: ${DIFF_REPORT_PATH}`);
    console.log(`Differing entries: ${diffReport.differingEntries}`);
    console.log(`Missing from scrape: ${diffReport.missingFromScrape.length}`);
    if (stoppedReason) {
      console.log(stoppedReason);
    }

    return {
      catalogEntries: catalogEntries.length,
      scrapedMatches: catalogEntries.length - diffReport.missingFromScrape.length,
      missingFromScrape: diffReport.missingFromScrape.length,
      differingEntries: diffReport.differingEntries,
      cacheListings: Object.keys(cache.listings ?? {}).length,
      cacheProducts: Object.keys(cache.products ?? {}).length,
      stoppedReason,
      wasBlocked: blockedDuringPass,
      pendingKnownProducts,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!untilComplete) {
    await runScrapePass();
    return;
  }

  let passNumber = 1;
  let previousMetrics;

  // Keep retrying with fresh browser sessions and cached progress until the selected set is complete.
  while (true) {
    let metrics;
    try {
      metrics = await runScrapePass(passNumber);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const retrySeconds = isBlockLikeMessage(errorMessage) ? blockedPauseSeconds : pauseSeconds;
      console.error(`Pass ${passNumber} failed: ${errorMessage}`);
      console.log(`Sleeping ${retrySeconds} seconds before retrying...`);
      passNumber += 1;
      await sleep(Math.max(1, retrySeconds) * 1000);
      continue;
    }
    if (listingOnly) {
      if (metrics.listingProbeSucceeded) {
        console.log(`Loaded requested listing page after ${passNumber} pass${passNumber === 1 ? '' : 'es'}.`);
        return;
      }
      const retrySeconds = metrics.wasBlocked ? blockedPauseSeconds : stalledPauseSeconds;
      console.log(`Pass ${passNumber} did not load the requested listing page yet.`);
      console.log(`Sleeping ${retrySeconds} seconds before the next probe...`);
      previousMetrics = metrics;
      passNumber += 1;
      await sleep(Math.max(1, retrySeconds) * 1000);
      continue;
    }
    if (metrics.missingFromScrape === 0) {
      console.log(`Completed scrape after ${passNumber} pass${passNumber === 1 ? '' : 'es'}.`);
      return;
    }

    const progressMade = !previousMetrics
      || metrics.scrapedMatches > previousMetrics.scrapedMatches
      || metrics.cacheListings > previousMetrics.cacheListings
      || metrics.cacheProducts > previousMetrics.cacheProducts;

    console.log(
      `Pass ${passNumber} incomplete: ${metrics.scrapedMatches}/${metrics.catalogEntries} matched, `
      + `${metrics.cacheListings} listings cached, ${metrics.cacheProducts} products cached.`,
    );
    if (!progressMade) {
      console.log('No new cached progress this pass; retrying after cooldown in case OUP rate limits have reset.');
    }
    const retrySeconds = !progressMade && metrics.pendingKnownProducts === 0
      ? stalledPauseSeconds
      : metrics.wasBlocked
        ? blockedPauseSeconds
        : pauseSeconds;
    if (!progressMade && metrics.pendingKnownProducts === 0) {
      console.log('No known uncached product pages remain; backing off longer before retrying frontier listing discovery.');
    }
    console.log(`Sleeping ${retrySeconds} seconds before the next pass...`);

    previousMetrics = metrics;
    passNumber += 1;
    await sleep(Math.max(1, retrySeconds) * 1000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
