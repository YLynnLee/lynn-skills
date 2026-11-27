import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkFlow } from '../scripts/lib/flow.mjs';
import { assumptions, escapeLabel, looksLikeCode, resolveFlows, toMermaid, validate } from '../scripts/lib/graph.mjs';
import { claimsById, legendKeys } from '../scripts/lib/html.mjs';
import { arrowWords, checkSources, mentionsAny, parseSource, stem } from '../scripts/lib/sources.mjs';
import { PeleError, findChrome, renderMermaid, withStyle } from '../scripts/lib/render.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'scripts', 'flowmap.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'flowmap-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

// The files small()'s sources cite, so the source check passes.
writeFileSync(join(scratch, 'a.md'), '# A\nThe first step.\nThe second step.\nThen it goes on.\n');
writeFileSync(join(scratch, 'b.md'), 'Second, again.\n');

const small = () => ({
  title: 'Small',
  direction: 'LR',
  root: '.',
  leavesOut: 'Everything else',
  groups: { a: { label: 'Group A', color: 'teal' } },
  nodes: [
    { id: 'one', label: 'First', group: 'a', source: 'a.md:2' },
    { id: 'two', label: 'Second', source: ['a.md:3', 'b.md'] },
    { id: 'three', label: 'Guess' },
  ],
  edges: [
    { from: 'one', to: 'two', label: 'goes', source: 'a.md:4' },
    { from: 'two', to: 'three', label: 'maybe' },
  ],
});

// Text of each <text> element. Pele wraps long labels into <tspan> lines, so join them with a space.
const texts = (svg) => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)]
  .map((m) => m[1].replace(/<\/tspan><tspan[^>]*>/g, ' ').replace(/<\/?tspan[^>]*>/g, ''));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const write = (name, data) => {
  const path = join(scratch, name);
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data));
  return path;
};

describe('validate', () => {
  test('a good graph has no errors or warnings', () => {
    assert.deepEqual(validate(small()), { errors: [], warnings: [] });
  });

  test('reports broken references and bad values', () => {
    const g = small();
    g.nodes.push({ id: 'one', label: 'Again' });
    g.nodes.push({ id: 'four', label: 'Four', shape: 'blob', color: 'red', group: 'nope', source: [] });
    g.edges.push({ from: 'one', to: 'missing', style: 'dotted' });
    g.direction = 'UP';
    const { errors } = validate(g);
    const all = errors.join('\n');
    for (const bit of ['used twice', 'blob', '"red"', 'group "nope"', '`source`', '"missing" is not a node', 'Dotted arrows', '`direction`']) {
      assert.ok(all.includes(bit), `expected an error mentioning ${bit}:\n${all}`);
    }
  });

  test('finds a group inside itself', () => {
    const g = small();
    g.groups = { x: { parent: 'y' }, y: { parent: 'x' } };
    g.nodes[0].group = 'x';
    assert.ok(validate(g).errors.some((e) => e.includes('inside itself')));
  });

  test('rejects things that are not graphs', () => {
    assert.ok(validate(null).errors.length);
    assert.ok(validate([]).errors.length);
    assert.ok(validate({ nodes: [] }).errors.length);
  });

  test('warns about graphs that are hard to read', () => {
    const g = small();
    g.nodes.push({ id: 'lonely', label: 'Lonely', source: 'x' });
    g.nodes.push({ id: 'dup', label: 'first', source: 'x' });
    g.nodes.push({ id: 'code', label: 'handleCheckout', source: 'x' });
    g.edges.push({ from: 'one', to: 'two', label: 'goes', source: 'x' });
    g.edges.push({ from: 'code', to: 'dup', label: 'send_order', source: 'x' });
    const { errors, warnings } = validate(g, { maxEdges: 3 });
    assert.deepEqual(errors, []);
    const all = warnings.join('\n');
    for (const bit of ['more than 3', '"Lonely" has no arrows', 'labelled "first"', '"handleCheckout" reads as a code name', 'drawn twice', '"send_order"']) {
      assert.ok(all.includes(bit), `expected a warning mentioning ${bit}:\n${all}`);
    }
  });

  test('warns about too many colors and empty groups', () => {
    const g = small();
    const colors = ['blue', 'teal', 'green', 'yellow', 'orange', 'pink', 'purple'];
    g.groups = Object.fromEntries(colors.map((c) => [c, { color: c }]));
    g.nodes[0].group = 'blue';
    const { warnings } = validate(g);
    assert.ok(warnings.some((w) => w.includes('7 colors')));
    assert.ok(warnings.some((w) => w.includes('is empty')));
  });
});

