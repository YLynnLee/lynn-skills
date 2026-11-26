#!/usr/bin/env node
// flowmap: check a graph, write it as Mermaid, and render it to SVG with Pele.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkFlow } from './lib/flow.mjs';
import { DEFAULT_MAX_EDGES, assumptions, leftOut, sources, toMermaid, validate } from './lib/graph.mjs';
import { buildHtml } from './lib/html.mjs';
import { checkSources } from './lib/sources.mjs';
import { PeleError, defaultCss, describeError, peleVersion, renderMermaid, svgToPng } from './lib/render.mjs';

// A drawing more than this many times as wide as it is tall, or the other way, shows small labels in a picture.
const MAX_RATIO = 4;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const USAGE = `Usage: flowmap.mjs INPUT [options]

INPUT is either:
  graph.json   a flowmap graph (references/graph-format.md). It is checked,
               written as Mermaid flowchart text, and rendered.
  diagram.mmd  any Mermaid diagram. It is rendered only; sources are not checked.

Options:
  --out DIR        where to write the page (default: next to INPUT)
  --png            also write a PNG at 2x to look at the layout, in a temp folder
                   (with Playwright if installed, else with Chrome or Chromium)
  --all            also keep NAME.svg, NAME.mmd, NAME.report.md (and the PNG)
                   next to the page, such as for an example or a README
  --dark           render the PNG in dark mode
  --root DIR       the folder file sources start from (default: the graph's
                   \`root\`, relative to the graph file, else the current folder)
  --max-edges N    warn above N arrows (default ${DEFAULT_MAX_EDGES})
  --css FILE       theme CSS to put in the SVG (default: assets/theme.css)
  --no-theme       put no CSS in the SVG
  -h, --help       show this help

Writes NAME.html, where NAME is INPUT's name: the graph on a canvas at a readable
size, and a side panel that shows the source of what you click, a legend and the
rules (Pele is inlined; works offline). The report is printed, not written.
Exits 1 when the graph has errors or Pele cannot render it, 2 on bad usage.`;

async function main(argv) {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        all: { type: 'boolean' },
        png: { type: 'boolean' },
        dark: { type: 'boolean' },
        'max-edges': { type: 'string' },
        root: { type: 'string' },
        css: { type: 'string' },
        'no-theme': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    return 2;
  }
  const { values: opt, positionals } = args;
  if (opt.help) { console.log(USAGE); return 0; }
  if (positionals.length !== 1) { console.error(USAGE); return 2; }
  const maxEdges = opt['max-edges'] === undefined ? DEFAULT_MAX_EDGES : Number(opt['max-edges']);
  if (!Number.isInteger(maxEdges) || maxEdges < 1) { console.error('--max-edges must be a whole number above 0.'); return 2; }

  const input = resolve(positionals[0]);
  const ext = extname(input).toLowerCase();
  if (ext !== '.json' && ext !== '.mmd') { console.error(`INPUT must end in .json or .mmd, not ${ext || 'nothing'}.`); return 2; }
  const name = basename(input, extname(input));
  const out = resolve(opt.out ?? dirname(input));
  mkdirSync(out, { recursive: true });
  const css = opt['no-theme'] ? '' : opt.css ? readFileSync(resolve(opt.css), 'utf8') : defaultCss();

  let text;
  try { text = readFileSync(input, 'utf8'); } catch (err) { console.error(`Cannot read ${input}: ${err.message}`); return 1; }

  let mermaid;
  let graph = null;
  let warnings = [];
  let flow = null;
  let sourceCheck = null;
  let root = null;
  if (ext === '.json') {
    try { graph = JSON.parse(text); } catch (err) { console.error(`${input} is not valid JSON: ${err.message}`); return 1; }
    const checked = validate(graph, { maxEdges });
    if (!checked.errors.length) {
      root = opt.root ? resolve(opt.root) : graph.root ? resolve(dirname(input), graph.root) : process.cwd();
      sourceCheck = checkSources(graph, root);
      checked.errors.push(...sourceCheck.errors);
    }
    if (checked.errors.length) {
      console.error(`The graph has ${checked.errors.length} error(s):\n${checked.errors.map((e) => `  - ${e}`).join('\n')}`);
      return 1;
    }
    flow = checkFlow(graph);
    warnings = [...checked.warnings, ...sourceCheck.warnings, ...flow.warnings];
    mermaid = toMermaid(graph, { breaks: flow.breaks }).mermaid;
    if (opt.all) writeFileSync(join(out, `${name}.mmd`), mermaid);
  } else {
    mermaid = text;
  }

  let result;
  try {
    result = renderMermaid(mermaid, { css });
  } catch (err) {
    console.error(describeError(err));
    if (err instanceof PeleError && graph) console.error('\nThe graph passed its checks, so this is a flowmap bug. Please report it with the graph.');
    return 1;
  }
  if (!graph && result.type === 'flowchart' && result.edges > maxEdges) {
    warnings.push(`${result.edges} arrows is more than ${maxEdges}, so the graph is hard to read.`);
  }
  const ratio = result.width / result.height;
  if (ratio > MAX_RATIO || 1 / ratio > MAX_RATIO) {
    const [long, short] = ratio > 1 ? ['wide', 'tall'] : ['tall', 'wide'];
    warnings.push(`The drawing is ${Math.round(Math.max(ratio, 1 / ratio) * 10) / 10} times as ${long} as it is ${short} (${result.width} × ${result.height} px), so a picture of it shows small labels. Try the other direction, or group boxes into rows.`);
  }

  const files = [];
  const counts = [plural(result.nodes, 'box', 'boxes'), plural(result.edges, 'arrow', 'arrows')];
  writeFileSync(join(out, `${name}.html`), buildHtml({ title: graph?.title ?? name, mermaid, svg: result.svg, css, graph, counts: counts.join(', '), flow }));
  files.push(join(out, `${name}.html`));
  if (opt.all) {
    if (graph) files.push(join(out, `${name}.mmd`));
    writeFileSync(join(out, `${name}.svg`), result.svg);
    files.push(join(out, `${name}.svg`));
  }
  if (opt.png) {
    // The PNG is for looking at the layout, so it goes to a temp folder unless every file is kept.
    const pngDir = opt.all ? out : join(tmpdir(), 'flowmap');
    mkdirSync(pngDir, { recursive: true });
    const png = join(pngDir, `${name}.png`);
    try {
      await svgToPng(result.svg, png, { dark: opt.dark, width: result.width, height: result.height });
      files.push(png);
    } catch (err) {
      warnings.push(`No PNG: ${err.message}`);
    }
  }
  if (opt.all) files.push(join(out, `${name}.report.md`));
  const report = buildReport({ name, graph: graph && { ...graph, input }, result, warnings, files: files.map((f) => (dirname(f) === out ? basename(f) : f)), flow, sourceCheck, root });
  if (opt.all) writeFileSync(join(out, `${name}.report.md`), report);

  console.log(report);
  console.log(`Wrote ${files.join('\n      ')}`);
  return 0;
}

