#!/usr/bin/env node
// Checks what flowmap needs and prints the exact fix for anything missing. Installs nothing.
// Exits 1 when something the command needs is missing, 0 otherwise (a PNG renderer is optional).
// Pele ships with the skill in vendor/pele/, so the only thing to install is Node itself.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_NODE = 20;
const skill = join(dirname(fileURLToPath(import.meta.url)), '..');
let missing = false;
const line = (ok, what, detail) => console.log(`${ok ? 'OK     ' : 'MISSING'} ${what}${detail ? `: ${detail}` : ''}`);

const major = Number(process.versions.node.split('.')[0]);
const nodeOk = major >= MIN_NODE;
line(nodeOk, `Node ${process.versions.node}`, nodeOk ? '' : `flowmap needs Node ${MIN_NODE} or later. Install it from https://nodejs.org`);
missing ||= !nodeOk;

const need = ['vendor/pele/pele.mjs', 'vendor/pele/pele.global.js', 'vendor/pele/VERSION', 'assets/theme.css', 'assets/viewer.css', 'assets/viewer.js'];
const gone = need.filter((f) => !existsSync(join(skill, f)));
if (gone.length) {
  line(false, 'skill files', `${gone.join(', ')} not found, so the skill folder is incomplete. Reinstall the skill.`);
  missing = true;
} else {
  line(true, `pele ${readFileSync(join(skill, 'vendor/pele/VERSION'), 'utf8').trim()} (ships with the skill)`);
}

if (!missing) {
  // Optional: only --png needs a browser. render.mjs imports Pele, so load it once the files are there.
  const { PLAYWRIGHT_INSTALL, findChrome, loadPlaywright } = await import('./lib/render.mjs');
  const chrome = loadPlaywright() ? 'Playwright' : findChrome();
  console.log(chrome
    ? `OK      PNG previews (--png) with ${chrome}`
    : `NOTE    no Playwright, Chrome or Chromium, so --png cannot make a preview. Open the HTML page in a browser instead, or install Playwright (it downloads a browser): ${PLAYWRIGHT_INSTALL}`);
}

process.exitCode = missing ? 1 : 0;
