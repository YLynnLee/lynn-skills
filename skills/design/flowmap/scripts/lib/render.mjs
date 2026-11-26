// Renders Mermaid text to SVG with Pele, and optionally to PNG with Playwright or Chrome.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Pele ships with the skill in vendor/pele/ (copied from npm by scripts/vendor-pele.mjs), so nothing is installed.
import { render, PeleError } from '../../vendor/pele/pele.mjs';

// Pele's defaults are sized for small diagrams. These match the statechart skill's render settings.
export const LIMITS = { limit: 1_000_000, outputLimit: 8_000_000, maxEdges: 10_000 };

export const peleVersion = () => readFileSync(new URL('../../vendor/pele/VERSION', import.meta.url), 'utf8').trim();

export const defaultCss = () => readFileSync(new URL('../../assets/theme.css', import.meta.url), 'utf8');

/** Put a <style> element at the start of the SVG, so the file carries its own light and dark colors. */
export function withStyle(svg, css) {
  if (!css) return svg;
  const at = svg.indexOf('>') + 1;
  // SVG <style> text is parsed as XML (and as foreign content when inlined in HTML), so escape & and <.
  const text = css.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `${svg.slice(0, at)}<style>${text}</style>${svg.slice(at)}`;
}

/**
 * Render Mermaid text. Throws PeleError on bad input.
 * @returns {{ svg: string, type: string, width: number, height: number, nodes: number, edges: number }}
 */
export function renderMermaid(text, { css } = {}) {
  const r = render(text, LIMITS);
  return {
    svg: withStyle(r.svg, css),
    type: r.type,
    width: r.width,
    height: r.height,
    nodes: (r.svg.match(/class="pele-node[ "]/g) ?? []).length,
    // Arrows in diagrams other than flowcharts carry a second class, such as `pele-edge pele-message`.
    edges: (r.svg.match(/class="pele-edge[ "]/g) ?? []).length,
  };
}

/** A PeleError as text that points at the line in the Mermaid source. */
export function describeError(err) {
  if (!(err instanceof PeleError)) return String(err?.stack ?? err);
  const where = err.line ? ` at line ${err.line}, column ${err.column}` : '';
  return `Pele ${err.code} error${where}:\n${err.message}`;
}

export { PeleError };

// Playwright lives outside the skill folder, so `npm install` in the skill cannot remove it.
export const PLAYWRIGHT_DIR = process.env.FLOWMAP_PLAYWRIGHT_DIR ?? join(homedir(), '.cache', 'flowmap');
export const PLAYWRIGHT_INSTALL = `npm install --prefix ${PLAYWRIGHT_DIR} playwright && npx --prefix ${PLAYWRIGHT_DIR} playwright install chromium`;
const PAD = 24;

/**
 * The page a PNG is taken of. `html` takes the class `pele`, so the padding gets the theme's own
 * background in light and dark, rather than a color of its own.
 */
const pngPage = (svg) => `<!doctype html><html class="pele"><head><meta charset="utf-8"><style>
html, body { margin: 0; background: var(--pele-bg, #fff); }
body { padding: ${PAD}px; display: inline-block; }
</style></head><body>${svg}</body></html>`;

export function loadPlaywright() {
  for (const from of [import.meta.url, join(PLAYWRIGHT_DIR, 'package.json')]) {
    try { return createRequire(from)('playwright'); } catch { /* try the next place */ }
  }
  return null;
}

/**
 * Chrome or Chromium on this computer: $FLOWMAP_CHROME, then the usual places. On Windows, Edge counts
 * too: it is Chromium, takes the same flags, and comes with every copy of Windows 10 and 11.
 */
export function findChrome() {
  const windows = process.platform === 'win32';
  const env = process.env;
  const winRoots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
  const candidates = [
    env.FLOWMAP_CHROME,
    ...(windows
      ? [
        ...winRoots.map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')),
        ...winRoots.map((root) => join(root, 'Chromium', 'Application', 'chrome.exe')),
        ...winRoots.map((root) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
      ]
      : [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      ]),
  ].filter(Boolean);
  for (const path of candidates) if (existsSync(path)) return path;
  const names = windows ? ['chrome', 'msedge'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const name of names) {
    const r = spawnSync(windows ? 'where' : 'which', [name], { encoding: 'utf8' });
    const found = r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : '';
    if (found) return found;
  }
  return null;
}

/**
 * Screenshot an SVG at 2x: with Playwright when it is installed, else with Chrome on this computer.
 * `width` and `height` are the SVG's size, which Chrome needs for its window.
 */
export async function svgToPng(svg, pngPath, { dark = false, width, height } = {}) {
  const playwright = loadPlaywright();
  if (playwright) {
    const browser = await playwright.chromium.launch();
    try {
      const page = await browser.newPage({ deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
      await page.setContent(pngPage(svg));
      await page.locator('body').screenshot({ path: pngPath });
      return;
    } finally {
      await browser.close();
    }
  }
  const chrome = findChrome();
  if (!chrome) throw new Error(`PNG output needs Playwright or Chrome. Install Playwright (it downloads a browser): ${PLAYWRIGHT_INSTALL}`);
  if (!width || !height) throw new Error('PNG output with Chrome needs the SVG size.');
  const dir = mkdtempSync(join(tmpdir(), 'flowmap-png-'));
  try {
    const page = join(dir, 'page.html');
    writeFileSync(page, pngPage(svg));
    rmSync(pngPath, { force: true });
    const r = spawnSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${join(dir, 'profile')}`,
      '--force-device-scale-factor=2',
      `--window-size=${Math.ceil(width) + PAD * 2},${Math.ceil(height) + PAD * 2}`,
      `--blink-settings=preferredColorScheme=${dark ? 0 : 1}`,
      `--screenshot=${resolve(pngPath)}`,
      pathToFileURL(page).href,
    ], { encoding: 'utf8', timeout: 60_000 });
    if (!existsSync(pngPath)) throw new Error(`Chrome (${chrome}) made no PNG: ${(r.error?.message ?? r.stderr ?? '').trim().split('\n').at(-1)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
