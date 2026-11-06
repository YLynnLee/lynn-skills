#!/usr/bin/env node
// Screenshot elements of a page and read their computed styles, with Playwright.
// Used by measure.py (live references) and verify.py (the board).
//
// Usage: node render.js <file-or-url> <out-dir> <specs.json> [viewport-width]
//        node render.js --check      confirm Playwright loads and Chromium starts; prints JSON
//   specs.json: [{"name": "nav", "selector": "header nav"}]          one element each
//            or [{"attr": "data-crop"}]                              every element with that attribute,
//                                                                    named by its value (+ "~2", "~3" for repeats)
// Prints JSON: {"scale": 2, "items": [{"name", "file", "box", "computed"}], "missing": [...],
//              "unavailable": [font families used but not loaded, so drawn in a fallback]}
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { execSync } = require('child_process');

const INSTALL = 'Install it next to this skill (npm install, in the skill folder) or globally ' +
  '(npm install -g playwright), then download its browser: npx playwright install chromium';

// Node only looks in node_modules beside this script and above it, and in NODE_PATH. A global
// install (npm install -g) lives elsewhere, so look there too before giving up.
function loadPlaywright() {
  const tried = [];
  for (const name of ['playwright', '@playwright/test']) {
    try { return require(name); } catch (e) { tried.push(name); }
  }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    for (const name of ['playwright', '@playwright/test']) {
      try { return require(path.join(root, name)); } catch (e) { tried.push(path.join(root, name)); }
    }
  } catch (e) { tried.push('npm root -g (npm not found)'); }
  console.error(`Playwright not found (looked for ${tried.join(', ')}). ${INSTALL}`);
  process.exit(3);
}

// CHROMIUM_PATH points at a Chromium to use instead of Playwright's own download,
// for machines where that download is blocked or a matching browser is already installed.
//
// Text is drawn with greyscale antialiasing only. Where the system enables subpixel (LCD) text, as
// Linux CI does, glyph edges are tinted per colour channel, and those tints sit further from the
// background than the real text colour, so they'd be read as the text colour.
async function launch(chromium) {
  const options = { args: ['--disable-lcd-text'] };
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  try {
    return await chromium.launch(options);
  } catch (e) {
    const first = String(e.message).split('\n')[0];
    console.error(/Executable doesn't exist|browserType\.launch/.test(e.message)
      ? `Chromium could not start: ${first}\nRun: npx playwright install chromium (or set CHROMIUM_PATH to an installed Chromium)`
      : `Chromium could not start: ${first}`);
    process.exit(3);
  }
}

const { chromium } = loadPlaywright();

const PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'background-color', 'background-image', 'border-top-width', 'border-top-style', 'border-top-color',
  'border-radius', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'box-shadow',
  'transition', 'animation-name', 'animation-duration'];

(async () => {
  if (process.argv[2] === '--check') {
    const browser = await launch(chromium);
    const version = browser.version();
    await browser.close();
    process.stdout.write(JSON.stringify({ ok: true, chromium: version }));
    return;
  }
  const [target, outDir, specsPath, width] = process.argv.slice(2);
  if (!target || !outDir || !specsPath) {
    console.error('usage: node render.js <file-or-url> <out-dir> <specs.json> [viewport-width]');
    process.exit(2);
  }
  const specs = JSON.parse(fs.readFileSync(specsPath, 'utf8'));
  const url = /^https?:/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launch(chromium);
  const page = await browser.newPage({ viewport: { width: Number(width) || 1280, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.goto(url, { waitUntil: 'load' }));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // stop transitions and pause animations; each screenshot below also finishes finite animations and
  // cancels infinite ones, so a fade-in is captured at its end state, not the frame it happened to reach
  await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}' });

  const handles = [];
  const missing = [];
  const seen = {};
  for (const spec of specs) {
    if (spec.attr) {
      for (const h of await page.$$(`[${spec.attr}]`)) {
        const value = await h.getAttribute(spec.attr);
        seen[value] = (seen[value] || 0) + 1;
        handles.push({ name: seen[value] > 1 ? `${value}~${seen[value]}` : value, handle: h });
      }
    } else {
      const h = await page.$(spec.selector);
      if (h) handles.push({ name: spec.name, handle: h });
      else missing.push(spec.name);
    }
  }

  const items = [];
  for (const { name, handle } of handles) {
    await handle.scrollIntoViewIfNeeded().catch(() => {});
    const file = path.join(outDir, name.replace(/[^\w~-]+/g, '_') + '.png');
    const box = await handle.boundingBox();
    if (!box || box.width < 1 || box.height < 1) { missing.push(name); continue; }
    await handle.screenshot({ path: file, animations: 'disabled' });
    const computed = await handle.evaluate((el, props) => {
      const read = (node) => {
        const cs = getComputedStyle(node);
        const out = {};
        for (const p of props) out[p] = cs.getPropertyValue(p);
        return out;
      };
      // the element, plus the first element inside it that holds text directly
      const textEl = [el, ...el.querySelectorAll('*')].find((n) =>
        [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()));
      return { self: read(el), text: textEl ? read(textEl) : null };
    }, PROPS);
    items.push({ name, file, box, computed });
  }
  // fonts the page asks for but the browser couldn't load: the text then draws in a fallback,
  // and every size measured from it is wrong
  const families = [...new Set(items.flatMap(({ computed }) => [computed.self, computed.text])
    .filter(Boolean).map((c) => c['font-family'].split(',')[0].trim().replace(/^["']|["']$/g, '')))];
  const unavailable = await page.evaluate((names) => {
    const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
      'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);
    const ctx = document.createElement('canvas').getContext('2d');
    const width = (font) => { ctx.font = font; return ctx.measureText('mmmmmmmmmmlliWW0@#').width; };
    const failed = [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family.replace(/^["']|["']$/g, ''));
    return names.filter((n) => !generic.has(n.toLowerCase())).filter((n) => failed.includes(n) ||
      ['monospace', 'serif', 'sans-serif'].every((g) => width(`40px "${n}", ${g}`) === width(`40px ${g}`)));
  }, families);
  await browser.close();
  process.stdout.write(JSON.stringify({ scale: 2, items, missing, unavailable }, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
