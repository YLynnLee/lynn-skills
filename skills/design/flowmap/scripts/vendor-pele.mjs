#!/usr/bin/env node
// For maintainers: copy Pele from npm into vendor/pele/, or check that the copy there matches npm.
// Users never run this: the skill ships vendor/pele/, so it needs no `npm install`.
//
//   node scripts/vendor-pele.mjs            refresh vendor/pele/ at the version in vendor/pele/VERSION
//   node scripts/vendor-pele.mjs 1.14.0     move vendor/pele/ to another version
//   node scripts/vendor-pele.mjs --check    exit 1 unless vendor/pele/ is byte-for-byte what npm has
//
// `npm pack` downloads the package and checks it against the integrity hash the registry publishes,
// so the files copied or compared here are the ones Pele's maintainers published.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const skill = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(skill, 'vendor', 'pele');

// Published path in the package -> name in vendor/pele/. The ESM build is named .mjs so Node reads it
// as a module wherever the skill is copied, with or without the skill's package.json beside it.
const FILES = {
  'package/dist/pele.js': 'pele.mjs',
  'package/dist/pele.global.js': 'pele.global.js',
  'package/LICENSE': 'LICENSE',
};

const args = process.argv.slice(2);
const check = args.includes('--check');
const version = args.find((a) => !a.startsWith('--')) ?? readFileSync(join(vendor, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`"${version}" is not an exact version such as 1.13.0.`);
  process.exit(2);
}

const run = (cmd, argv, cwd) => {
  // npm is npm.cmd on Windows, which needs a shell to start.
  const r = spawnSync(cmd, argv, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && cmd === 'npm' });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} failed:\n${(r.error?.message ?? r.stderr ?? '').trim()}`);
  return r.stdout;
};

const tmp = mkdtempSync(join(tmpdir(), 'flowmap-vendor-'));
try {
  const [packed] = JSON.parse(run('npm', ['pack', `pele@${version}`, '--json', '--silent'], tmp));
  run('tar', ['-xzf', packed.filename], tmp);
  if (check) {
    const stale = Object.entries(FILES).filter(([from, to]) => {
      let ours;
      try { ours = readFileSync(join(vendor, to)); } catch { return true; }
      return !ours.equals(readFileSync(join(tmp, from)));
    }).map(([, to]) => to);
    if (stale.length) {
      console.error(`vendor/pele/ does not match pele@${version} on npm: ${stale.join(', ')}. Run: node scripts/vendor-pele.mjs`);
      process.exit(1);
    }
    console.log(`OK vendor/pele/ matches pele@${version} on npm (${packed.integrity}).`);
  } else {
    mkdirSync(vendor, { recursive: true });
    for (const [from, to] of Object.entries(FILES)) writeFileSync(join(vendor, to), readFileSync(join(tmp, from)));
    writeFileSync(join(vendor, 'VERSION'), `${version}\n`);
    console.log(`Copied pele@${version} (${packed.integrity}) into vendor/pele/. Run the tests; if a fixture's Mermaid changed, check it and run \`FLOWMAP_UPDATE=1 npm test\`.`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
