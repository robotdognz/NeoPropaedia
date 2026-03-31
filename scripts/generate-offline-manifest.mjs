#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DIST = path.resolve('dist');
const OUTPUT_PATH = path.join(DIST, 'offline-manifest.json');
const BASE = '/NeoPropaedia/';

function walkFiles(dir) {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(resolved));
      continue;
    }

    if (entry.isFile()) {
      files.push(resolved);
    }
  }

  return files;
}

function toOfflineUrl(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');

  if (normalized === 'index.html') {
    return BASE;
  }

  if (normalized.endsWith('/index.html')) {
    return BASE + normalized.slice(0, -'index.html'.length);
  }

  return BASE + normalized;
}

const entries = walkFiles(DIST)
  .map((absolutePath) => {
    const relativePath = path.relative(DIST, absolutePath);
    return {
      absolutePath,
      relativePath,
    };
  })
  .filter(({ relativePath }) => relativePath !== 'offline-manifest.json')
  .map(({ absolutePath, relativePath }) => ({
    url: toOfflineUrl(relativePath),
    bytes: fs.statSync(absolutePath).size,
  }))
  .sort((left, right) => left.url.localeCompare(right.url, undefined, { numeric: true, sensitivity: 'base' }));

const hash = crypto.createHash('sha1');
for (const entry of entries) {
  hash.update(`${entry.url}:${entry.bytes}\n`);
}

const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const manifest = {
  version: hash.digest('hex').slice(0, 12),
  generatedAt: new Date().toISOString(),
  totalFiles: entries.length,
  totalBytes,
  urls: entries,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest));

console.log(`Generated offline manifest with ${manifest.totalFiles} files (${Math.round(totalBytes / 1024 / 1024)} MB).`);
