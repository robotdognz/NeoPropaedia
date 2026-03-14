#!/usr/bin/env node
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForContent(page, s = 90) {
  for (let i = 0; i < s; i++) {
    try {
      const ok = await page.evaluate(() => {
        const t = document.body?.innerText || '';
        return t.length > 300 && !t.includes('security verification');
      });
      if (ok) return;
    } catch {}
    await sleep(1000);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('https://academic.oup.com/very-short-introductions/search-results', {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  console.log('Waiting for Cloudflare...');
  await waitForContent(page);
  console.log('Page loaded. Waiting 20s for you to reject cookies...');
  await sleep(20000);

  // Dump ALL inputs on the page
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea')).map(el => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      className: el.className.substring(0, 100),
      value: el.value,
      visible: el.offsetParent !== null,
    }));
  });
  console.log('\n=== All inputs on page ===');
  inputs.forEach(i => console.log(JSON.stringify(i)));

  // Dump buttons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [role="button"]')).map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 60),
      className: el.className.substring(0, 80),
      ariaLabel: el.getAttribute('aria-label'),
      visible: el.offsetParent !== null,
    })).filter(b => b.visible);
  });
  console.log('\n=== Visible buttons ===');
  buttons.forEach(b => console.log(JSON.stringify(b)));

  // Dump forms
  const forms = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).map(f => ({
      action: f.action,
      method: f.method,
      id: f.id,
      className: f.className.substring(0, 80),
      inputCount: f.querySelectorAll('input').length,
    }));
  });
  console.log('\n=== Forms ===');
  forms.forEach(f => console.log(JSON.stringify(f)));

  await sleep(3000);
  await browser.close();
}

main().catch(console.error);
