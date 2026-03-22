#!/usr/bin/env node
/**
 * Generates or updates section mappings (relevantPathsAI + rationaleAI) using summaryAI.
 *
 * Modes:
 *   --mode remap    Improve existing mappings with better paths and rationales (default)
 *   --mode assign   Full recompute: select items for each section from catalog + assign paths
 *   --mode discover Find which sections an item maps to from the full catalog
 *   --mode gap-fill Build an exact-leaf gap report and candidate plan for one source type
 *   --mode repair-queue Build a prioritized queue of sections that should be remapped vs assigned
 *   --mode status   Show summary completeness, mapping validation, and exact-leaf coverage in one report
 *
 * Usage:
 *   node scripts/generate-mappings-ai.mjs --section 824                    # Remap one section
 *   node scripts/generate-mappings-ai.mjs --all                            # Remap all 177 sections
 *   node scripts/generate-mappings-ai.mjs --all --empty-only               # Only sections with empty paths
 *   node scripts/generate-mappings-ai.mjs --all --limit 5                  # Process first 5 sections
 *   node scripts/generate-mappings-ai.mjs --all --type vsi                 # VSI only
 *   node scripts/generate-mappings-ai.mjs --mode assign --all --type wikipedia  # Full Wikipedia recompute
 *   node scripts/generate-mappings-ai.mjs --mode assign --section 824 --type vsi  # Assign one section
 *   node scripts/generate-mappings-ai.mjs --mode discover --item "Buddhism::Damien Keown" --type vsi
 *   node scripts/generate-mappings-ai.mjs --mode discover --new-only --type vsi
 *   node scripts/generate-mappings-ai.mjs --mode gap-fill --type wikipedia # Exact leaf gap-fill plan
 *   node scripts/generate-mappings-ai.mjs --mode gap-fill --type wikipedia --unresolved-only --top-sections 10 --top-targets 5
 *   node scripts/generate-mappings-ai.mjs --mode repair-queue --type wikipedia --top-sections 15
 *   node scripts/generate-mappings-ai.mjs --mode status --type vsi
 *   node scripts/generate-mappings-ai.mjs --validate                       # Validate existing mappings
 *   node scripts/generate-mappings-ai.mjs --coverage                       # Exact leaf coverage report
 *   node scripts/generate-mappings-ai.mjs --coverage --type vsi --fail-on-unresolved
 *   node scripts/generate-mappings-ai.mjs --coverage --type wikipedia --max-unresolved 100 --warn-on-fallback-pct 40
 *   node scripts/generate-mappings-ai.mjs --coverage --report-file /tmp/mapping-report.json
 *   node scripts/generate-mappings-ai.mjs --section 824 --dry-run          # Preview without writing
 *
 * Requires:
 *   npm install @anthropic-ai/sdk
 *   ANTHROPIC_API_KEY environment variable
 *   summaryAI fields populated in catalog files (run generate-summary-ai.mjs first)
 *
 * IMPORTANT FOR CLAUDE CODE AGENTS:
 * This script is the CANONICAL source of truth for section mapping generation.
 * DO NOT generate mappings without reading and using the system prompts, pre-filtering
 * logic (rankCandidatesForSection), coverage-aware prompting, and output format
 * defined in this file. Agents that improvise their own instructions produce
 * inconsistent, unusable output. The parent agent should generate batch files
 * to /tmp (assign-batch-N.txt with pre-filtered candidates per section), launch
 * subagents that read those files and produce JSON output, then parse and save results.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import outlineData from './lib/outline-data.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { buildTaxonomyText } = outlineData;
const REPORTS_DIR = path.join(ROOT, 'scripts', 'output');

// Lazy import — only loaded when API calls are needed
async function getAnthropicClient() {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic();
}

// --- Configuration ---
const MODEL = 'claude-sonnet-4-6';
const CONCURRENCY = 3;
const DISCOVER_TOP_SECTIONS = 50; // candidate sections per item in discover mode
const ASSIGN_CANDIDATES = 60; // candidate items per section in assign mode

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf('--' + name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
function hasFlag(name) { return args.includes('--' + name); }
function getOptionalIntArg(name) {
  const value = getArg(name);
  if (value === null) return null;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    console.error(`--${name} requires an integer value`);
    process.exit(1);
  }
  return parsed;
}
function getOptionalFloatArg(name) {
  const value = getArg(name);
  if (value === null) return null;
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) {
    console.error(`--${name} requires a numeric value`);
    process.exit(1);
  }
  return parsed;
}

const sectionFlag = getArg('section');
const allFlag = hasFlag('all');
const limitFlag = getOptionalIntArg('limit') ?? Infinity;
const typeFlag = getArg('type') || 'both';
const modeFlag = getArg('mode') || 'remap';
const itemFlag = getArg('item');
const emptyOnlyFlag = hasFlag('empty-only');
const newOnlyFlag = hasFlag('new-only');
const validateFlag = hasFlag('validate');
const coverageFlag = hasFlag('coverage');
const dryRunFlag = hasFlag('dry-run');
const reportFileFlag = getArg('report-file');
const unresolvedOnlyFlag = hasFlag('unresolved-only');
const fallbackOnlyFlag = hasFlag('fallback-only');
const topSectionsFlag = getOptionalIntArg('top-sections');
const topTargetsFlag = getOptionalIntArg('top-targets');
const failOnUnresolvedFlag = hasFlag('fail-on-unresolved');
const maxUnresolvedFlag = getOptionalIntArg('max-unresolved');
const warnOnFallbackPctFlag = getOptionalFloatArg('warn-on-fallback-pct');

if (unresolvedOnlyFlag && fallbackOnlyFlag) {
  console.error('Choose only one of --unresolved-only or --fallback-only');
  process.exit(1);
}

if (topSectionsFlag !== null && topSectionsFlag < 1) {
  console.error('--top-sections must be at least 1');
  process.exit(1);
}

if (topTargetsFlag !== null && topTargetsFlag < 1) {
  console.error('--top-targets must be at least 1');
  process.exit(1);
}

if (
  (unresolvedOnlyFlag || fallbackOnlyFlag || topSectionsFlag !== null || topTargetsFlag !== null) &&
  !['gap-fill', 'repair-queue'].includes(modeFlag)
) {
  console.error('--unresolved-only, --fallback-only, --top-sections, and --top-targets are only valid with --mode gap-fill or --mode repair-queue');
  process.exit(1);
}

if (failOnUnresolvedFlag && maxUnresolvedFlag !== null) {
  console.error('Choose only one of --fail-on-unresolved or --max-unresolved');
  process.exit(1);
}

if (maxUnresolvedFlag !== null && maxUnresolvedFlag < 0) {
  console.error('--max-unresolved must be 0 or greater');
  process.exit(1);
}

if (warnOnFallbackPctFlag !== null && warnOnFallbackPctFlag < 0) {
  console.error('--warn-on-fallback-pct must be 0 or greater');
  process.exit(1);
}

if (!validateFlag && !coverageFlag) {
  if (modeFlag === 'remap' && !sectionFlag && !allFlag) {
    console.error('Remap mode requires --section CODE or --all');
    process.exit(1);
  }
  if (modeFlag === 'assign' && !sectionFlag && !allFlag) {
    console.error('Assign mode requires --section CODE or --all');
    process.exit(1);
  }
  if (modeFlag === 'assign' && typeFlag === 'both') {
    console.error('Assign mode requires --type vsi or --type wikipedia');
    process.exit(1);
  }
  if (modeFlag === 'discover' && !itemFlag && !allFlag && !newOnlyFlag) {
    console.error('Discover mode requires --item ID, --all, or --new-only');
    process.exit(1);
  }
  if (modeFlag === 'discover' && typeFlag === 'both') {
    console.error('Discover mode requires --type vsi or --type wikipedia');
    process.exit(1);
  }
  if (modeFlag === 'gap-fill' && typeFlag === 'both') {
    console.error('Gap-fill mode requires --type vsi or --type wikipedia');
    process.exit(1);
  }
}

// --- Tokenization (for discover pre-filtering) ---
function tokenize(text) {
  const tokens = new Set();
  for (const word of (text || '').split(/[^A-Za-z0-9']+/)) {
    let t = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t.length > 4 && t.endsWith('s')) t = t.slice(0, -1);
    if (t && t.length >= 3) tokens.add(t);
  }
  return tokens;
}

function countOverlap(setA, setB) {
  let count = 0;
  for (const t of setA) {
    if (setB.has(t)) count++;
  }
  return count;
}

function normalizeType(type) {
  return type === 'wikipedia' ? 'wiki' : type;
}

function typeLabel(type) {
  return normalizeType(type) === 'wiki' ? 'Wikipedia' : 'VSI';
}

function typeSlug(type) {
  return normalizeType(type) === 'wiki' ? 'wikipedia' : 'vsi';
}

function getRequestedTypes() {
  const normalized = normalizeType(typeFlag);
  if (normalized === 'both') return ['vsi', 'wiki'];
  return [normalized];
}

function normalizeSectionStem(sectionCode) {
  return String(sectionCode).replace(/\.json$/i, '').replace(/\//g, '-');
}

function sectionFilePath(sectionCode) {
  return path.join(ROOT, 'src', 'content', 'sections', `${normalizeSectionStem(sectionCode)}.json`);
}

function mappingDirPath(type) {
  return path.join(
    ROOT,
    normalizeType(type) === 'vsi' ? 'src/content/vsi-mappings' : 'src/content/wiki-mappings',
  );
}

function mappingFilePath(sectionCode, type) {
  return path.join(mappingDirPath(type), `${normalizeSectionStem(sectionCode)}.json`);
}

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function resolveReportPath(defaultName) {
  if (reportFileFlag) {
    return path.isAbsolute(reportFileFlag)
      ? reportFileFlag
      : path.join(ROOT, reportFileFlag);
  }
  ensureReportsDir();
  return path.join(REPORTS_DIR, defaultName);
}

const sectionDocumentCache = new Map();
const sectionOutlineNodeCache = new Map();

// --- Load data ---
function loadTaxonomy() {
  return buildTaxonomyText(ROOT);
}

function loadSectionDocument(sectionCode) {
  const stem = normalizeSectionStem(sectionCode);
  if (sectionDocumentCache.has(stem)) return sectionDocumentCache.get(stem);

  const filePath = sectionFilePath(stem);
  if (!fs.existsSync(filePath)) return null;

  const section = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const document = {
    stem,
    sectionCode: section.sectionCode,
    title: section.title,
    outline: section.outline || [],
  };
  sectionDocumentCache.set(stem, document);
  return document;
}

function collectOutlineText(items) {
  let text = '';
  for (const item of items || []) {
    text += ' ' + (item.text || '');
    text += collectOutlineText(item.children);
  }
  return text;
}

function loadSectionOutline(sectionCode) {
  const section = loadSectionDocument(sectionCode);
  if (!section) return null;

  function formatOutline(items, indent = 0) {
    let text = '';
    for (const item of items) {
      text += '  '.repeat(indent) + item.level + ': ' + item.text + '\n';
      if (item.children?.length > 0) text += formatOutline(item.children, indent + 1);
    }
    return text;
  }

  return {
    stem: section.stem,
    sectionCode: section.sectionCode,
    title: section.title,
    outlineText: formatOutline(section.outline),
    fullText: section.title + ' ' + collectOutlineText(section.outline),
  };
}

function loadSectionOutlineNodes(sectionCode) {
  const section = loadSectionDocument(sectionCode);
  if (!section) return [];
  if (sectionOutlineNodeCache.has(section.stem)) return sectionOutlineNodeCache.get(section.stem);

  const nodes = [];
  function collect(items, prefix = [], trail = []) {
    for (const item of items || []) {
      const nextPrefix = [...prefix, item.level];
      const nextTrail = [...trail, { level: item.level, text: item.text }];
      const children = item.children || [];
      nodes.push({
        path: nextPrefix.join('.'),
        text: item.text,
        isLeaf: children.length === 0,
        trail: nextTrail,
      });
      if (children.length > 0) collect(children, nextPrefix, nextTrail);
    }
  }

  collect(section.outline);
  sectionOutlineNodeCache.set(section.stem, nodes);
  return nodes;
}

function loadAllSectionData() {
  const codes = getAllSectionCodes();
  const sections = [];
  for (const code of codes) {
    const s = loadSectionOutline(code);
    if (s) {
      s.tokens = tokenize(s.fullText);
      sections.push(s);
    }
  }
  return sections;
}

function loadVsiCatalog() {
  const catalog = JSON.parse(fs.readFileSync('src/content/vsi/catalog.json', 'utf8'));
  return new Map(catalog.titles.map((t) => [
    `${t.title}::${t.author}`,
    {
      title: t.title,
      author: t.author,
      summaryAI: t.summaryAI || '',
      keywords: (t.keywords || []).join(', '),
      subject: t.subject || '',
    },
  ]));
}

function loadWikiCatalog() {
  const catalog = JSON.parse(fs.readFileSync('src/data/wikipedia-catalog.json', 'utf8'));
  return new Map(catalog.articles.map((a) => [
    a.title,
    {
      title: a.title,
      summaryAI: a.summaryAI || '',
      keywords: (a.wikiCategories || []).join(', '),
      subject: a.category || '',
    },
  ]));
}

function buildSummaryStatus(types) {
  const status = {};

  if (types.includes('vsi')) {
    const catalog = loadVsiCatalog();
    const withSummary = [...catalog.values()].filter((entry) => entry.summaryAI).length;
    status.vsi = {
      totalItems: catalog.size,
      itemsWithSummary: withSummary,
      summaryCoveragePct: catalog.size === 0 ? 100 : Math.round((withSummary / catalog.size) * 1000) / 10,
    };
  }

  if (types.includes('wiki')) {
    const catalog = loadWikiCatalog();
    const withSummary = [...catalog.values()].filter((entry) => entry.summaryAI).length;
    status.wikipedia = {
      totalItems: catalog.size,
      itemsWithSummary: withSummary,
      summaryCoveragePct: catalog.size === 0 ? 100 : Math.round((withSummary / catalog.size) * 1000) / 10,
    };
  }

  return status;
}

function loadExistingMappings(sectionCode, type) {
  const filePath = mappingFilePath(sectionCode, type);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getAllSectionCodes() {
  return fs.readdirSync(path.join(ROOT, 'src', 'content', 'sections'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
    .sort();
}

function buildValidationReport(sectionCodes = getAllSectionCodes(), types = ['vsi', 'wiki']) {
  const report = {
    generatedAt: new Date().toISOString(),
    sectionCount: sectionCodes.length,
    types: {},
  };

  for (const type of types) {
    const normalizedType = normalizeType(type);
    const key = typeSlug(normalizedType);
    const totals = {
      mappingFiles: 0,
      sectionsWithMappings: 0,
      totalMappings: 0,
      emptyRelevantPaths: 0,
      emptyOrShortRationale: 0,
      invalidPaths: 0,
    };
    const invalidExamples = [];

    for (const code of sectionCodes) {
      const filePath = mappingFilePath(code, normalizedType);
      if (!fs.existsSync(filePath)) continue;

      totals.mappingFiles++;
      const validPaths = new Set(loadSectionOutlineNodes(code).map((node) => node.path));
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if ((data.mappings || []).length > 0) totals.sectionsWithMappings++;

      for (const mapping of data.mappings || []) {
        totals.totalMappings++;
        if (!mapping.relevantPathsAI || mapping.relevantPathsAI.length === 0) totals.emptyRelevantPaths++;
        if (!mapping.rationaleAI || mapping.rationaleAI.length < 10) totals.emptyOrShortRationale++;

        for (const pathValue of mapping.relevantPathsAI || []) {
          if (!validPaths.has(pathValue)) {
            totals.invalidPaths++;
            if (invalidExamples.length < 20) {
              invalidExamples.push({
                sectionCode: code,
                itemId: mapping.vsiTitle ? `${mapping.vsiTitle}::${mapping.vsiAuthor}` : mapping.articleTitle,
                path: pathValue,
              });
            }
          }
        }
      }
    }

    report.types[key] = {
      totals,
      invalidExamples,
    };
  }

  return report;
}

// --- Find which sections an item is currently mapped to ---
function findExistingMappedSections(itemId, type) {
  const dir = mappingDirPath(type);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const sections = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const m of data.mappings) {
      const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
      if (id === itemId) {
        sections.push(data.sectionCode);
        break;
      }
    }
  }

  return sections;
}

// --- System prompts ---
function buildRemapSystemPrompt(taxonomy) {
  return `You are a knowledge-mapping agent for the Propaedia — a taxonomy of all human knowledge.

You receive a section's outline and a list of items (books or articles) with their summaryAI. For each item, determine:
1. Which outline paths (e.g., A, A.1, B.3.c) the item genuinely covers
2. A brief rationale (1-2 sentences) explaining the connection

The full Propaedia taxonomy for context:

${taxonomy}

Guidelines:
- Only assign paths where there is genuine topical overlap, not tangential connections
- Use the most specific path that applies (A.3.b rather than just A if the item specifically covers that sub-topic)
- Also include broader parent paths (A) if the item covers the topic broadly
- Write rationales that reference specific concepts from the item's summary and specific outline paths
- Do not use framing like "This book covers..." — write direct factual rationales
- Rationales should mention the outline paths they reference, e.g., "Buddhist meditation practices (B.4) and the vipassana tradition (C.2.a.ii)"

Output format — a JSON array:
[{
  "id": "item identifier",
  "relevantPathsAI": ["A.1", "B.3", ...],
  "rationaleAI": "Direct factual rationale referencing outline paths..."
}]`;
}

function buildDiscoverSystemPrompt(taxonomy) {
  return `You are a knowledge-mapping agent for the Propaedia — a taxonomy of all human knowledge.

You receive one item (a book or article) with its summaryAI, and a list of candidate Propaedia sections with their outlines. Your job is to determine which sections the item genuinely maps to, and for each match, identify the specific outline paths and write a rationale.

The full Propaedia taxonomy for context:

${taxonomy}

Guidelines:
- Only confirm a section mapping if there is genuine, substantive topical overlap — not just tangential mention
- For each confirmed section, assign specific outline paths where the item's content matches
- Use the most specific path that applies, and also include broader parent paths if the item covers the topic broadly
- Write rationales that reference specific concepts from the item's summary and specific outline paths
- Do not use framing like "This book covers..." — write direct factual rationales
- It is fine to confirm only a few sections or even none — quality over quantity
- If a candidate section has no genuine overlap, omit it entirely from the output

Output format — a JSON array (only include sections with genuine matches):
[{
  "sectionCode": "824",
  "relevantPathsAI": ["A.1", "B.3", ...],
  "rationaleAI": "Direct factual rationale referencing outline paths..."
}]`;
}

// --- Format items for prompt ---
function formatItemsForPrompt(items, type) {
  return items.map((item, i) => {
    const num = i + 1;
    if (type === 'vsi') {
      return `${num}. ID: ${item.id}\n   Title: ${item.title}\n   Author: ${item.author}\n   summaryAI: ${item.summaryAI}`;
    } else {
      return `${num}. ID: ${item.id}\n   Title: ${item.title}\n   summaryAI: ${item.summaryAI}`;
    }
  }).join('\n\n');
}

function normalizeOutlinePath(pathValue) {
  return typeof pathValue === 'string' ? pathValue.trim() : '';
}

function isAncestorPath(ancestorPath, pathValue) {
  return pathValue.startsWith(ancestorPath + '.');
}

function getLeafOutlinePaths(sectionCode) {
  return loadSectionOutlineNodes(sectionCode).filter((node) => node.isLeaf);
}

function getItemPathsForSection(sectionCode, type) {
  const data = loadExistingMappings(sectionCode, type);
  const allPaths = new Set();
  if (!data) return allPaths;
  for (const mapping of data.mappings || []) {
    for (const pathValue of mapping.relevantPathsAI || []) {
      const normalized = normalizeOutlinePath(pathValue);
      if (normalized) allPaths.add(normalized);
    }
  }
  return allPaths;
}

function buildLeafCoverageAudit(sectionCode, type) {
  const section = loadSectionDocument(sectionCode);
  if (!section) return null;

  const leaves = getLeafOutlinePaths(sectionCode);
  const itemPaths = getItemPathsForSection(sectionCode, type);
  const exactPaths = new Set(itemPaths);

  const leafCoverage = leaves.map((leaf) => {
    if (exactPaths.has(leaf.path)) {
      return {
        path: leaf.path,
        text: leaf.text,
        trail: leaf.trail,
        status: 'exact',
        fallbackPaths: [],
      };
    }

    const fallbackPaths = [...exactPaths]
      .filter((candidate) => candidate && isAncestorPath(candidate, leaf.path))
      .sort((a, b) => b.length - a.length);

    return {
      path: leaf.path,
      text: leaf.text,
      trail: leaf.trail,
      status: fallbackPaths.length > 0 ? 'fallback' : 'uncovered',
      fallbackPaths,
    };
  });

  const exact = leafCoverage.filter((leaf) => leaf.status === 'exact').length;
  const fallback = leafCoverage.filter((leaf) => leaf.status === 'fallback').length;
  const unresolved = leafCoverage.filter((leaf) => leaf.status === 'uncovered').length;

  return {
    sectionStem: section.stem,
    sectionCode: section.sectionCode,
    title: section.title,
    totalLeafPaths: leafCoverage.length,
    exactLeafPaths: exact,
    fallbackLeafPaths: fallback,
    unresolvedLeafPaths: unresolved,
    leafCoverage,
  };
}

function formatCoveragePriorityNote(sectionCode, type) {
  const audit = buildLeafCoverageAudit(sectionCode, type);
  if (!audit) return '';

  const unresolved = audit.leafCoverage.filter((leaf) => leaf.status === 'uncovered');
  const fallback = audit.leafCoverage.filter((leaf) => leaf.status === 'fallback');
  const lines = [];
  const maxPromptLeaves = 25;

  if (unresolved.length > 0) {
    const shown = unresolved.slice(0, maxPromptLeaves);
    lines.push(
      `EXACT LEAF PRIORITY — The following ${unresolved.length} leaf paths currently have no ${typeLabel(type)} recommendation at all. ` +
      `If any candidate genuinely covers them, include the exact leaf path:`,
      ...shown.map((leaf) => `  ${leaf.path}: ${leaf.text.substring(0, 80)}`),
    );
    if (unresolved.length > shown.length) {
      lines.push(`  ... and ${unresolved.length - shown.length} more exact leaf gaps in this section`);
    }
  }

  if (fallback.length > 0) {
    const shown = fallback.slice(0, maxPromptLeaves);
    if (lines.length > 0) lines.push('');
    lines.push(
      `CONTROLLED FALLBACK ONLY — The following ${fallback.length} leaf paths are only covered by broader parent paths. ` +
      `Prefer an exact leaf mapping when it is defensible; otherwise the broader fallback is acceptable:`,
      ...shown.map((leaf) => `  ${leaf.path}: ${leaf.text.substring(0, 80)} (fallback: ${leaf.fallbackPaths.join(', ')})`),
    );
    if (fallback.length > shown.length) {
      lines.push(`  ... and ${fallback.length - shown.length} more fallback-only leaf paths in this section`);
    }
  }

  return lines.length > 0 ? `\n\n${lines.join('\n')}` : '';
}

function buildCoverageReport(sectionCodes, types) {
  const report = {
    generatedAt: new Date().toISOString(),
    exactLeafCoverageRequired: true,
    fallbackPolicy: 'ancestor_path_fallback_only_when_no_exact_leaf_mapping_exists',
    sectionCount: sectionCodes.length,
    types: {},
  };

  for (const type of types) {
    const sections = [];
    const totals = {
      totalLeafPaths: 0,
      exactLeafPaths: 0,
      fallbackLeafPaths: 0,
      unresolvedLeafPaths: 0,
      sectionsWithFallbackOnly: 0,
      sectionsWithUnresolved: 0,
    };

    for (const code of sectionCodes) {
      const audit = buildLeafCoverageAudit(code, type);
      if (!audit) continue;

      totals.totalLeafPaths += audit.totalLeafPaths;
      totals.exactLeafPaths += audit.exactLeafPaths;
      totals.fallbackLeafPaths += audit.fallbackLeafPaths;
      totals.unresolvedLeafPaths += audit.unresolvedLeafPaths;
      if (audit.fallbackLeafPaths > 0) totals.sectionsWithFallbackOnly++;
      if (audit.unresolvedLeafPaths > 0) totals.sectionsWithUnresolved++;

      sections.push({
        sectionStem: audit.sectionStem,
        sectionCode: audit.sectionCode,
        title: audit.title,
        totals: {
          totalLeafPaths: audit.totalLeafPaths,
          exactLeafPaths: audit.exactLeafPaths,
          fallbackLeafPaths: audit.fallbackLeafPaths,
          unresolvedLeafPaths: audit.unresolvedLeafPaths,
          exactCoveragePct: audit.totalLeafPaths === 0
            ? 100
            : Math.round((audit.exactLeafPaths / audit.totalLeafPaths) * 1000) / 10,
          fallbackCoveragePct: audit.totalLeafPaths === 0
            ? 0
            : Math.round((audit.fallbackLeafPaths / audit.totalLeafPaths) * 1000) / 10,
        },
        unresolvedLeaves: audit.leafCoverage
          .filter((leaf) => leaf.status === 'uncovered')
          .map((leaf) => ({ path: leaf.path, text: leaf.text })),
        fallbackLeaves: audit.leafCoverage
          .filter((leaf) => leaf.status === 'fallback')
          .map((leaf) => ({
            path: leaf.path,
            text: leaf.text,
            fallbackPaths: leaf.fallbackPaths,
          })),
      });
    }

    report.types[typeSlug(type)] = {
      totals: {
        ...totals,
        exactCoveragePct: totals.totalLeafPaths === 0
          ? 100
          : Math.round((totals.exactLeafPaths / totals.totalLeafPaths) * 1000) / 10,
        fallbackCoveragePct: totals.totalLeafPaths === 0
          ? 0
          : Math.round((totals.fallbackLeafPaths / totals.totalLeafPaths) * 1000) / 10,
        unresolvedCoveragePct: totals.totalLeafPaths === 0
          ? 0
          : Math.round((totals.unresolvedLeafPaths / totals.totalLeafPaths) * 1000) / 10,
      },
      sections,
    };
  }

  return report;
}

function getGapTargetFilter() {
  if (unresolvedOnlyFlag) return 'required';
  if (fallbackOnlyFlag) return 'fallback';
  return 'all';
}

function sortGapSections(a, b) {
  if (b.filteredRequiredTargets !== a.filteredRequiredTargets) {
    return b.filteredRequiredTargets - a.filteredRequiredTargets;
  }
  if (b.filteredFallbackTargets !== a.filteredFallbackTargets) {
    return b.filteredFallbackTargets - a.filteredFallbackTargets;
  }
  if (b.totals.unresolvedLeafPaths !== a.totals.unresolvedLeafPaths) {
    return b.totals.unresolvedLeafPaths - a.totals.unresolvedLeafPaths;
  }
  if (b.totals.fallbackLeafPaths !== a.totals.fallbackLeafPaths) {
    return b.totals.fallbackLeafPaths - a.totals.fallbackLeafPaths;
  }
  return a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
}

function sortGapTargets(a, b) {
  if (a.priority !== b.priority) {
    return a.priority === 'required' ? -1 : 1;
  }
  return a.path.localeCompare(b.path, undefined, { numeric: true });
}

function evaluateCoverageThresholds(report, types, contextLabel = 'Coverage') {
  const warnings = [];
  const failures = [];

  for (const type of types) {
    const totals = report.types[typeSlug(type)]?.totals;
    if (!totals) continue;

    if (warnOnFallbackPctFlag !== null && totals.fallbackCoveragePct > warnOnFallbackPctFlag) {
      warnings.push(
        `${typeLabel(type)} fallback-only coverage is ${totals.fallbackCoveragePct}% ` +
        `(warning threshold ${warnOnFallbackPctFlag}%)`,
      );
    }

    if (failOnUnresolvedFlag && totals.unresolvedLeafPaths > 0) {
      failures.push(`${typeLabel(type)} still has ${totals.unresolvedLeafPaths} unresolved leaf paths`);
    }

    if (maxUnresolvedFlag !== null && totals.unresolvedLeafPaths > maxUnresolvedFlag) {
      failures.push(
        `${typeLabel(type)} has ${totals.unresolvedLeafPaths} unresolved leaf paths ` +
        `(max allowed ${maxUnresolvedFlag})`,
      );
    }
  }

  for (const warning of warnings) {
    console.warn(`WARN [${contextLabel}]: ${warning}`);
  }

  for (const failure of failures) {
    console.error(`FAIL [${contextLabel}]: ${failure}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function buildPipelineStatus(sectionCodes, types) {
  return {
    generatedAt: new Date().toISOString(),
    sectionCount: sectionCodes.length,
    summary: buildSummaryStatus(types),
    validation: buildValidationReport(sectionCodes, types),
    coverage: buildCoverageReport(sectionCodes, types),
  };
}

function buildRepairTargets(audit, allItems, existingIds, targetFilter) {
  let targets = audit.leafCoverage
    .filter((leaf) => leaf.status === 'uncovered' || leaf.status === 'fallback')
    .map((leaf) => ({
      priority: leaf.status === 'uncovered' ? 'required' : 'fallback',
      path: leaf.path,
      text: leaf.text,
      fallbackPaths: leaf.fallbackPaths,
      trail: leaf.trail.map((step) => ({ level: step.level, text: step.text })),
      candidates: rankCandidatesForLeaf(audit, leaf, allItems, existingIds),
    }));

  if (targetFilter === 'required') {
    targets = targets.filter((target) => target.priority === 'required');
  } else if (targetFilter === 'fallback') {
    targets = targets.filter((target) => target.priority === 'fallback');
  }

  return targets.sort(sortGapTargets);
}

function summarizeRepairSignals(targets) {
  const targetCount = targets.length;
  let existingTop1Hits = 0;
  let existingTop3Hits = 0;
  let newTop1Hits = 0;
  let targetsWithoutCandidates = 0;

  for (const target of targets) {
    if (!target.candidates || target.candidates.length === 0) {
      targetsWithoutCandidates++;
      continue;
    }

    if (target.candidates[0].alreadyMappedToSection) existingTop1Hits++;
    else newTop1Hits++;

    if (target.candidates.slice(0, 3).some((candidate) => candidate.alreadyMappedToSection)) {
      existingTop3Hits++;
    }
  }

  return {
    targetCount,
    existingTop1Hits,
    existingTop3Hits,
    newTop1Hits,
    targetsWithoutCandidates,
    existingTop1Pct: targetCount === 0 ? 0 : Math.round((existingTop1Hits / targetCount) * 1000) / 10,
    existingTop3Pct: targetCount === 0 ? 0 : Math.round((existingTop3Hits / targetCount) * 1000) / 10,
    newTop1Pct: targetCount === 0 ? 0 : Math.round((newTop1Hits / targetCount) * 1000) / 10,
  };
}

function chooseRepairAction(audit, existingData, signals) {
  const mappingsCount = existingData?.mappings?.length || 0;

  if (mappingsCount === 0) {
    return {
      action: 'assign',
      reason: 'No existing mapped items in this Section yet, so the first repair pass should add candidate items.',
    };
  }

  if (audit.unresolvedLeafPaths === 0 && audit.fallbackLeafPaths > 0) {
    return {
      action: 'remap',
      reason: 'This Section only has fallback debt, so the likely win is assigning more specific paths to existing items.',
    };
  }

  if (signals.existingTop1Pct >= 50 || signals.existingTop3Pct >= 70) {
    return {
      action: 'remap',
      reason: 'Most high-priority gaps already point back to items that are mapped to this Section, so path tightening should come first.',
    };
  }

  if (signals.newTop1Hits > signals.existingTop1Hits && audit.unresolvedLeafPaths > 0) {
    return {
      action: 'assign',
      reason: 'Most unresolved gaps point to candidates that are not currently mapped to this Section, so candidate selection should come first.',
    };
  }

  if (audit.fallbackLeafPaths > audit.unresolvedLeafPaths && signals.existingTop3Hits > 0) {
    return {
      action: 'remap',
      reason: 'Fallback debt outweighs unresolved gaps here, and existing mapped items still show up in the best matches.',
    };
  }

  return {
    action: audit.unresolvedLeafPaths > 0 ? 'assign' : 'remap',
    reason: audit.unresolvedLeafPaths > 0
      ? 'This Section still has unresolved leaves without enough existing-item evidence, so assign is the safer first pass.'
      : 'This Section mainly needs specificity improvements on already mapped items.',
  };
}

function buildRepairQueue(sectionCodes, types) {
  const targetFilter = getGapTargetFilter();
  const queue = {
    generatedAt: new Date().toISOString(),
    sectionCount: sectionCodes.length,
    filters: {
      targetFilter,
      topSections: topSectionsFlag,
      topTargetsPerSection: topTargetsFlag,
    },
    types: {},
  };

  for (const type of types) {
    const catalog = type === 'vsi' ? loadVsiCatalog() : loadWikiCatalog();
    const allItems = buildCatalogItems(catalog);
    const sections = [];
    const totals = {
      sectionsAudited: 0,
      queuedSections: 0,
      remapFirst: 0,
      assignFirst: 0,
      unresolvedLeafPaths: 0,
      fallbackLeafPaths: 0,
      requiredTargets: 0,
      fallbackTargets: 0,
    };

    for (const code of sectionCodes) {
      const audit = buildLeafCoverageAudit(code, type);
      if (!audit) continue;
      totals.sectionsAudited++;
      totals.unresolvedLeafPaths += audit.unresolvedLeafPaths;
      totals.fallbackLeafPaths += audit.fallbackLeafPaths;

      const existingData = loadExistingMappings(code, type);
      const existingIds = new Set((existingData?.mappings || []).map((mapping) => getMappingId(mapping, type)));
      const allTargets = buildRepairTargets(audit, allItems, existingIds, targetFilter);
      if (allTargets.length === 0) continue;

      const signals = summarizeRepairSignals(allTargets);
      const recommendation = chooseRepairAction(audit, existingData, signals);
      const targets = topTargetsFlag === null ? allTargets : allTargets.slice(0, topTargetsFlag);

      totals.queuedSections++;
      totals.requiredTargets += allTargets.filter((target) => target.priority === 'required').length;
      totals.fallbackTargets += allTargets.filter((target) => target.priority === 'fallback').length;
      if (recommendation.action === 'remap') totals.remapFirst++;
      else totals.assignFirst++;

      sections.push({
        sectionStem: audit.sectionStem,
        sectionCode: audit.sectionCode,
        title: audit.title,
        action: recommendation.action,
        reason: recommendation.reason,
        totals: {
          totalLeafPaths: audit.totalLeafPaths,
          exactLeafPaths: audit.exactLeafPaths,
          fallbackLeafPaths: audit.fallbackLeafPaths,
          unresolvedLeafPaths: audit.unresolvedLeafPaths,
        },
        existingMappingsCount: existingData?.mappings?.length || 0,
        existingMappingsWithPaths: (existingData?.mappings || []).filter(
          (mapping) => (mapping.relevantPathsAI || []).length > 0,
        ).length,
        targetSignals: signals,
        targets,
      });
    }

    sections.sort((a, b) => {
      if (b.totals.unresolvedLeafPaths !== a.totals.unresolvedLeafPaths) {
        return b.totals.unresolvedLeafPaths - a.totals.unresolvedLeafPaths;
      }
      if (b.totals.fallbackLeafPaths !== a.totals.fallbackLeafPaths) {
        return b.totals.fallbackLeafPaths - a.totals.fallbackLeafPaths;
      }
      return a.sectionCode.localeCompare(b.sectionCode, undefined, { numeric: true });
    });

    queue.types[typeSlug(type)] = {
      totals,
      sections: topSectionsFlag === null ? sections : sections.slice(0, topSectionsFlag),
    };
  }

  return queue;
}

function writeJsonReport(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// --- API calls ---
async function generateRemapMappings(client, systemPrompt, section, items, type) {
  const coverageNote = formatCoveragePriorityNote(section.stem || section.sectionCode, type);

  const userMessage = `Section ${section.sectionCode}: ${section.title}

Outline:
${section.outlineText}${coverageNote}

---

Items to map (${items.length} ${type === 'vsi' ? 'VSI books' : 'Wikipedia articles'}):

${formatItemsForPrompt(items, type)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`  Failed to parse JSON for section ${section.sectionCode}`);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`  JSON parse error for section ${section.sectionCode}: ${err.message}`);
    return [];
  }
}

async function generateDiscoverMappings(client, systemPrompt, item, candidateSections, type) {
  const sectionsText = candidateSections.map((s, i) =>
    `${i + 1}. Section ${s.sectionCode}: ${s.title}\nOutline:\n${s.outlineText}`
  ).join('\n---\n\n');

  const itemText = type === 'vsi'
    ? `Title: ${item.title}\nAuthor: ${item.author}\nsummaryAI: ${item.summaryAI}`
    : `Title: ${item.title}\nsummaryAI: ${item.summaryAI}`;

  const userMessage = `Item to map:
${itemText}

---

Candidate sections (${candidateSections.length}):

${sectionsText}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`  Failed to parse JSON for item ${item.id}`);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`  JSON parse error for item ${item.id}: ${err.message}`);
    return [];
  }
}

// --- Pre-filter: score item against all sections ---
function rankSectionsForItem(item, allSections) {
  // Combine all available text for richer token matching
  const textParts = [item.summaryAI, item.title];
  if (item.author) textParts.push(item.author);
  if (item.keywords) textParts.push(item.keywords);
  if (item.subject) textParts.push(item.subject);
  const itemTokens = tokenize(textParts.join(' '));

  const scored = allSections.map((section) => ({
    ...section,
    score: countOverlap(itemTokens, section.tokens),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, DISCOVER_TOP_SECTIONS);
}

// --- Write results ---
function writeMappingResults(sectionCode, results, type, existingData) {
  const section = loadSectionDocument(sectionCode);
  const filePath = mappingFilePath(sectionCode, type);

  const resultLookup = new Map(results.map((r) => [r.id, r]));

  const mappings = existingData.mappings.map((m) => {
    const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
    const result = resultLookup.get(id);

    if (result) {
      const updated = { ...m };
      updated.relevantPathsAI = result.relevantPathsAI || [];
      updated.rationaleAI = result.rationaleAI || m.rationaleAI || '';
      return updated;
    }
    return m;
  });

  const output = {
    sectionCode: existingData?.sectionCode || section?.sectionCode || sectionCode,
    mappings,
    _curatedBy: 'ai',
    _generatedAt: new Date().toISOString().split('T')[0],
  };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');
}

function writeDiscoverResult(sectionCode, item, result, type) {
  const section = loadSectionDocument(sectionCode);
  const filePath = mappingFilePath(sectionCode, type);

  let data;
  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } else {
    data = {
      sectionCode: section?.sectionCode || sectionCode,
      mappings: [],
      _curatedBy: 'ai',
      _generatedAt: new Date().toISOString().split('T')[0],
    };
  }

  // Check if item already exists in this section's mappings
  const existingIdx = data.mappings.findIndex((m) => {
    const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
    return id === item.id;
  });

  const newMapping = type === 'vsi'
    ? {
        vsiTitle: item.title,
        vsiAuthor: item.author,
        relevantPathsAI: result.relevantPathsAI || [],
        rationaleAI: result.rationaleAI || '',
      }
    : {
        articleTitle: item.title,
        relevantPathsAI: result.relevantPathsAI || [],
        rationaleAI: result.rationaleAI || '',
      };

  if (existingIdx >= 0) {
    data.mappings[existingIdx] = newMapping;
  } else {
    data.mappings.push(newMapping);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// --- Prepare items for remap ---
function prepareRemapItems(sectionCode, type, catalog) {
  const existing = loadExistingMappings(sectionCode, type);
  if (!existing) return { items: [], existing: null };

  const items = existing.mappings
    .map((m) => {
      const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
      const catalogEntry = catalog.get(id);
      if (!catalogEntry?.summaryAI) return null;
      if (emptyOnlyFlag && m.relevantPathsAI?.length > 0) return null;

      return {
        id,
        title: type === 'vsi' ? m.vsiTitle : m.articleTitle,
        author: type === 'vsi' ? m.vsiAuthor : undefined,
        summaryAI: catalogEntry.summaryAI,
      };
    })
    .filter(Boolean);

  return { items, existing };
}

// --- Get items for discover mode ---
function getDiscoverItems(type, catalog) {
  if (itemFlag) {
    const entry = catalog.get(itemFlag);
    if (!entry) {
      console.error(`Item not found in catalog: ${itemFlag}`);
      process.exit(1);
    }
    if (!entry.summaryAI) {
      console.error(`Item has no summaryAI: ${itemFlag} (run generate-summary-ai.mjs first)`);
      process.exit(1);
    }
    return [{
      id: itemFlag,
      title: entry.title,
      author: entry.author,
      summaryAI: entry.summaryAI,
    }];
  }

  // All items or new-only
  const items = [];
  const mappedIds = new Set();

  if (newOnlyFlag) {
    // Find all items currently mapped to ANY section
    const dir = mappingDirPath(type);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const m of data.mappings) {
        const id = type === 'vsi' ? `${m.vsiTitle}::${m.vsiAuthor}` : m.articleTitle;
        mappedIds.add(id);
      }
    }
  }

  for (const [id, entry] of catalog) {
    if (!entry.summaryAI) continue;
    if (newOnlyFlag && mappedIds.has(id)) continue;
    items.push({
      id,
      title: entry.title,
      author: entry.author,
      summaryAI: entry.summaryAI,
    });
  }

  return items.slice(0, limitFlag);
}

// --- Remap: process a single section ---
async function processRemapSection(client, systemPrompt, sectionCode, type, catalog) {
  const section = loadSectionOutline(sectionCode);
  if (!section) {
    return { processed: 0, skipped: true };
  }

  const { items, existing } = prepareRemapItems(sectionCode, type, catalog);
  if (items.length === 0) {
    return { processed: 0, skipped: true };
  }

  if (dryRunFlag) {
    console.log(`  Section ${sectionCode} (${type}): would process ${items.length} items`);
    return { processed: items.length, skipped: false };
  }

  const results = await generateRemapMappings(client, systemPrompt, section, items, type);
  if (results.length > 0) {
    writeMappingResults(sectionCode, results, type, existing);
  }

  return { processed: results.length, skipped: false };
}

// --- Discover: process a single item ---
async function processDiscoverItem(client, systemPrompt, item, allSections, type) {
  const candidates = rankSectionsForItem(item, allSections);

  if (candidates.length === 0) {
    console.log(`  ${item.id}: no candidate sections found`);
    return { discovered: 0 };
  }

  if (dryRunFlag) {
    console.log(`  ${item.id}: ${candidates.length} candidate sections (top: ${candidates.slice(0, 5).map((s) => s.sectionCode).join(', ')})`);
    return { discovered: candidates.length };
  }

  const results = await generateDiscoverMappings(client, systemPrompt, item, candidates, type);

  for (const result of results) {
    if (result.sectionCode && result.relevantPathsAI?.length > 0) {
      writeDiscoverResult(result.sectionCode, item, result, type);
    }
  }

  return { discovered: results.length };
}

// --- Assign mode: select articles for a section from candidates + assign paths ---

function buildAssignSystemPrompt(taxonomy) {
  return `You are a knowledge-mapping agent for the Propaedia — a taxonomy of all human knowledge.

You receive a section's full outline and a list of candidate items (books or articles) with their summaryAI. Your job is to:
1. DECIDE which candidates genuinely belong in this section (reject those with only tangential overlap)
2. For each confirmed item, assign the specific outline paths it covers (relevantPathsAI)
3. Write a brief rationale (1-2 sentences) explaining the connection

The full Propaedia taxonomy for context:

${taxonomy}

IMPORTANT RULES:
- Only confirm items with genuine, substantive topical overlap — not just tangential mention of a keyword
- Every leaf-level outline path in the section should ideally have at least one item covering it, so that users clicking any nested subsection see recommendations. If a candidate is the only defensible item for a particular leaf path, include it even if the overlap is moderate.
- Use the most specific path that applies (e.g., A.3.b rather than just A), AND also include broader parent paths if the item covers the topic broadly
- Write rationales that reference specific concepts from the item's summary and specific outline paths
- Do not use framing like "This article covers..." — write direct factual rationales
- It is fine to reject many candidates — quality over quantity
- If no candidates genuinely match, return an empty array

Output format — a JSON array (only include confirmed items):
[{
  "id": "item identifier",
  "relevantPathsAI": ["A.1", "B.3", ...],
  "rationaleAI": "Direct factual rationale referencing outline paths..."
}]`;
}

function rankCandidatesForSection(section, allItems) {
  const scored = allItems
    .filter((item) => item.summaryAI)
    .map((item) => {
      const textParts = [item.summaryAI, item.title];
      if (item.keywords) textParts.push(item.keywords);
      if (item.subject) textParts.push(item.subject);
      const itemTokens = tokenize(textParts.join(' '));
      return { ...item, score: countOverlap(itemTokens, section.tokens) };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, ASSIGN_CANDIDATES);
}

function buildCatalogItems(catalog) {
  return [...catalog.entries()]
    .filter(([, entry]) => entry.summaryAI)
    .map(([id, entry]) => {
      const textParts = [entry.summaryAI, entry.title];
      if (entry.author) textParts.push(entry.author);
      if (entry.keywords) textParts.push(entry.keywords);
      if (entry.subject) textParts.push(entry.subject);
      return {
        id,
        title: entry.title,
        author: entry.author,
        summaryAI: entry.summaryAI,
        keywords: entry.keywords,
        subject: entry.subject,
        tokens: tokenize(textParts.join(' ')),
      };
    });
}

function buildLeafQueryTokens(sectionAuditLeaf, sectionTitle) {
  const textParts = [sectionTitle, ...sectionAuditLeaf.trail.map((step) => step.text)];
  return tokenize(textParts.join(' '));
}

function getMappingId(mapping, type) {
  return normalizeType(type) === 'vsi'
    ? `${mapping.vsiTitle}::${mapping.vsiAuthor}`
    : mapping.articleTitle;
}

function rankCandidatesForLeaf(sectionAudit, leaf, allItems, existingIds, limit = 12) {
  const queryTokens = buildLeafQueryTokens(leaf, sectionAudit.title);
  return allItems
    .map((item) => {
      const overlap = countOverlap(queryTokens, item.tokens || tokenize([item.summaryAI, item.title].join(' ')));
      return {
        id: item.id,
        title: item.title,
        author: item.author,
        score: overlap,
        alreadyMappedToSection: existingIds.has(item.id),
      };
    })
    .filter((item) => item.score > 0 || item.alreadyMappedToSection)
    .sort((a, b) => {
      if (b.alreadyMappedToSection !== a.alreadyMappedToSection) {
        return Number(b.alreadyMappedToSection) - Number(a.alreadyMappedToSection);
      }
      return b.score - a.score;
    })
    .slice(0, limit);
}

async function generateAssignMappings(client, systemPrompt, section, candidates, type) {
  const coverageNote = formatCoveragePriorityNote(section.stem || section.sectionCode, type);

  const userMessage = `Section ${section.sectionCode}: ${section.title}

Outline:
${section.outlineText}${coverageNote}

---

Candidate items to evaluate (${candidates.length} ${type === 'vsi' ? 'VSI books' : 'Wikipedia articles'}):

${formatItemsForPrompt(candidates, type)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`  Failed to parse JSON for section ${section.sectionCode}`);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`  JSON parse error for section ${section.sectionCode}: ${err.message}`);
    return [];
  }
}

function writeAssignResults(sectionCode, results, type) {
  const section = loadSectionDocument(sectionCode);
  const filePath = mappingFilePath(sectionCode, type);

  const mappings = results.map((r) => {
    if (type === 'vsi') {
      // Parse "Title::Author" ID format
      const parts = r.id.split('::');
      return {
        vsiTitle: parts[0],
        vsiAuthor: parts[1] || '',
        relevantPathsAI: r.relevantPathsAI || [],
        rationaleAI: r.rationaleAI || '',
      };
    } else {
      return {
        articleTitle: r.id,
        relevantPathsAI: r.relevantPathsAI || [],
        rationaleAI: r.rationaleAI || '',
      };
    }
  });

  const output = {
    sectionCode: section?.sectionCode || sectionCode,
    mappings,
    _curatedBy: 'ai',
    _generatedAt: new Date().toISOString().split('T')[0],
  };
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n');
}

async function processAssignSection(client, systemPrompt, sectionCode, type, allItems, sectionData) {
  const section = sectionData || loadSectionOutline(sectionCode);
  if (!section) {
    return { confirmed: 0, candidates: 0, skipped: true };
  }
  if (!section.tokens) section.tokens = tokenize(section.fullText);

  const candidates = rankCandidatesForSection(section, allItems);
  if (candidates.length === 0) {
    return { confirmed: 0, candidates: 0, skipped: true };
  }

  if (dryRunFlag) {
    console.log(`  Section ${sectionCode} (${type}): ${candidates.length} candidates (top: ${candidates.slice(0, 5).map((c) => c.title).join(', ')})`);
    return { confirmed: 0, candidates: candidates.length, skipped: false };
  }

  const results = await generateAssignMappings(client, systemPrompt, section, candidates, type);
  if (results.length > 0) {
    writeAssignResults(sectionCode, results, type);
  } else {
    // Write empty mapping file to indicate this section was processed
    writeAssignResults(sectionCode, [], type);
  }

  return { confirmed: results.length, candidates: candidates.length, skipped: false };
}

// --- Coverage analysis ---
function runCoverageReport() {
  const sectionCodes = sectionFlag
    ? [normalizeSectionStem(sectionFlag)]
    : getAllSectionCodes().slice(0, limitFlag);
  const types = getRequestedTypes();
  const report = buildCoverageReport(sectionCodes, types);
  const reportPath = resolveReportPath('mapping-coverage-report.json');

  console.log('=== Exact Leaf Coverage Report ===\n');
  console.log('Fallback policy: a broader ancestor path counts as fallback debt, not exact coverage.\n');

  for (const type of types) {
    const typeReport = report.types[typeSlug(type)];
    const totals = typeReport.totals;

    console.log(`${typeLabel(type)}:`);
    console.log(`  Total leaf paths: ${totals.totalLeafPaths}`);
    console.log(`  Exact leaf coverage: ${totals.exactLeafPaths} (${totals.exactCoveragePct}%)`);
    console.log(`  Fallback only: ${totals.fallbackLeafPaths} (${totals.fallbackCoveragePct}%)`);
    console.log(`  Unresolved: ${totals.unresolvedLeafPaths} (${totals.unresolvedCoveragePct}%)`);
    console.log(`  Sections with unresolved leaves: ${totals.sectionsWithUnresolved}/${sectionCodes.length}`);
    console.log('');

    const worstSections = [...typeReport.sections]
      .filter((section) => section.totals.unresolvedLeafPaths > 0 || section.totals.fallbackLeafPaths > 0)
      .sort((a, b) => {
        if (b.totals.unresolvedLeafPaths !== a.totals.unresolvedLeafPaths) {
          return b.totals.unresolvedLeafPaths - a.totals.unresolvedLeafPaths;
        }
        return b.totals.fallbackLeafPaths - a.totals.fallbackLeafPaths;
      })
      .slice(0, 15);

    for (const section of worstSections) {
      console.log(
        `  ${section.sectionCode} — ${section.title} ` +
        `(exact ${section.totals.exactLeafPaths}/${section.totals.totalLeafPaths}, ` +
        `fallback ${section.totals.fallbackLeafPaths}, unresolved ${section.totals.unresolvedLeafPaths})`,
      );
      for (const leaf of section.unresolvedLeaves.slice(0, 5)) {
        console.log(`    missing: ${leaf.path}: ${leaf.text.substring(0, 70)}`);
      }
      if (section.unresolvedLeaves.length > 5) {
        console.log(`    ... and ${section.unresolvedLeaves.length - 5} more unresolved leaves`);
      }
      for (const leaf of section.fallbackLeaves.slice(0, Math.max(0, 3 - Math.min(3, section.unresolvedLeaves.length)))) {
        console.log(`    fallback: ${leaf.path}: ${leaf.text.substring(0, 70)} (${leaf.fallbackPaths.join(', ')})`);
      }
    }

    if (worstSections.length > 0) console.log('');
  }

  writeJsonReport(reportPath, report);
  console.log(`Coverage report written to ${path.relative(ROOT, reportPath)}`);
  evaluateCoverageThresholds(report, types, 'Coverage report');
}

async function runGapFillMode() {
  const type = normalizeType(typeFlag);
  const catalog = type === 'vsi' ? loadVsiCatalog() : loadWikiCatalog();
  const allItems = buildCatalogItems(catalog);
  const sectionCodes = sectionFlag
    ? [normalizeSectionStem(sectionFlag)]
    : getAllSectionCodes().slice(0, limitFlag);
  const targetFilter = getGapTargetFilter();
  const plan = {
    generatedAt: new Date().toISOString(),
    type: typeSlug(type),
    fallbackPolicy: 'allow broader ancestor path only when no defensible exact leaf mapping exists',
    filters: {
      targetFilter,
      topSections: topSectionsFlag,
      topTargetsPerSection: topTargetsFlag,
    },
    sections: [],
    totals: {
      totalLeafPaths: 0,
      exactLeafPaths: 0,
      fallbackLeafPaths: 0,
      unresolvedLeafPaths: 0,
      unresolvedTargets: 0,
      fallbackTargets: 0,
    },
    filteredTotals: {
      sections: 0,
      targets: 0,
      unresolvedTargets: 0,
      fallbackTargets: 0,
    },
  };

  for (const code of sectionCodes) {
    const audit = buildLeafCoverageAudit(code, type);
    if (!audit) continue;

    plan.totals.totalLeafPaths += audit.totalLeafPaths;
    plan.totals.exactLeafPaths += audit.exactLeafPaths;
    plan.totals.fallbackLeafPaths += audit.fallbackLeafPaths;
    plan.totals.unresolvedLeafPaths += audit.unresolvedLeafPaths;

    const existingData = loadExistingMappings(code, type);
    const existingIds = new Set((existingData?.mappings || []).map((mapping) => getMappingId(mapping, type)));
    const targets = audit.leafCoverage
      .filter((leaf) => leaf.status === 'uncovered' || leaf.status === 'fallback')
      .map((leaf) => ({
        priority: leaf.status === 'uncovered' ? 'required' : 'fallback',
        path: leaf.path,
        text: leaf.text,
        fallbackPaths: leaf.fallbackPaths,
        trail: leaf.trail.map((step) => ({ level: step.level, text: step.text })),
        candidates: rankCandidatesForLeaf(audit, leaf, allItems, existingIds),
      }));

    plan.totals.unresolvedTargets += targets.filter((target) => target.priority === 'required').length;
    plan.totals.fallbackTargets += targets.filter((target) => target.priority === 'fallback').length;

    let filteredTargets = targets;
    if (targetFilter === 'required') {
      filteredTargets = filteredTargets.filter((target) => target.priority === 'required');
    } else if (targetFilter === 'fallback') {
      filteredTargets = filteredTargets.filter((target) => target.priority === 'fallback');
    }

    filteredTargets = [...filteredTargets].sort(sortGapTargets);

    if (filteredTargets.length === 0) continue;

    if (topTargetsFlag !== null) {
      filteredTargets = filteredTargets.slice(0, topTargetsFlag);
    }

    plan.sections.push({
      sectionStem: audit.sectionStem,
      sectionCode: audit.sectionCode,
      title: audit.title,
      totals: {
        totalLeafPaths: audit.totalLeafPaths,
        exactLeafPaths: audit.exactLeafPaths,
        fallbackLeafPaths: audit.fallbackLeafPaths,
        unresolvedLeafPaths: audit.unresolvedLeafPaths,
      },
      filteredRequiredTargets: filteredTargets.filter((target) => target.priority === 'required').length,
      filteredFallbackTargets: filteredTargets.filter((target) => target.priority === 'fallback').length,
      totalTargetsInSection: targets.length,
      targets: filteredTargets,
    });
  }

  plan.sections.sort(sortGapSections);
  if (topSectionsFlag !== null) {
    plan.sections = plan.sections.slice(0, topSectionsFlag);
  }

  plan.filteredTotals.sections = plan.sections.length;
  for (const section of plan.sections) {
    plan.filteredTotals.targets += section.targets.length;
    plan.filteredTotals.unresolvedTargets += section.filteredRequiredTargets;
    plan.filteredTotals.fallbackTargets += section.filteredFallbackTargets;
  }

  const reportPath = resolveReportPath(`gap-fill-${typeSlug(type)}.json`);
  writeJsonReport(reportPath, plan);

  console.log(`=== Gap-Fill Plan (${typeLabel(type)}) ===\n`);
  console.log(`Catalog items with summaryAI: ${allItems.length}`);
  console.log(`Leaf paths audited: ${plan.totals.totalLeafPaths}`);
  console.log(`Exact leaf coverage: ${plan.totals.exactLeafPaths}`);
  console.log(`Fallback-only leaves: ${plan.totals.fallbackLeafPaths}`);
  console.log(`Unresolved leaves: ${plan.totals.unresolvedLeafPaths}`);
  console.log(`Targets queued: ${plan.totals.unresolvedTargets} required, ${plan.totals.fallbackTargets} fallback`);
  if (targetFilter !== 'all' || topSectionsFlag !== null || topTargetsFlag !== null) {
    console.log(
      `Filtered view: ${plan.filteredTotals.targets} targets across ${plan.filteredTotals.sections} sections ` +
      `(${plan.filteredTotals.unresolvedTargets} required, ${plan.filteredTotals.fallbackTargets} fallback)`,
    );
  }
  console.log('');

  const previewSectionLimit = topSectionsFlag ?? 15;
  for (const section of plan.sections.slice(0, previewSectionLimit)) {
    console.log(
      `${section.sectionCode} — ${section.title} ` +
      `(${section.filteredRequiredTargets} required, ${section.filteredFallbackTargets} fallback)`,
    );
    const previewTargetLimit = topTargetsFlag ?? 4;
    for (const target of section.targets.slice(0, previewTargetLimit)) {
      const candidateSummary = target.candidates
        .slice(0, 3)
        .map((candidate) => `${candidate.title}${candidate.author ? ` — ${candidate.author}` : ''} [${candidate.score}]${candidate.alreadyMappedToSection ? ' existing' : ''}`)
        .join('; ');
      console.log(`  ${target.priority}: ${target.path}: ${target.text.substring(0, 70)}`);
      if (target.fallbackPaths.length > 0) {
        console.log(`    fallback paths: ${target.fallbackPaths.join(', ')}`);
      }
      console.log(`    candidates: ${candidateSummary || 'none'}`);
    }
    if (section.targets.length > previewTargetLimit) {
      console.log(`    ... and ${section.targets.length - previewTargetLimit} more targets`);
    }
    console.log('');
  }

  console.log(`Gap-fill plan written to ${path.relative(ROOT, reportPath)}`);
  evaluateCoverageThresholds(buildCoverageReport(sectionCodes, [type]), [type], 'Gap-fill coverage');
}

function runStatusReport() {
  const sectionCodes = sectionFlag
    ? [normalizeSectionStem(sectionFlag)]
    : getAllSectionCodes().slice(0, limitFlag);
  const types = getRequestedTypes();
  const status = buildPipelineStatus(sectionCodes, types);
  const reportPath = resolveReportPath('pipeline-status.json');

  console.log('=== Pipeline Status ===\n');

  for (const type of types) {
    const summary = status.summary[typeSlug(type)];
    const validation = status.validation.types[typeSlug(type)]?.totals;
    const coverage = status.coverage.types[typeSlug(type)]?.totals;
    if (!summary || !validation || !coverage) continue;

    console.log(`${typeLabel(type)}:`);
    console.log(`  SummaryAI: ${summary.itemsWithSummary}/${summary.totalItems} (${summary.summaryCoveragePct}%)`);
    console.log(`  Mapping files: ${validation.mappingFiles}/${sectionCodes.length}`);
    console.log(`  Total mappings: ${validation.totalMappings}`);
    console.log(`  Empty relevantPathsAI: ${validation.emptyRelevantPaths}`);
    console.log(`  Empty/short rationaleAI: ${validation.emptyOrShortRationale}`);
    console.log(`  Invalid paths: ${validation.invalidPaths}`);
    console.log(`  Exact leaf coverage: ${coverage.exactLeafPaths}/${coverage.totalLeafPaths} (${coverage.exactCoveragePct}%)`);
    console.log(`  Fallback only: ${coverage.fallbackLeafPaths} (${coverage.fallbackCoveragePct}%)`);
    console.log(`  Unresolved: ${coverage.unresolvedLeafPaths} (${coverage.unresolvedCoveragePct}%)`);
    console.log(`  Sections with unresolved leaves: ${coverage.sectionsWithUnresolved}/${sectionCodes.length}`);
    console.log('');
  }

  writeJsonReport(reportPath, status);
  console.log(`Status report written to ${path.relative(ROOT, reportPath)}`);
  evaluateCoverageThresholds(status.coverage, types, 'Pipeline status');
}

function runRepairQueueMode() {
  const sectionCodes = sectionFlag
    ? [normalizeSectionStem(sectionFlag)]
    : getAllSectionCodes().slice(0, limitFlag);
  const types = getRequestedTypes();
  const queue = buildRepairQueue(sectionCodes, types);
  const defaultName = types.length === 1
    ? `repair-queue-${typeSlug(types[0])}.json`
    : 'repair-queue.json';
  const reportPath = resolveReportPath(defaultName);

  console.log('=== Repair Queue ===\n');

  for (const type of types) {
    const typeQueue = queue.types[typeSlug(type)];
    if (!typeQueue) continue;

    console.log(`${typeLabel(type)}:`);
    console.log(`  Queued sections: ${typeQueue.totals.queuedSections}/${typeQueue.totals.sectionsAudited}`);
    console.log(`  Recommend remap first: ${typeQueue.totals.remapFirst}`);
    console.log(`  Recommend assign first: ${typeQueue.totals.assignFirst}`);
    console.log(`  Required targets: ${typeQueue.totals.requiredTargets}`);
    console.log(`  Fallback targets: ${typeQueue.totals.fallbackTargets}`);
    console.log('');

    const previewTargetLimit = topTargetsFlag ?? 3;
    for (const section of typeQueue.sections.slice(0, topSectionsFlag ?? 15)) {
      console.log(
        `  ${section.sectionCode} — ${section.title} [` +
        `${section.action === 'remap' ? 'remap first' : 'assign first'}]`,
      );
      console.log(`    ${section.reason}`);
      console.log(
        `    unresolved ${section.totals.unresolvedLeafPaths}, fallback ${section.totals.fallbackLeafPaths}, ` +
        `mapped items ${section.existingMappingsCount} (${section.existingMappingsWithPaths} with paths)`,
      );
      console.log(
        `    existing top hits: ${section.targetSignals.existingTop1Hits}/${section.targetSignals.targetCount} top-1, ` +
        `${section.targetSignals.existingTop3Hits}/${section.targetSignals.targetCount} top-3`,
      );
      for (const target of section.targets.slice(0, previewTargetLimit)) {
        const best = target.candidates[0];
        console.log(
          `    ${target.priority}: ${target.path} — ${target.text.substring(0, 60)}` +
          `${best ? ` (best: ${best.title}${best.author ? ` — ${best.author}` : ''}${best.alreadyMappedToSection ? ', existing' : ''})` : ''}`,
        );
      }
      if (section.targets.length > previewTargetLimit) {
        console.log(`    ... and ${section.targets.length - previewTargetLimit} more targets`);
      }
      console.log('');
    }
  }

  writeJsonReport(reportPath, queue);
  console.log(`Repair queue written to ${path.relative(ROOT, reportPath)}`);
}

// --- Validation ---
function runValidation() {
  console.log('=== Validating existing mappings ===\n');
  const sectionCodes = getAllSectionCodes();
  const report = buildValidationReport(sectionCodes, ['vsi', 'wiki']);

  for (const type of ['vsi', 'wiki']) {
    const typeReport = report.types[typeSlug(type)];
    if (!typeReport) continue;
    const totals = typeReport.totals;

    console.log(`${typeLabel(type)}:`);
    console.log(`  Mapping files: ${totals.mappingFiles}/${sectionCodes.length}`);
    console.log(`  Total mappings: ${totals.totalMappings}`);
    console.log(`  Empty relevantPathsAI: ${totals.emptyRelevantPaths}`);
    console.log(`  Empty/short rationaleAI: ${totals.emptyOrShortRationale}`);
    console.log(`  Invalid paths: ${totals.invalidPaths}`);
    for (const example of typeReport.invalidExamples.slice(0, 10)) {
      console.log(`    Invalid path: ${example.sectionCode}/${example.itemId} → "${example.path}"`);
    }
    console.log('');
  }
}

// --- Main ---
async function main() {
  if (validateFlag) {
    runValidation();
    return;
  }

  if (coverageFlag) {
    runCoverageReport();
    return;
  }

  if (modeFlag === 'gap-fill') {
    await runGapFillMode();
    return;
  }

  if (modeFlag === 'status') {
    runStatusReport();
    return;
  }

  if (modeFlag === 'repair-queue') {
    runRepairQueueMode();
    return;
  }

  const taxonomy = loadTaxonomy();
  const client = dryRunFlag ? null : await getAnthropicClient();

  if (modeFlag === 'assign') {
    await runAssignMode(client, taxonomy);
  } else if (modeFlag === 'discover') {
    await runDiscoverMode(client, taxonomy);
  } else {
    await runRemapMode(client, taxonomy);
  }
}

async function runRemapMode(client, taxonomy) {
  const systemPrompt = buildRemapSystemPrompt(taxonomy);

  const vsiCatalog = (typeFlag === 'vsi' || typeFlag === 'both') ? loadVsiCatalog() : null;
  const wikiCatalog = (typeFlag === 'wikipedia' || typeFlag === 'both') ? loadWikiCatalog() : null;

  const sectionCodes = sectionFlag ? [normalizeSectionStem(sectionFlag)] : getAllSectionCodes().slice(0, limitFlag);

  if (vsiCatalog) {
    const withSummary = [...vsiCatalog.values()].filter((v) => v.summaryAI).length;
    console.log(`VSI catalog: ${withSummary}/${vsiCatalog.size} have summaryAI`);
  }
  if (wikiCatalog) {
    const withSummary = [...wikiCatalog.values()].filter((v) => v.summaryAI).length;
    console.log(`Wikipedia catalog: ${withSummary}/${wikiCatalog.size} have summaryAI`);
  }

  const types = getRequestedTypes();

  console.log(`\nMode: remap, Sections: ${sectionCodes.length}, Types: ${types.join(', ')}`);
  console.log(`Model: ${MODEL}, Concurrency: ${CONCURRENCY}`);
  if (emptyOnlyFlag) console.log('Processing only mappings with empty relevantPathsAI');
  if (dryRunFlag) console.log('DRY RUN — no changes will be written');
  console.log('');

  const work = [];
  for (const code of sectionCodes) {
    for (const type of types) {
      const catalog = type === 'vsi' ? vsiCatalog : wikiCatalog;
      if (catalog) work.push({ sectionCode: code, type, catalog });
    }
  }

  let totalProcessed = 0;
  let totalSkipped = 0;

  for (let i = 0; i < work.length; i += CONCURRENCY) {
    const chunk = work.slice(i, i + CONCURRENCY);
    const promises = chunk.map(({ sectionCode, type, catalog }) => {
      console.log(`  Processing ${sectionCode} (${type})...`);
      return processRemapSection(client, systemPrompt, sectionCode, type, catalog);
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.skipped) totalSkipped++;
      else totalProcessed += r.processed;
    }

    const done = Math.min(i + CONCURRENCY, work.length);
    console.log(`  Progress: ${done}/${work.length} tasks (${totalProcessed} items mapped)\n`);
  }

  // Post-run coverage check
  if (!dryRunFlag && totalProcessed > 0) {
    console.log('=== Post-run exact leaf coverage ===');
    const report = buildCoverageReport(sectionCodes, types);
    for (const type of types) {
      const totals = report.types[typeSlug(type)].totals;
      console.log(
        `  ${typeLabel(type)}: exact ${totals.exactLeafPaths}/${totals.totalLeafPaths} ` +
        `(${totals.exactCoveragePct}%), fallback ${totals.fallbackLeafPaths}, unresolved ${totals.unresolvedLeafPaths}`,
      );
    }
    evaluateCoverageThresholds(report, types, 'Post-remap coverage');
  }

  console.log(`Done. Processed ${totalProcessed} mappings, skipped ${totalSkipped} sections.`);
}

async function runDiscoverMode(client, taxonomy) {
  const systemPrompt = buildDiscoverSystemPrompt(taxonomy);
  const type = typeFlag === 'wikipedia' ? 'wiki' : 'vsi';
  const catalog = type === 'vsi' ? loadVsiCatalog() : loadWikiCatalog();

  const withSummary = [...catalog.values()].filter((v) => v.summaryAI).length;
  console.log(`${type} catalog: ${withSummary}/${catalog.size} have summaryAI`);

  console.log('Loading all section outlines for pre-filtering...');
  const allSections = loadAllSectionData();
  console.log(`Loaded ${allSections.length} sections`);

  const items = getDiscoverItems(type, catalog);
  console.log(`\nMode: discover, Items: ${items.length}, Type: ${type}`);
  console.log(`Model: ${MODEL}, Concurrency: ${CONCURRENCY}`);
  console.log(`Pre-filter: top ${DISCOVER_TOP_SECTIONS} sections per item by token overlap`);
  if (dryRunFlag) console.log('DRY RUN — no changes will be written');
  console.log('');

  let totalDiscovered = 0;

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const promises = chunk.map((item) => {
      console.log(`  Discovering: ${item.id}...`);
      return processDiscoverItem(client, systemPrompt, item, allSections, type);
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      totalDiscovered += r.discovered;
    }

    const done = Math.min(i + CONCURRENCY, items.length);
    console.log(`  Progress: ${done}/${items.length} items (${totalDiscovered} section mappings discovered)\n`);
  }

  console.log(`Done. Discovered ${totalDiscovered} section mappings for ${items.length} items.`);
}

async function runAssignMode(client, taxonomy) {
  const systemPrompt = buildAssignSystemPrompt(taxonomy);
  const type = typeFlag === 'wikipedia' ? 'wiki' : 'vsi';
  const catalog = type === 'vsi' ? loadVsiCatalog() : loadWikiCatalog();

  const withSummary = [...catalog.values()].filter((v) => v.summaryAI).length;
  console.log(`${type} catalog: ${withSummary}/${catalog.size} have summaryAI`);

  if (withSummary === 0) {
    console.error('No items have summaryAI. Run generate-summary-ai.mjs first.');
    process.exit(1);
  }

  // Pre-compute all items as array with tokens for ranking
  const allItems = buildCatalogItems(catalog);

  const sectionCodes = sectionFlag ? [normalizeSectionStem(sectionFlag)] : getAllSectionCodes().slice(0, limitFlag);

  console.log(`\nMode: assign, Sections: ${sectionCodes.length}, Type: ${type}`);
  console.log(`Model: ${MODEL}, Concurrency: ${CONCURRENCY}`);
  console.log(`Candidates per section: up to ${ASSIGN_CANDIDATES} (pre-filtered by token overlap)`);
  if (dryRunFlag) console.log('DRY RUN — no changes will be written');
  console.log('');

  let totalConfirmed = 0;
  let totalCandidates = 0;
  let totalSkipped = 0;

  // Pre-load all section data with tokens
  const sectionDataMap = new Map();
  for (const code of sectionCodes) {
    const s = loadSectionOutline(code);
    if (s) {
      s.tokens = tokenize(s.fullText);
      sectionDataMap.set(code, s);
    }
  }

  for (let i = 0; i < sectionCodes.length; i += CONCURRENCY) {
    const chunk = sectionCodes.slice(i, i + CONCURRENCY);
    const promises = chunk.map((code) => {
      console.log(`  Assigning ${code} (${type})...`);
      return processAssignSection(client, systemPrompt, code, type, allItems, sectionDataMap.get(code));
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.skipped) totalSkipped++;
      else {
        totalConfirmed += r.confirmed;
        totalCandidates += r.candidates;
      }
    }

    const done = Math.min(i + CONCURRENCY, sectionCodes.length);
    console.log(`  Progress: ${done}/${sectionCodes.length} sections (${totalConfirmed} items assigned from ${totalCandidates} candidates)\n`);
  }

  // Post-run coverage check
  if (!dryRunFlag && totalConfirmed > 0) {
    console.log('=== Post-assign exact leaf coverage ===');
    const report = buildCoverageReport(sectionCodes, [type]);
    const totals = report.types[typeSlug(type)].totals;
    console.log(`Leaf paths in processed sections: ${totals.totalLeafPaths}`);
    console.log(`Exact: ${totals.exactLeafPaths} (${totals.exactCoveragePct}%)`);
    console.log(`Fallback only: ${totals.fallbackLeafPaths} (${totals.fallbackCoveragePct}%)`);
    console.log(`Unresolved: ${totals.unresolvedLeafPaths} (${totals.unresolvedCoveragePct}%)`);
    evaluateCoverageThresholds(report, [type], 'Post-assign coverage');
  }

  console.log(`\nDone. Assigned ${totalConfirmed} items across ${sectionCodes.length - totalSkipped} sections (${totalCandidates} candidates evaluated).`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
