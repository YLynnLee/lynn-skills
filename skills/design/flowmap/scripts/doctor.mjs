#!/usr/bin/env node
// Checks what flowmap needs and prints the exact command for anything missing. Installs nothing.
// Exits 1 when something the command needs is missing, 0 otherwise (a PNG renderer is optional).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = join(dirname(fileURLToPath(import.meta.url)), '..');
const pinned = JSON.parse(readFileSync(join(skill, 'package.json'), 'utf8')).dependencies.pele;
const install = `npm install --prefix "${skill}"`;
let missing = false;
const line = (ok, what, detail) => console.log(`${ok ? 'OK     ' : 'MISSING'} ${what}${detail ? `: ${detail}` : ''}`);

const [major, minor] = process.versions.node.split('.').map(Number);
const nodeOk = major > 18 || (major === 18 && minor >= 3);
line(nodeOk, `Node ${process.versions.node}`, nodeOk ? '' : 'flowmap needs Node 18.3 or later. Install it from https://nodejs.org');
missing ||= !nodeOk;

let pele = null;
try { pele = createRequire(join(skill, 'package.json'))('pele/package.json').version; } catch { /* not installed */ }
const peleOk = pele === pinned;
line(peleOk, `pele ${pele ?? ''}`.trim(), peleOk ? '' : pele ? `expected ${pinned}. Run: ${install}` : `not installed. Run: ${install}`);
missing ||= !peleOk;

if (peleOk) {
  // Optional: only --png needs a browser. render.mjs imports pele, so load it once pele is there.
  const { PLAYWRIGHT_INSTALL, findChrome, loadPlaywright } = await import('./lib/render.mjs');
  const chrome = loadPlaywright() ? 'Playwright' : findChrome();
  console.log(chrome
    ? `OK      PNG previews (--png) with ${chrome}`
    : `NOTE    no Playwright or Chrome, so --png cannot make a preview. Open the HTML page in a browser instead, or install Playwright (it downloads a browser): ${PLAYWRIGHT_INSTALL}`);
}

if (!existsSync(join(skill, 'assets', 'theme.css'))) { line(false, 'assets/theme.css', 'the skill folder is incomplete; reinstall the skill'); missing = true; }
process.exitCode = missing ? 1 : 0;