function buildReport({ name, graph, result, warnings, files, flow, sourceCheck, root }) {
  const lines = [`# ${graph?.title ?? name}`, ''];
  const counts = [`${result.type}`, plural(result.nodes, 'box', 'boxes'), plural(result.edges, 'arrow', 'arrows')];
  if (graph) counts.push(plural(Object.keys(graph.groups ?? {}).length, 'group', 'groups'));
  lines.push(`Rendered with Pele ${peleVersion()}: ${counts.join(', ')}. ${result.width} × ${result.height} px.`, '');

  lines.push('## Warnings', '');
  lines.push(...(warnings.length ? warnings.map((w) => `- ${w}`) : ['None.']), '');

  if (flow?.rules.length) {
    lines.push('## Rules', '');
    for (const r of flow.rules) {
      const tag = r.ok ? '✓' : r.vacuous ? '? **Cannot check:**' : r.uncertain ? '✗ **May break:**' : '✗ **Broken:**';
      lines.push(`- ${tag} ${r.says}. ${r.detail}`);
    }
    lines.push('');
  }

  if (graph) {
    const out = leftOut(graph);
    lines.push('## Leaves out', '');
    lines.push(...(out.length ? out.map((t) => `- ${t}`) : ['The graph does not say. Add `leavesOut`.']), '');
  }

  if (sourceCheck) {
    lines.push('## Source checks', '');
    // Show `root` the short way: relative to the graph when that is shorter, such as `../..`, else in full,
    // so a graph in a temp folder does not print a long climb of `../` to the repo.
    const rel = relative(dirname(graph.input), root) || '.';
    const shown = rel.length < root.length ? `\`${rel}\` (from the graph's folder)` : `\`${root}\``;
    const { checked, compared, warnings: sourceWarnings } = sourceCheck;
    lines.push(`${plural(checked, 'file source was', 'file sources were')} checked against the files under ${shown}. Each file is there, and each cited line is in the file.`);
    if (compared) lines.push(`${plural(compared, 'cited line was compared with the words of its claim', 'cited lines were compared with the words of their claims')}.`);
    lines.push(sourceWarnings.length
      ? `${plural(sourceWarnings.length, 'warning above is', 'warnings above are')} about sources.`
      : 'No source warnings.');
    if (sourceCheck.otherScript.length) {
      lines.push('', `Line checked, words not compared, because the claim and the cited line are in different languages: ${sourceCheck.otherScript.map((s) => `${s}`).join('; ')}.`);
    }
    if (sourceCheck.notCheckable.length) {
      lines.push('', `Not checkable (URLs and notes), so the reader has to trust them: ${sourceCheck.notCheckable.map((s) => `\`${s}\``).join(', ')}.`);
    }
    lines.push('');
  }

  if (graph) {
    const todo = assumptions(graph);
    lines.push('## To confirm', '');
    lines.push(todo.length
      ? 'These have no source, so they are drawn dashed. Ask the reader to confirm them, or find a source.'
      : 'Every box and arrow has a source.', '');
    lines.push(...todo.map((t) => `- ${t}`));
    if (todo.length) lines.push('');

    const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
    const rows = [
      ...graph.nodes.filter((n) => sources(n)).map((n) => [`Box "${n.label}"`, sources(n)]),
      ...(graph.edges ?? []).filter((e) => sources(e)).map((e) => [
        `Arrow "${label.get(e.from)}" → "${label.get(e.to)}"${e.label ? ` (${e.label})` : ''}`,
        sources(e),
      ]),
    ];
    if (rows.length) {
      const cell = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push('## Sources', '', '| Claim | Source |', '|---|---|');
      for (const [claim, src] of rows) lines.push(`| ${cell(claim)} | ${src.map(cell).join('; ')} |`);
      lines.push('');
    }
  } else {
    lines.push('## To confirm', '', 'This diagram came from Mermaid text, so its sources were not checked.', '');
  }
  lines.push('## Files', '', ...files.map((f) => `- \`${f}\``), '');
  return lines.join('\n');
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(err?.stack ?? err); process.exitCode = 1; },
);
