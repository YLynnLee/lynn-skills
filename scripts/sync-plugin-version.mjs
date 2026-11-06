#!/usr/bin/env node
// Copies package.json's version into .claude-plugin/plugin.json, so the plugin
// version follows changesets. Runs as part of `npm run version`.
// With --check it changes nothing and exits 1 if the two differ.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = join(root, ".claude-plugin", "plugin.json");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const text = readFileSync(pluginPath, "utf8");
const current = JSON.parse(text).version;

if (current === version) process.exit(0);
if (process.argv.includes("--check")) {
  console.error(`plugin.json is ${current}, package.json is ${version}. Run \`node scripts/sync-plugin-version.mjs\`.`);
  process.exit(1);
}
// Rewrite only the version line, to keep the file's formatting.
writeFileSync(pluginPath, text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`));
console.log(`plugin.json: ${current} -> ${version}`);