describe('labels', () => {
  test('looksLikeCode', () => {
    for (const t of ['handleClick', 'send_order', 'run()']) assert.ok(looksLikeCode(t), t);
    for (const t of ['Payment service', 'API', 'You press pay', 'Step 2']) assert.ok(!looksLikeCode(t), t);
  });

  test('punctuation survives the round trip through Pele', () => {
    const label = 'Say "hi" #1 <b> (x) [y] {z} | a & b';
    const { svg } = renderMermaid(`flowchart LR\n  a["${escapeLabel(label)}"] -->|"${escapeLabel('| "x"')}"| b["end"]`);
    const shown = texts(svg).map((t) => t.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    assert.ok(shown.includes(label), shown.join('\n'));
    assert.ok(shown.includes('| "x"'), shown.join('\n'));
  });

  test('a newline in a label becomes two lines', () => {
    const { svg } = renderMermaid(`flowchart LR\n  a["${escapeLabel('one\ntwo')}"]`);
    assert.equal((svg.match(/<tspan/g) ?? []).length, 2);
  });

  test('Mermaid syntax hazards in labels survive the round trip through Pele', () => {
    const hazards = ['100%% done', 'foo::bar', 'array[[0]]', 'direction LR here', 'direction TD here', 'literal \\n slash', 'C4Container view', 'end:'];
    for (const label of hazards) {
      const { svg } = renderMermaid(`flowchart LR\n  a["${escapeLabel(label)}"] -->|"${escapeLabel(label)}"| b["ok"]`);
      const shown = texts(svg).map((t) => t.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      assert.equal(shown[0], label, `node label failed for ${label}: ${shown[0]}`);
      assert.equal(shown[1], label, `edge label failed for ${label}: ${shown[1]}`);
    }
    assert.equal(escapeLabel('ctrl\x00char\x85end'), 'ctrlcharend');
  });
});

describe('toMermaid', () => {
  test('renders with Pele, with the right counts and marks', () => {
    const { mermaid } = toMermaid(small());
    assert.match(mermaid, /^---\ntitle: "Small"\n---\nflowchart LR\n/);
    assert.match(mermaid, /n_two -\.->\|"maybe"\| n_three/);
    assert.match(mermaid, /n_one -->\|"goes"\| n_two/);
    assert.match(mermaid, /class n_one teal/);
    assert.match(mermaid, /classDef assumed /);
    assert.match(mermaid, /class n_three assumed/);
    assert.ok(!mermaid.includes('classDef breaks'), 'unused classDefs are omitted');
    const r = renderMermaid(mermaid);
    assert.equal(r.type, 'flowchart');
    assert.equal(r.nodes, 3);
    assert.equal(r.edges, 2);
    assert.match(r.svg, /class="pele-node [^"]*teal/);
    assert.match(r.svg, /class="pele-node [^"]*assumed/);
  });

  test('ids that are Mermaid keywords or clash still work', () => {
    const g = {
      groups: { end: { label: 'End group', parent: 'subgraph' }, subgraph: {} },
      nodes: [
        { id: 'end', label: 'End', group: 'end' },
        { id: 'a b', label: 'Spaced' },
        { id: 'a-b', label: 'Dashed' },
        { id: 'class', label: 'Class' },
      ],
      edges: [{ from: 'end', to: 'a b' }, { from: 'a-b', to: 'class', style: 'thick', source: 's' }],
    };
    assert.deepEqual(validate(g).errors, []);
    const { mermaid, nodeId } = toMermaid(g);
    assert.equal(new Set(nodeId.values()).size, 4);
    const r = renderMermaid(mermaid);
    assert.equal(r.nodes, 4);
    assert.equal(r.edges, 2);
    assert.match(mermaid, /==>/);
  });

  test('nested groups nest, and boxes take the nearest color', () => {
    const g = {
      groups: { outer: { color: 'blue' }, inner: { parent: 'outer' }, own: { parent: 'outer', color: 'pink' } },
      nodes: [
        { id: 'a', label: 'A', group: 'inner', source: 's' },
        { id: 'b', label: 'B', group: 'own', source: 's' },
        { id: 'c', label: 'C', group: 'own', color: 'gray', source: 's' },
      ],
    };
    const { mermaid } = toMermaid(g);
    assert.match(mermaid, /subgraph g_outer[^\n]*\n {4}subgraph g_inner/);
    assert.match(mermaid, /class n_a blue/);
    assert.match(mermaid, /class n_b pink/);
    assert.match(mermaid, /class n_c gray/);
    assert.equal(renderMermaid(mermaid).nodes, 3);
  });

  test('boxes keep the order the graph lists them, and a group goes where its first box is', () => {
    const g = {
      groups: { g1: { label: 'G1' }, g2: { label: 'G2', parent: 'g1' }, empty: {} },
      nodes: [
        { id: 'a', label: 'First', group: 'g1' },
        { id: 'b', label: 'Second' },
        { id: 'c', label: 'Third', group: 'g2' },
        { id: 'd', label: 'Fourth', group: 'g1' },
      ],
    };
    const { mermaid } = toMermaid(g);
    const order = [...mermaid.matchAll(/(n_\w+)\["|subgraph (g_\w+)|^\s*end$/gm)].map((m) => m[1] ?? m[2] ?? 'end');
    assert.deepEqual(order, ['g_g1', 'n_a', 'g_g2', 'n_c', 'end', 'n_d', 'end', 'n_b', 'g_empty', 'end']);
    assert.equal(renderMermaid(mermaid).nodes, 4);
  });

  test('assumptions lists every unsourced claim', () => {
    assert.deepEqual(assumptions(small()), ['Box "Guess"', 'Arrow "Second" → "Guess" (maybe)']);
  });
});

describe('render', () => {
  test('the theme makes a well-formed SVG, even with < and & in the CSS', () => {
    const { svg } = renderMermaid('flowchart LR\n  a --> b', { css: '/* a <style> & b */ .pele { --pele-bg: #fff; }' });
    assert.match(svg, /^<svg [^>]*><style>\/\* a &lt;style> &amp; b \*\//);
    assert.equal(withStyle('<svg>x</svg>', ''), '<svg>x</svg>');
  });

  test('an arrow with no source is dashed in the line color, so only a broken path is orange', () => {
    const css = readFileSync(join(root, 'assets', 'theme.css'), 'utf8');
    assert.match(css, /\.pele-edge:not\(\[style\]\) path\[stroke-dasharray\]:not\(\.pele-marker\) \{ stroke: var\(--pele-line\)/);
    assert.match(css, /\.pele-edge:not\(\[style\]\):has\(path\[stroke-dasharray\]\) \.pele-marker \{ fill: var\(--pele-line\)/);
  });

  test('bad Mermaid throws a PeleError with a line', () => {
    assert.throws(() => renderMermaid('flowchart LR\n  a --> \n  b[oops'), (e) => e instanceof PeleError && e.code === 'syntax' && e.line === 3);
  });
});

describe('command', () => {
  test('a graph writes only the page, and prints the report with what to confirm', () => {
    const out = join(scratch, 'out');
    const r = run(write('small.json', small()), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(out, 'small.html')));
    for (const f of ['small.mmd', 'small.svg', 'small.report.md', 'small.png']) assert.ok(!existsSync(join(out, f)), f);
    const report = r.stdout;
    assert.match(report, /3 boxes, 2 arrows, 1 group\./);
    assert.match(report, /- Box "Guess"/);
    assert.match(report, /\| Box "Second" \| a\.md:3; b\.md \|/);
    assert.match(report, /## Leaves out\n\n- Everything else/);
    assert.match(report, /4 file sources were checked/);
    assert.match(report, /## Warnings\n\nNone\./);
  });

  test('--all also keeps the SVG, the Mermaid and the report next to the page', () => {
    const out = join(scratch, 'all');
    const r = run(write('every.json', small()), '--out', out, '--all');
    assert.equal(r.status, 0, r.stderr);
    for (const f of ['every.html', 'every.mmd', 'every.svg', 'every.report.md']) assert.ok(existsSync(join(out, f)), f);
    assert.match(readFileSync(join(out, 'every.report.md'), 'utf8'), /- `every\.svg`/);
  });

  test('the page is a standalone viewer with Pele, the source and every claim', () => {
    const out = join(scratch, 'html');
    const r = run(write('view.json', small()), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(out, 'view.html'), 'utf8');
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /\/\*! Pele \d+\.\d+\.\d+/, 'Pele is inlined');
    assert.match(html, /pele\.mount\(box, source/);
    assert.match(html, /<svg [^>]*class="pele/, 'the static drawing is there before scripts run');
    const json = (id) => JSON.parse(html.match(new RegExp(`<script type="application/json" id="${id}">(.*?)</script>`, 's'))[1]);
    assert.match(json('fm-source'), /^---\ntitle: "Small"/);
    assert.deepEqual(json('fm-claims'), {
      n_one: { kind: 'box', label: 'First', sources: ['a.md:2'] },
      n_two: { kind: 'box', label: 'Second', sources: ['a.md:3', 'b.md'] },
      n_three: { kind: 'box', label: 'Guess', sources: null },
      L_n_one_n_two_0: { kind: 'arrow', label: 'First → Second (goes)', sources: ['a.md:4'], from: 'n_one', to: 'n_two', via: 'goes' },
      L_n_two_n_three_0: { kind: 'arrow', label: 'Second → Guess (maybe)', sources: null, from: 'n_two', to: 'n_three', via: 'maybe' },
    });
    assert.match(r.stdout, /- `view\.html`/);
    assert.ok(!html.includes('<h2>Sources</h2>'), 'the page has no sources table; the report keeps it');
    assert.match(html, /<h2>To confirm<\/h2>/);
    assert.match(html, /<h2>Leaves out<\/h2>/);
  });

  test('the legend lists only the marks and shapes the graph uses', () => {
    assert.deepEqual(legendKeys(small(), null), ['sourced', 'guess', 'guessLine']);
    const uncertain = small();
    uncertain.rules = [{ says: 'Never the guess', never: 'three' }];
    assert.deepEqual(legendKeys(uncertain, checkFlow(uncertain)), ['sourced', 'guess', 'guessLine', 'mayBreak', 'bugPath']);
    const g = small();
    g.nodes[2].source = 'a.md';
    g.edges[1].source = 'a.md';
    g.edges[0].style = 'thick';
    g.nodes[0].shape = 'stadium';
    g.nodes[1].shape = 'decision';
    g.nodes[2].shape = 'database';
    g.rules = [{ says: 'Never the guess', never: 'three' }];
    assert.deepEqual(legendKeys(g, checkFlow(g)), ['sourced', 'main', 'breaks', 'bugPath', 'decision', 'stadium', 'database']);
  });

  test('claim ids match the data-id Pele gives each box and arrow', () => {
    const g = small();
    g.edges.push({ from: 'one', to: 'two', label: 'again', source: 'x' });
    g.edges.push({ from: 'two', to: 'three', source: 'x' });
    g.edges.push({ from: 'one', to: 'two', label: 'and again', source: 'x' });
    const ids = new Set([...renderMermaid(toMermaid(g).mermaid).svg.matchAll(/class="pele-(?:node|edge)[ "][^>]*data-id="([^"]+)"/g)].map((m) => m[1]));
    assert.deepEqual([...ids].sort(), Object.keys(claimsById(g)).sort());
  });

  test('the page keeps </script> in labels from breaking the page', () => {
    const out = join(scratch, 'html-escape');
    const g = small();
    g.nodes[0].label = 'Ends </script><b>';
    const r = run(write('esc.json', g), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(out, 'esc.html'), 'utf8');
    assert.equal((html.match(/<\/script>/g) ?? []).length, 7, 'only the page\'s own seven scripts close');
  });

  test('a graph with errors exits 1 and writes nothing', () => {
    const out = join(scratch, 'bad');
    const r = run(write('bad.json', { nodes: [{ id: 'a' }] }), '--out', out);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /`label` must be non-empty text/);
    assert.ok(!existsSync(join(out, 'bad.html')));
  });

  test('a source file that is not there exits 1; --root changes where sources start', () => {
    const g = small();
    delete g.root;
    const path = write('rooted.json', g);
    const elsewhere = mkdtempSync(join(tmpdir(), 'flowmap-root-'));
    try {
      const bad = run(path, '--root', elsewhere, '--out', join(scratch, 'rooted'));
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /names a file that is not there/);
      assert.equal(run(path, '--root', scratch, '--out', join(scratch, 'rooted')).status, 0);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  test('a broken rule is reported and marked (red when sourced, orange when a guess), and still renders', () => {
    const guessGraph = small();
    guessGraph.rules = [{ says: 'Nothing reaches the guess', never: 'three' }];
    const out = join(scratch, 'rule');
    const r = run(write('rule.json', guessGraph), '--out', out, '--all');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /✗ \*\*May break:\*\* Nothing reaches the guess\. This path reaches "Guess": "First" → "Second" → "Guess"\./);
    const guessMmd = readFileSync(join(out, 'rule.mmd'), 'utf8');
    assert.match(guessMmd, /classDef mayBreak /);
    assert.match(guessMmd, /classDef bugPath /);
    assert.match(guessMmd, /class n_three mayBreak/);
    assert.match(guessMmd, /class n_one,n_two bugPath/);
    assert.match(guessMmd, /linkStyle 0,1 stroke:#e8730c/);
    // A rule that may break is orange in the page too: its header pill and the Details badge do not say "broken".
    const guessPage = readFileSync(join(out, 'rule.html'), 'utf8');
    assert.match(guessPage, /<span class="pill warn">1 may break<\/span>/);
    assert.doesNotMatch(guessPage, /<span class="pill bad">/);
    assert.match(guessPage, /<span class="badge">1<\/span>/);

    const confirmed = small();
    confirmed.nodes[2].source = 'user said';
    confirmed.edges[1].source = 'user said';
    confirmed.rules = [{ says: 'Nothing reaches the third step', never: 'three' }];
    const out2 = join(scratch, 'rule-confirmed');
    const r2 = run(write('confirmed.json', confirmed), '--out', out2, '--all');
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, /✗ \*\*Broken:\*\* Nothing reaches the third step\. This path reaches "Guess": "First" → "Second" → "Guess"\./);
    const confirmedMmd = readFileSync(join(out2, 'confirmed.mmd'), 'utf8');
    assert.match(confirmedMmd, /classDef breaks /);
    assert.match(confirmedMmd, /class n_three breaks/);
    assert.match(confirmedMmd, /class n_one,n_two bugPath/);
    assert.match(confirmedMmd, /linkStyle 0,1 stroke:#e5484d/);
    const confirmedPage = readFileSync(join(out2, 'confirmed.html'), 'utf8');
    assert.match(confirmedPage, /<span class="pill bad">1 broken<\/span>/);
    assert.match(confirmedPage, /<span class="badge bad">1<\/span>/);
  });

  test('a label with a line break stays on one line in the report, so its bullets hold together', () => {
    const g = small();
    g.nodes[2].label = 'Line one\nLine two';
    g.rules = [{ says: 'Never line two', never: 'three' }];
    const r = run(write('multiline.json', g), '--out', join(scratch, 'multiline'));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /"Line one Line two"/);
    assert.doesNotMatch(r.stdout, /Line one\n/);
  });

  test('invalid JSON exits 1', () => {
    assert.equal(run(write('broken.json', '{')).status, 1);
  });

  test('a .mmd file is rendered, and a Pele error names the line', () => {
    const good = run(write('seq.mmd', 'sequenceDiagram\n  You->>Shop: pay\n'), '--out', join(scratch, 'seq'));
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /sequence, \d+ boxes, 1 arrow\./);
    // Pele gives arrows in other diagram types a second class, such as `pele-edge pele-transition`.
    const state = run(write('state.mmd', 'stateDiagram-v2\n  [*] --> Thin\n  Thin --> Grounded: done\n  Grounded --> [*]\n'), '--out', join(scratch, 'state'));
    assert.equal(state.status, 0, state.stderr);
    assert.match(state.stdout, /state, \d+ boxes, 3 arrows\./);
    assert.match(good.stdout, /sources were not checked/);
    const bad = run(write('bad.mmd', 'flowchart LR\n  a --> \n  b[oops'));
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /syntax error at line 3/);
  });

  test('bad usage exits 2', () => {
    assert.equal(run().status, 2);
    assert.equal(run(write('x.txt', '')).status, 2);
    assert.equal(run(write('y.json', small()), '--max-edges', 'lots').status, 2);
    assert.equal(run('--help').status, 0);
  });
});

describe('new fields', () => {
  test('rules, leavesOut and root are checked', () => {
    const g = small();
    g.leavesOut = [];
    g.root = 3;
    g.rules = [
      { says: 'ok', to: 'three', through: 'two' },
      { to: 'three', through: 'nope' },
      { says: 'two kinds', never: 'one', reaches: 'two' },
      { says: 'through alone', through: 'two' },
      { says: 'to alone', to: 'two', never: 'one' },
    ];
    const all = validate(g).errors.join('\n');
    for (const bit of ['`leavesOut`', '`root`', 'Rule 2: `says`', 'Rule 2: `through` "nope"', 'Rule 3: give exactly one', 'Rule 4: `through` needs `to`', 'Rule 5: `to` is only used']) {
      assert.ok(all.includes(bit), `expected an error mentioning ${bit}:\n${all}`);
    }
    assert.ok(!all.includes('Rule 1'), all);
  });

  test('a graph that does not say what it leaves out gets a warning', () => {
    const g = small();
    delete g.leavesOut;
    assert.ok(validate(g).warnings.some((w) => w.includes('`leavesOut`')));
  });

  test('a busy graph with branches and no flows gets a warning', () => {
    // 13 arrows in a chain, with two decisions: several journeys, none named.
    const busy = (decisions) => {
      const g = small();
      g.nodes = Array.from({ length: 14 }, (_, i) => ({ id: `n${i}`, label: `Box ${i}`, ...(i < decisions ? { shape: 'decision' } : {}) }));
      g.edges = g.nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id, label: 'next' }));
      delete g.groups;
      return g;
    };
    const flowsWarning = (g) => validate(g).warnings.some((w) => w.includes('Add `flows`'));
    assert.ok(flowsWarning(busy(2)));
    assert.ok(!flowsWarning(busy(1)), 'one decision is a single fork, not several journeys');
    const named = busy(2);
    named.flows = [{ label: 'Main path', steps: ['n0', 'n1', 'n2'] }];
    assert.ok(!flowsWarning(named), 'a graph that names its flows is not warned');
    const small12 = busy(2);
    small12.edges.pop();
    assert.ok(!flowsWarning(small12), '12 arrows is not busy yet');
  });

  test('flows are validated, resolved into highlight ids + Solo Mermaid, and rendered in the HTML page', () => {
    const bad = small();
    bad.flows = [
      { label: 'Missing edge', steps: ['one', 'three'] },
      { label: 'Both', steps: ['one', 'two'], nodes: ['one', 'two'] },
      { label: 'Short', steps: ['one'] },
      { label: 'Unknown', nodes: ['one', 'ghost'] },
      { steps: ['one', 'two'] },
    ];
    const errs = validate(bad).errors.join('\n');
    for (const bit of ['no arrow goes from "one" to "three"', 'either `steps`', 'at least two', '"ghost" is not a node', 'Flow 5: `label`']) {
      assert.ok(errs.includes(bit), `expected an error mentioning ${bit}:\n${errs}`);
    }

    const g = small();
    g.flows = [
      { label: 'Happy path', note: 'First two steps', steps: ['one', 'two'] },
      { label: 'Full chain', nodes: ['one', 'two', 'three'] },
    ];
    assert.deepEqual(validate(g), { errors: [], warnings: [] });
    const resolved = resolveFlows(g);
    assert.equal(resolved.length, 2);
    assert.deepEqual(resolved[0].ids, ['n_one', 'n_two', 'L_n_one_n_two_0', 'g_a']);
    assert.deepEqual(resolved[0].stepLabels, ['First', 'Second']);
    assert.equal(renderMermaid(resolved[0].mermaid).nodes, 2);
    assert.equal(renderMermaid(resolved[0].mermaid).edges, 1);

    const out = join(scratch, 'flows-page');
    const r = run(write('flows.json', g), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(out, 'flows.html'), 'utf8');
    assert.match(html, /id="flowbar"/);
    assert.match(html, /data-flow="0"/);
    assert.match(html, /data-fmode="solo"/);
    assert.match(html, /<aside class="rail" id="rail"/, 'flows get the left rail');
    assert.match(html, /data-step="0:1"/, 'a steps flow lists its steps in the rail');
    assert.match(html, /data-box="n_three"/, 'a nodes flow lists its boxes in the rail');
    assert.ok(!html.includes('id="hud"'), 'no floating bottom HUD');
    const embedded = JSON.parse(html.match(/<script type="application\/json" id="fm-flows">(.*?)<\/script>/s)[1]);
    assert.equal(embedded.length, 2);
    assert.equal(embedded[0].label, 'Happy path');
  });
});

describe('sources', () => {
  const check = (g) => checkSources(g, scratch);

  test('parseSource tells files from URLs and notes', () => {
    assert.deepEqual(parseSource('src/a.ts:12-18'), { kind: 'file', text: 'src/a.ts:12-18', path: 'src/a.ts', from: 12, to: 18, anchor: undefined, detail: undefined });
    assert.equal(parseSource('README.md#install').anchor, 'install');
    assert.equal(parseSource('scripts/x.mjs, main()').detail, 'main()');
    assert.equal(parseSource('https://pele.run/api').kind, 'url');
    assert.equal(parseSource('user said').kind, 'note');
    assert.equal(parseSource('SKILL.md, step 2').path, 'SKILL.md');
  });

  test('parseSource reads a Windows drive as part of the path, not as a line number', () => {
    assert.deepEqual(
      parseSource('C:\\repo\\src\\a.ts:12'),
      { kind: 'file', text: 'C:\\repo\\src\\a.ts:12', path: 'C:\\repo\\src\\a.ts', from: 12, to: 12, anchor: undefined, detail: undefined },
    );
    assert.equal(parseSource('D:/repo/docs/x.md#install').path, 'D:/repo/docs/x.md');
    assert.equal(parseSource('D:/repo/docs/x.md#install').anchor, 'install');
  });

  test('a good graph passes, and URLs and notes are listed as not checkable', () => {
    const g = small();
    g.nodes[2].source = ['user said', 'https://example.com'];
    const r = check(g);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.checked, 4);
    assert.deepEqual(r.notCheckable, ['user said', 'https://example.com']);
  });

  test('a missing file, a line past the end and a backwards range are errors', () => {
    const g = small();
    g.nodes[0].source = 'missing.md:1';
    g.nodes[1].source = 'a.md:99';
    g.edges[0].source = 'a.md:4-2';
    const all = check(g).errors.join('\n');
    for (const bit of ['missing.md:1" names a file that is not there', 'a.md:99" points past the end of the file, which has 4 lines', 'runs backwards']) {
      assert.ok(all.includes(bit), `expected an error mentioning ${bit}:\n${all}`);
    }
  });

  test('a cited line that shares no words with the claim is a warning; plurals still match', () => {
    const g = small();
    g.nodes[0].source = 'a.md:3'; // "The second step." for the box "First"
    g.nodes[1].label = 'Seconds';
    assert.deepEqual(check(g).warnings.map((w) => w.slice(0, 40)), ['Box "First": the cited lines (a.md:3) sh']);
  });

  test('the path does not count as words, and words match whole', () => {
    mkdirSync(join(scratch, 'payment'), { recursive: true });
    writeFileSync(join(scratch, 'payment', 'x.ts'), 'unrelated text here\nconst cart = getCart();\nstarted\n');
    const g = {
      nodes: [
        { id: 'p', label: 'Payment check', source: 'payment/x.ts:1' }, // only the folder says "payment"
        { id: 'c', label: 'Cart', source: 'payment/x.ts:2' }, // camelCase is split
        { id: 'a', label: 'Art', source: 'payment/x.ts:3' }, // "art" is not a word in "started"
      ],
    };
    assert.deepEqual(check(g).warnings.map((w) => w.split(':')[0]), ['Box "Payment check"', 'Box "Art"']);
  });

  test('a source outside root is an error', () => {
    const g = small();
    g.nodes[0].source = '../outside.md';
    g.nodes[1].source = join(tmpdir(), 'elsewhere.md');
    const all = check(g).errors.join('\n');
    assert.match(all, /Box "First": source "\.\.\/outside\.md" is outside `root`/);
    assert.match(all, /Box "Second": source "[^"]+elsewhere\.md" is outside `root`/);
  });

  test('a file with no extension is checked when it is there, and is a note when it is not', () => {
    writeFileSync(join(scratch, 'Makefile'), 'all: build\n');
    assert.equal(parseSource('Makefile:1').kind, 'note', 'without a file check, it reads as a note');
    const g = { nodes: [{ id: 'b', label: 'Build', source: 'Makefile:1' }, { id: 'n', label: 'Note', source: 'Dockerfile' }] };
    const r = check(g);
    assert.equal(r.checked, 1);
    assert.deepEqual(r.notCheckable, ['Dockerfile']);
    g.nodes[0].source = 'Makefile:9';
    assert.match(check(g).errors.join('\n'), /points past the end/);
  });

  test('a missing heading or function is a warning', () => {
    const g = small();
    g.nodes[0].source = 'a.md#nope';
    g.nodes[1].source = 'a.md, render()';
    const all = check(g).warnings.join('\n');
    assert.match(all, /names a heading that a\.md does not have/);
    assert.match(all, /names render\(\), which a\.md does not mention/);
    g.nodes[0].source = 'a.md#a';
    assert.ok(!check(g).warnings.join('\n').includes('heading'));
  });

  test('a SKILL.md that hands off to a sibling skill the graph leaves out is a warning', () => {
    const skills = join(scratch, 'skills');
    for (const [name, text] of [['plan', 'Plan it, then run /build or /ship-it.\n'], ['build', 'Build it.\n'], ['ship-it', 'Ship.\n']]) {
      mkdirSync(join(skills, name), { recursive: true });
      writeFileSync(join(skills, name, 'SKILL.md'), text);
    }
    const g = { leavesOut: 'Shipping, done by /ship-it', nodes: [{ id: 'p', label: 'Plan it', source: 'skills/plan/SKILL.md:1' }] };
    assert.deepEqual(check(g).warnings, ['skills/plan/SKILL.md mentions /build, which the graph does not show. Add it, or name it in `leavesOut`.']);
  });
});

describe('flow', () => {
  const graph = (nodes, edges, rules) => ({
    nodes: nodes.map(([id, shape]) => ({ id, label: id.toUpperCase(), shape, source: 's' })),
    edges: edges.map(([from, to, source = 's']) => ({ from, to, ...(source ? { source } : {}) })),
    rules,
  });

  test('a clean flow has no warnings', () => {
    const g = graph([['a', 'stadium'], ['b', 'decision'], ['c'], ['d', 'stadium']], [['a', 'b'], ['b', 'c'], ['b', 'd'], ['c', 'd']]);
    assert.deepEqual(checkFlow(g).warnings, []);
  });

  test('finds boxes nothing reaches, one-way decisions, dead ends and loops with no way out', () => {
    const g = graph(
      [['a', 'stadium'], ['b', 'decision'], ['c'], ['x'], ['y'], ['loop1'], ['loop2'], ['end', 'stadium']],
      [['a', 'b'], ['b', 'c'], ['x', 'y'], ['y', 'x'], ['a', 'loop1'], ['loop1', 'loop2'], ['loop2', 'loop1'], ['a', 'end']],
    );
    const all = checkFlow(g).warnings.join('\n');
    for (const bit of ['Nothing reaches "X", "Y"', '"B" is a decision with one way out', '"C" is a dead end', '"LOOP1", "LOOP2" can loop forever']) {
      assert.ok(all.includes(bit), `expected a warning mentioning ${bit}:\n${all}`);
    }
  });

  test('a loop is found even when no box is a dead end; a stadium in a loop is a way out', () => {
    const loop = graph([['start', 'stadium'], ['b'], ['c'], ['d']], [['start', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'b']]);
    assert.ok(checkFlow(loop).warnings.some((w) => w.startsWith('"B", "C", "D" can loop forever')), checkFlow(loop).warnings.join('\n'));
    const again = graph([['start', 'stadium'], ['b'], ['done', 'stadium']], [['start', 'b'], ['b', 'done'], ['done', 'start']]);
    assert.deepEqual(checkFlow(again).warnings, []);
    const parts = graph([['app'], ['api']], [['app', 'api'], ['api', 'app']]);
    assert.deepEqual(checkFlow(parts).warnings, [], 'a map of parts may loop');
  });

  test('a map of parts with no start or end shape gets no dead-end warnings', () => {
    const g = graph([['app'], ['db', 'database'], ['mail']], [['app', 'db'], ['app', 'mail']]);
    assert.deepEqual(checkFlow(g).warnings, []);
  });

  test('rules: a broken one gives the shortest path and marks it; unsourced steps are named', () => {
    const g = graph(
      [['start', 'stadium'], ['review'], ['build'], ['shortcut'], ['site', 'stadium']],
      [['start', 'review'], ['review', 'build'], ['build', 'site'], ['start', 'shortcut'], ['shortcut', 'site', null]],
      [
        { says: 'Nothing reaches the site without review', to: 'site', through: 'review' },
        { says: 'A build always passes review first', from: 'start', to: 'build', through: 'review' },
        { says: 'Review never leads to the shortcut', from: 'review', never: 'shortcut' },
        { says: 'The build can reach the site', from: 'build', reaches: 'site' },
        { says: 'The site leads back to the start', from: 'site', reaches: 'start' },
      ],
    );
    const { rules, breaks, warnings } = checkFlow(g);
    assert.deepEqual(rules.map((r) => r.ok), [false, true, true, true, false]);
    assert.equal(rules[0].uncertain, true);
    assert.deepEqual(rules[0].path, { nodes: ['start', 'shortcut', 'site'], edges: [3, 4] });
    assert.match(rules[0].detail, /"START" → "SHORTCUT" → "SITE"\. It uses 1 unsourced claim/);
    assert.deepEqual([...breaks.nodes], []);
    assert.deepEqual([...breaks.mayBreak], ['site']);
    assert.deepEqual([...breaks.pathNodes], ['start', 'shortcut']);
    assert.deepEqual([...breaks.edges], []);
    assert.deepEqual([...breaks.maybeEdges], [3, 4]);
    assert.equal(warnings.filter((w) => w.startsWith('Rule broken') || w.startsWith('Rule may break')).length, 2);
    const { mermaid } = toMermaid(g, { breaks });
    assert.match(mermaid, /classDef mayBreak /);
    assert.match(mermaid, /classDef bugPath /);
    assert.match(mermaid, /class n_site mayBreak/);
    assert.match(mermaid, /class n_start,n_shortcut bugPath/);
    assert.match(mermaid, /linkStyle 3,4 stroke:#e8730c/);
    assert.equal(renderMermaid(mermaid).edges, 5);
  });

  test('rules: confirmed breaks take precedence over mayBreak and bugPath', () => {
    const g = graph(
      [['start', 'stadium'], ['mid'], ['end', 'stadium']],
      [['start', 'mid'], ['mid', 'end', null]],
      [
        { says: 'Never mid', never: 'mid' },
        { says: 'Never end', never: 'end' },
      ],
    );
    const { rules, breaks } = checkFlow(g);
    assert.equal(rules[0].uncertain, false);
    assert.equal(rules[1].uncertain, true);
    assert.deepEqual([...breaks.nodes], ['mid']);
    assert.deepEqual([...breaks.mayBreak], ['end']);
    assert.deepEqual([...breaks.pathNodes], ['start']);
    assert.deepEqual([...breaks.edges], [0]);
    assert.deepEqual([...breaks.maybeEdges], [1]);
    const { mermaid } = toMermaid(g, { breaks });
    assert.match(mermaid, /class n_mid breaks/);
    assert.match(mermaid, /class n_end mayBreak/);
    assert.match(mermaid, /class n_start bugPath/);
    assert.match(mermaid, /linkStyle 0 stroke:#e5484d/);
    assert.match(mermaid, /linkStyle 1 stroke:#e8730c/);
    assert.equal(renderMermaid(mermaid).edges, 2);
  });
});

describe('word check', () => {
  const check = (g) => checkSources(g, scratch);
  writeFileSync(join(scratch, 'words.md'), [
    'We use the cart here.', // 1
    'This is not it.', // 2
    'It packs the boxes and files.', // 3
    'The payment service is here.', // 4
    'Payment service', // 5
    'Card check', // 6
    'webflow page export', // 7
    '결제를 처리합니다.', // 8
  ].join('\n'));

  test('stems: "uses" meets "use", "boxes" meets "box", and "notes" does not meet "not"', () => {
    assert.equal(stem('uses'), 'use');
    assert.equal(stem('boxes'), 'box');
    assert.equal(stem('files'), 'file');
    assert.equal(stem('notes'), 'note');
    assert.equal(stem('class'), 'class');
    assert.ok(mentionsAny(['uses'], 'We use the cart here.'));
    assert.ok(mentionsAny(['box'], 'It packs the boxes and files.'));
    assert.ok(!mentionsAny(['notes'], 'This is not it.'));
  });

  test('an arrow is checked against its own label, not the boxes it joins', () => {
    const g = {
      nodes: [{ id: 'pay', label: 'Payment service', source: 'words.md:5' }, { id: 'card', label: 'Card check', source: 'words.md:6' }],
      edges: [{ from: 'pay', to: 'card', label: 'deletes the database', source: 'words.md:4' }],
    };
    assert.match(check(g).warnings.join('\n'), /Arrow "Payment service" → "Card check" \(deletes the database\): the cited lines/);
  });

  test('an arrow labelled only with a branch word is checked against its boxes', () => {
    const g = {
      nodes: [{ id: 'pay', label: 'Payment service', source: 'words.md:5' }, { id: 'card', label: 'Card check', source: 'words.md:6' }],
      edges: [{ from: 'card', to: 'pay', label: 'yes', source: 'words.md:4' }, { from: 'pay', to: 'card', label: 'no', source: 'words.md:6' }],
    };
    assert.deepEqual(check(g).warnings, []);
    assert.deepEqual(arrowWords('yes: fix them', 'A', 'B'), ['fix']);
  });

  test('a claim with only whole-file sources is a warning; a line, heading or name() anchors it', () => {
    const loose = { nodes: [{ id: 'a', label: 'Cart', source: ['words.md', 'words.md, the cart part'] }] };
    assert.match(check(loose).warnings.join('\n'), /"words\.md", "words\.md, the cart part" name files but no line, #heading or name\(\)/);
    for (const source of [['words.md', 'words.md:1'], 'a.md#a', 'b.md, second()']) {
      const ok = { nodes: [{ id: 'a', label: 'Cart', source }] };
      assert.ok(!check(ok).warnings.join('\n').includes('no line, #heading'), String(source));
    }
  });

  test('line 0 says lines start at 1', () => {
    const g = { nodes: [{ id: 'a', label: 'Cart', source: 'words.md:0' }] };
    assert.match(check(g).errors.join('\n'), /cites line 0, but lines start at 1/);
  });

  test('a path with spaces is a file when it is there, and a note when it is not', () => {
    writeFileSync(join(scratch, 'my notes.md'), 'The cart.\n');
    const g = { nodes: [{ id: 'a', label: 'Cart', source: 'my notes.md:1' }, { id: 'b', label: 'Other', source: 'chat.log said so' }] };
    const r = check(g);
    assert.deepEqual([r.errors, r.warnings, r.checked, r.notCheckable], [[], [], 1, ['chat.log said so']]);
  });

  test('a Korean label citing an English line is not word-checked, and the check says so', () => {
    const g = {
      nodes: [
        { id: 'k', label: '결제 서비스', source: 'words.md:4' }, // Korean label, English line
        { id: 'm', label: 'Webflow 페이지', source: 'words.md:7' }, // mixed: compared on "webflow"
        { id: 'p', label: '결제', source: 'words.md:8' }, // Korean line, with a particle: 결제를
      ],
    };
    const r = check(g);
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(r.otherScript, ['Box "결제 서비스": words.md:4']);
    assert.equal(r.compared, 2);
    g.nodes[1].source = 'words.md:1';
    assert.match(check(g).warnings.join('\n'), /Box "Webflow 페이지": the cited lines/);
  });
});

describe('rules that say nothing', () => {
  const graph = (nodes, edges, rules) => ({
    nodes: nodes.map(([id, shape]) => ({ id, label: id.toUpperCase(), shape, source: 's' })),
    edges: edges.map(([from, to]) => ({ from, to, source: 's' })),
    rules,
  });

  test('a through rule whose box nothing reaches cannot be checked, rather than holding or breaking', () => {
    const fed = graph([['start', 'stadium'], ['check'], ['other'], ['receipt', 'stadium']], [['start', 'check'], ['other', 'receipt']],
      [{ says: 'Receipt only after check', from: 'start', to: 'receipt', through: 'check' }]);
    const orphan = graph([['start', 'stadium'], ['check'], ['receipt', 'stadium']], [['start', 'check']],
      [{ says: 'Receipt only after check', to: 'receipt', through: 'check' }]);
    for (const g of [fed, orphan]) {
      const { rules, breaks, warnings } = checkFlow(g);
      assert.equal(rules[0].ok, false);
      assert.equal(rules[0].vacuous, true);
      assert.match(rules[0].detail, /No path from .* reaches "RECEIPT", so the rule says nothing/);
      assert.equal(breaks.nodes.size, 0);
      assert.ok(warnings.some((w) => w.startsWith('Rule cannot be checked')));
    }
  });

  test('a through rule whose box and through box are the same cannot be checked, since every path passes it', () => {
    const g = graph([['start', 'stadium'], ['check'], ['receipt', 'stadium']], [['start', 'check'], ['check', 'receipt']],
      [{ says: 'Receipt only after receipt', to: 'receipt', through: 'receipt' }]);
    const { rules, warnings } = checkFlow(g);
    assert.equal(rules[0].ok, false);
    assert.equal(rules[0].vacuous, true);
    assert.match(rules[0].detail, /the same box/);
    assert.ok(warnings.some((w) => w.startsWith('Rule cannot be checked')));
  });

  test('a graph with no arrows still checks its rules and decisions', () => {
    const g = graph([['a', 'decision'], ['b']], [], [{ says: 'A reaches B', from: 'a', reaches: 'b' }]);
    const { rules, warnings } = checkFlow(g);
    assert.deepEqual(rules.map((r) => r.ok), [false]);
    assert.ok(warnings.some((w) => w.includes('"A" is a decision with no way out')), warnings.join('\n'));
  });
});

describe('report and page', () => {
  test('the report says how many source warnings there are, and which lines were not word-checked', () => {
    const g = small();
    g.nodes[0].source = 'a.md:3'; // "The second step." for "First"
    g.nodes[2].label = '추측';
    g.nodes[2].source = 'a.md:2';
    const out = join(scratch, 'summary');
    const r = run(write('summary.json', g), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const report = r.stdout;
    assert.match(report, /5 file sources were checked/);
    assert.match(report, /3 cited lines were compared with the words of their claims\./);
    assert.match(report, /1 warning above is about sources\./);
    assert.ok(!report.includes('shares a word with its claim'), 'no blanket claim');
    assert.match(report, /Line checked, words not compared, [^:]+: Box "추측": a\.md:2\./);
    const clean = run(write('clean.json', small()), '--out', out);
    assert.match(clean.stdout, /No source warnings\./);
  });

  test('a rule that cannot be checked is marked ? in the report and the page', () => {
    const g = small();
    g.nodes.push({ id: 'four', label: 'Fourth', source: 'a.md:4' });
    g.edges.push({ from: 'four', to: 'one', label: 'goes', source: 'a.md:4' });
    g.rules = [{ says: 'Guess only after first', from: 'two', to: 'one', through: 'three' }];
    const out = join(scratch, 'vacuous');
    const r = run(write('vacuous.json', g), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /- \? \*\*Cannot check:\*\* Guess only after first\./);
    assert.match(readFileSync(join(out, 'vacuous.html'), 'utf8'), /<span class="mark" aria-hidden="true">\?<\/span>/);
  });

  test('a very wide drawing is a warning', () => {
    const ids = 'abcdefghijkl'.split('');
    const g = {
      direction: 'LR', leavesOut: 'x',
      nodes: ids.map((id) => ({ id, label: `Step ${id}`, source: 'user said' })),
      edges: ids.slice(1).map((id, i) => ({ from: ids[i], to: id, source: 'user said' })),
    };
    const r = run(write('wide.json', g), '--out', join(scratch, 'wide'));
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /The drawing is [\d.]+ times as wide as it is tall/);
  });

  test('the page for a .mmd file has no click prompt, and lit arrowheads are filled, not outlined', () => {
    const out = join(scratch, 'mmd-page');
    const r = run(write('page.mmd', 'flowchart LR\n  a --> b\n'), '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(out, 'page.html'), 'utf8');
    assert.match(html, /came from Mermaid text, so it has no sources to show/);
    assert.ok(!html.includes('.pele .pele-node, .pele .pele-edge { cursor: pointer; }'));
    assert.match(html, /\.pele-edge\.fm-on path:not\(\.pele-marker\)/);
    assert.match(html, /const reveal = /);
  });

  test('--png writes a PNG to a temp folder, with Playwright or Chrome', { skip: !findChrome() && 'no Chrome or Chromium here' }, () => {
    const out = join(scratch, 'png');
    const name = `pic-${process.pid}`;
    const r = run(write(`${name}.json`, small()), '--out', out, '--png');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(out, `${name}.png`)), 'not next to the page');
    const path = join(tmpdir(), 'flowmap', `${name}.png`);
    assert.ok(r.stdout.includes(path), 'the report names where it is');
    const png = readFileSync(path);
    rmSync(path, { force: true });
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.readUInt32BE(16) > 400, 'about 2x wide');
  });
});

// Whole graphs the skill must keep drawing the same way. FLOWMAP_UPDATE=1 npm test rewrites their .mmd.
describe('fixtures', () => {
  const dir = join(root, 'tests', 'fixtures');
  for (const name of readdirSync(dir)) {
    test(`${name} is a clean graph that matches its committed Mermaid`, () => {
      const graph = JSON.parse(readFileSync(join(dir, name, `${name}.json`), 'utf8'));
      assert.deepEqual(validate(graph), { errors: [], warnings: [] });
      // A broken rule is the finding a fixture may show on purpose; anything else is a mistake.
      assert.deepEqual(checkFlow(graph).warnings.filter((w) => !w.startsWith('Rule broken:')), []);
      assert.ok(checkFlow(graph).rules.length, 'each fixture shows a rule');
      // Every fixture cites files inside the skill folder, so its sources are always checked.
      const r = checkSources(graph, resolve(dir, name, graph.root ?? '.'));
      assert.deepEqual([...r.errors, ...r.warnings], []);
      const { mermaid } = toMermaid(graph, { breaks: checkFlow(graph).breaks });
      if (process.env.FLOWMAP_UPDATE) writeFileSync(join(dir, name, `${name}.mmd`), mermaid);
      assert.equal(mermaid, readFileSync(join(dir, name, `${name}.mmd`), 'utf8'), 'run `FLOWMAP_UPDATE=1 npm test` to refresh');
      renderMermaid(mermaid);
    });
  }

  test('checkout finds the planted bug: a timed-out card still gets a receipt, on a fully sourced path', () => {
    const graph = JSON.parse(readFileSync(join(dir, 'checkout', 'checkout.json'), 'utf8'));
    const [rule] = checkFlow(graph).rules;
    assert.equal(rule.ok, false);
    assert.ok(!rule.uncertain, 'every step on the path has a source, so it is drawn red, not orange');
    assert.deepEqual(rule.path.nodes, ['cart', 'pay', 'retry', 'orders', 'receipt']);
    assert.deepEqual(assumptions(graph).length, 1, 'one dashed guess: the retry that charges again');
  });
});
