// Writes a standalone HTML viewer. Pele draws the diagram onto a full-bleed dotted board with its own
// camera (drag or scroll to pan, pinch or ⌘/Ctrl + scroll to zoom, a minimap when it overflows).
// Three zones: a collapsible Flows rail on the left (when the graph has flows) picks a flow, sets
// Highlight or Solo and steps through it; the board in the middle keeps only the view controls (zoom
// and minimap, bottom-right); a sliding resizable right panel shows sources, rules, claims to confirm,
// and what the graph leaves out.
// Pele is inlined, so the page works offline.
import { readFileSync } from 'node:fs';
import { leftOut, resolveFlows, sources, toMermaid } from './graph.mjs';
import { LIMITS, peleVersion } from './render.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// Pele's browser build, inlined so the page works offline.
const peleBundle = () => read('vendor/pele/pele.global.js');
// The page's own layout and behaviour live in assets/, so they read as plain CSS and JS.
const asset = (name) => read(`assets/${name}`);
const viewerCss = () => asset('viewer.css');
const viewerJs = () => asset('viewer.js');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JSON inside <script> must not close the element or open a comment.
// JSON.parse reads U+2028 and U+2029 fine, so only < needs escaping.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

// CSS inside <style> must not close the element.
const styleText = (css) => css.replace(/<\/(style)/gi, '<\\/$1');

// The first view never shrinks the drawing below this share of Pele's natural size, so 16px labels stay
// about 13px. A bigger graph opens at this size from the top, with a minimap; "Fit" shows all of it.
const READABLE_SCALE = 0.8;

const CLICK_HINT = 'Click any box or arrow to inspect its source.';
const POINTER = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4.2 3.2 13.4 8.3l-4 1.1-1.8 4z"/></svg>';
const ICON_EYE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.5-4.2 6.5-4.2S14.5 8 14.5 8s-2.5 4.2-6.5 4.2S1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.8"/></svg>';
const ICON_SOLO = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2.2"/><path d="M6 8h4M8 6v4"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1.5"/><path d="M3.5 10.5H3a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 3 1.5h6A1.5 1.5 0 0 1 10.5 3v.5"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.8"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
const ICON_FLOW = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="4" r="1.75"/><circle cx="12" cy="4" r="1.75"/><circle cx="8" cy="12" r="1.75"/><path d="M4 5.8v1.1c0 1.4 1.2 2.1 4 2.1s4-.7 4-2.1V5.8M8 9v1.2"/></svg>';
const ICON_PANEL_OPEN = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.5" width="12.5" height="11" rx="2"/><path d="M9.75 2.5v11"/></svg>';
const ICON_FIT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V3.8c0-.7.6-1.3 1.3-1.3H6M10 2.5h2.2c.7 0 1.3.6 1.3 1.3V6M13.5 10v2.2c0 .7-.6 1.3-1.3 1.3H10M6 13.5H3.8c-.7 0-1.3-.6-1.3-1.3V10"/></svg>';
const ICON_PANEL_LEFT = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.5" width="12.5" height="11" rx="2"/><path d="M6.25 2.5v11M11 6.2 9 8l2 1.8"/></svg>';
const ICON_PANEL_CLOSE ='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="2.5" width="12.5" height="11" rx="2"/><path d="M9.75 2.5v11M5 6.2 7 8 5 9.8"/></svg>';

/**
 * Claims keyed by the ids Pele puts in data-id: n_x for boxes, L_from_to_i for arrows.
 * Arrows also carry `from` and `to` (box ids) and `via` (the arrow's own label, or null).
 * @returns {Record<string, { kind: 'box' | 'arrow', label: string, sources: string[] | null, from?: string, to?: string, via?: string | null }>}
 */
export function claimsById(graph) {
  const { nodeId, edgeId } = toMermaid(graph);
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const claims = {};
  for (const n of graph.nodes) {
    claims[nodeId.get(n.id)] = { kind: 'box', label: n.label, sources: sources(n) };
  }
  (graph.edges ?? []).forEach((e, i) => {
    const text = `${label.get(e.from)} → ${label.get(e.to)}${e.label ? ` (${e.label})` : ''}`;
    claims[edgeId[i]] = { kind: 'arrow', label: text, sources: sources(e), from: nodeId.get(e.from), to: nodeId.get(e.to), via: e.label ?? null };
  });
  return claims;
}

const KEYS = {
  sourced: ['<rect class="k-box" x="1.5" y="1.5" width="27" height="15" rx="4"/>', 30, 18, 'Sourced'],
  guess: ['<rect class="k-guess" x="1.5" y="1.5" width="27" height="15" rx="4"/>', 30, 18, 'Guess: confirm it'],
  main: ['<line class="k-main" x1="1" y1="5" x2="29" y2="5"/>', 30, 10, 'Main path'],
  guessLine: ['<line class="k-guess-line" x1="1" y1="5" x2="29" y2="5"/>', 30, 10, 'Step with no source'],
  breaks: ['<rect class="k-break-box" x="1.5" y="1.5" width="27" height="15" rx="4"/>', 30, 18, 'Breaks a rule'],
  mayBreak: ['<rect class="k-maybe-box" x="1.5" y="1.5" width="27" height="15" rx="4"/>', 30, 18, 'May break (uses guess)'],
  bugPath: ['<rect class="k-path-box" x="1.5" y="1.5" width="27" height="15" rx="4"/>', 30, 18, 'Path to a break'],
  decision: ['<polygon class="k-shape" points="11,1.5 20.5,9 11,16.5 1.5,9"/>', 22, 18, 'Decision'],
  stadium: ['<rect class="k-shape" x="1.5" y="1.5" width="27" height="15" rx="7.5"/>', 30, 18, 'Start or end'],
  database: ['<path class="k-shape" d="M2 5c0-4.5 18-4.5 18 0v10c0 4.5-18 4.5-18 0z M2 5c0 4.5 18 4.5 18 0"/>', 22, 20, 'Stored data'],
};

/** The legend keys this graph needs: only the marks and shapes it uses. */
export function legendKeys(graph, flow) {
  const edges = graph.edges ?? [];
  const shapes = new Set(graph.nodes.map((n) => n.shape));
  return [
    graph.nodes.some((n) => sources(n)) && 'sourced',
    graph.nodes.some((n) => !sources(n)) && 'guess',
    edges.some((e) => e.style === 'thick' && sources(e)) && 'main',
    edges.some((e) => !sources(e)) && 'guessLine',
    (flow?.breaks?.nodes?.size ?? 0) + (flow?.breaks?.edges?.size ?? 0) > 0 && 'breaks',
    (flow?.breaks?.mayBreak?.size ?? 0) + (flow?.breaks?.maybeEdges?.size ?? 0) > 0 && 'mayBreak',
    (flow?.breaks?.pathNodes?.size ?? 0) > 0 && 'bugPath',
    shapes.has('decision') && 'decision',
    shapes.has('stadium') && 'stadium',
    shapes.has('database') && 'database',
  ].filter(Boolean);
}

/**
 * The viewer page. `svg` is the pre-rendered diagram, shown until Pele mounts (and if scripts are off).
 * `flow` is checkFlow()'s result, when the input was a graph.
 */
export function buildHtml({ title, mermaid, svg, css, graph, counts, flow }) {
  const claims = graph ? claimsById(graph) : {};
  const ids = graph ? toMermaid(graph) : null;
  const flows = graph ? resolveFlows(graph, { breaks: flow?.breaks }) : [];
  const unsourced = Object.entries(claims).filter(([, c]) => !c.sources);

  const legend = graph
    ? `<div class="legend" role="list" aria-label="How to read this graph">${legendKeys(graph, flow).map((k) => {
      const [mark, w, h, text] = KEYS[k];
      return `<span class="key" role="listitem"><svg width="${w}" height="${h}" aria-hidden="true">${mark}</svg>${text}</span>`;
    }).join('')}</div>`
    : '';

  const rules = (flow?.rules ?? []).map((r) => ({
    says: r.says, ok: r.ok, vacuous: Boolean(r.vacuous), uncertain: Boolean(r.uncertain), detail: r.detail,
    ids: r.path ? [...r.path.nodes.map((id) => ids.nodeId.get(id)), ...r.path.edges.map((i) => ids.edgeId[i])] : [],
  }));
  const section = (id, heading, count, body, open = true, status = '') =>
    `<details class="sec" id="${id}"${open ? ' open' : ''}><summary><h2>${heading}</h2>${count === null ? '' : `<span class="count">${count}</span>`}${status}<svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg></summary><div class="sec-body">${body}</div></details>`;

  // The Flows rail has two views. The index lists each flow as a scenario card (what it is, where it
  // starts and ends); hovering one previews it on the board. Opening one shows that flow alone: a header
  // to go back or to the next flow, Highlight / Solo, a timeline of its steps with what happens on each
  // arrow, and the step controls pinned at the bottom.
  const flowMeta = (f) => (f.kind === 'steps' ? `${f.stepLabels.length} steps` : `${f.nodeCount} boxes`);
  const shapeOf = new Map((graph?.nodes ?? []).map((n) => [ids.nodeId.get(n.id), n.shape ?? 'box']));
  const edgeLabelOf = new Map((graph?.edges ?? []).map((e, i) => [ids.edgeId[i], e.label ?? '']));
  const boxIdsOf = (f) => f.ids.filter((id) => claims[id]?.kind === 'box');
  const ends = (f) => {
    // Only a walk of steps has a start and an end; a set of boxes does not.
    return f.kind === 'steps' && f.stepLabels.length > 1 ? [f.stepLabels[0], f.stepLabels.at(-1)] : null;
  };
  const chevL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5"/></svg>';
  const chevR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
  const modeSwitch = `<div class="fmode" role="group" aria-label="How to show the flow"><button type="button" data-fmode="highlight" aria-pressed="true" title="Dim the rest of the graph (S)">${ICON_EYE}<span>Highlight</span></button><button type="button" data-fmode="solo" aria-pressed="false" title="Show only this flow (S)">${ICON_SOLO}<span>Solo</span></button></div>`;
  const flowCard = (f, i) => {
    const e = ends(f);
    return `<li><button type="button" class="fcard" data-flow="${i}" aria-pressed="false"><kbd class="fkey">${i < 9 ? i + 1 : '·'}</kbd><span class="fc-body"><span class="fc-top"><span class="fc-name">${esc(f.label)}</span><span class="fc-meta">${flowMeta(f)}</span></span>${f.note ? `<span class="fc-note">${esc(f.note)}</span>` : ''}${e ? `<span class="fc-ends"><span class="sr">From </span>${esc(e[0])}<span aria-hidden="true"> → </span><span class="sr"> to </span>${esc(e[1])}</span>` : ''}</span></button></li>`;
  };
  const flowView = (f, i) => {
    const head = `<header class="fv-head"><div class="fv-bar"><button type="button" class="fv-back" data-flow="" title="Back to all flows (Esc)">${chevL}<span>All flows</span></button><span class="fv-switch"><button type="button" class="icon-btn" data-flow-step="-1" title="Previous flow">${chevL}<span class="sr">Previous flow</span></button><span class="fv-of">${i + 1} / ${flows.length}</span><button type="button" class="icon-btn" data-flow-step="1" title="Next flow">${chevR}<span class="sr">Next flow</span></button></span></div><h2 class="fv-title" tabindex="-1"><kbd class="fkey on">${i < 9 ? i + 1 : '·'}</kbd><span>${esc(f.label)}</span></h2>${f.note ? `<p class="fv-note">${esc(f.note)}</p>` : ''}${modeSwitch}</header>`;
    if (f.kind === 'steps' && f.stepLabels.length) {
      const steps = f.stepLabels.map((label, s) => {
        const via = s < f.stepLabels.length - 1 ? edgeLabelOf.get(f.stepEdgeIds[s]) : '';
        const shape = shapeOf.get(f.stepNodeIds[s]);
        return `<li class="${shape === 'decision' ? 'is-decision' : shape === 'stadium' ? 'is-end' : ''}"><button type="button" data-step="${i}:${s}"><span class="sdot"><span>${s + 1}</span></span><span class="slabel">${esc(label)}</span></button>${via ? `<span class="svia">${esc(via)}</span>` : ''}</li>`;
      }).join('');
      return `<section class="rv rv-flow" data-fv="${i}" hidden>${head}<ol class="fv-steps">${steps}</ol><footer class="fv-foot"><div class="fl-bar" aria-hidden="true"><i data-fill="${i}"></i></div><div class="fv-ctrl"><button type="button" class="step-btn" data-prev="${i}" title="Previous step (←)" disabled>${chevL}<span class="sr">Previous step</span></button><span class="fl-pos" data-pos="${i}">${f.stepLabels.length} steps</span><button type="button" class="step-btn primary" data-next="${i}" title="Next step (→)">${chevR}<span class="sr">Next step</span></button></div></footer></section>`;
    }
    const boxes = boxIdsOf(f);
    return `<section class="rv rv-flow" data-fv="${i}" hidden>${head}<ul class="fv-boxes">${boxes.map((id) => `<li class="${shapeOf.get(id) === 'decision' ? 'is-decision' : ''}"><button type="button" data-box="${esc(id)}"><span class="bdot" aria-hidden="true"></span><span class="slabel">${esc(claims[id].label)}</span></button></li>`).join('')}</ul><footer class="fv-foot"><p class="fv-sum">${f.nodeCount} boxes · ${f.edgeCount} arrows. Click one to see its source.</p></footer></section>`;
  };
  const railHtml = flows.length
    ? `<aside class="rail" id="rail" aria-label="Flows" data-view="index"><div class="rail-inner">
<section class="rv rv-index" id="rv-index"><header class="rail-head"><div class="rail-row"><h2>Flows</h2><span class="count">${flows.length}</span><button type="button" class="icon-btn" id="rail-close" aria-controls="rail" aria-expanded="true" title="Hide flows ([)">${ICON_PANEL_LEFT}<span class="sr">Hide flows</span></button></div><p class="rail-sub">Pick a scenario to trace it on the board. Hover to preview.</p>${flows.length > 7 ? '<input type="search" class="rail-filter" id="rail-filter" placeholder="Filter flows" aria-label="Filter flows">' : ''}</header>
<ul class="rail-list" id="flowbar">${flows.map(flowCard).join('')}</ul><p class="rail-empty" id="rail-empty" hidden>No flow matches.</p>
<footer class="rail-foot"><span class="kb"><kbd>1–${Math.min(9, flows.length)}</kbd>open</span>${flows.some((f) => f.kind === 'steps') ? '<span class="kb"><kbd>← →</kbd>step</span>' : ''}<span class="kb"><kbd>S</kbd>solo</span></footer></section>
${flows.map(flowView).join('\n')}
</div></aside>`
    : '';
  const canvasLeftHtml = flows.length
    ? `<button type="button" class="float-btn" id="rail-open" aria-controls="rail" aria-expanded="true" title="Show flows ([)">${ICON_FLOW}<span class="ro-label" id="ro-label">All flows</span><span class="ro-step" id="ro-step" hidden></span></button>`
    : `<div class="canvas-title" aria-hidden="true"><span class="ct-name">${esc(title)}</span><span class="ct-meta">${esc(counts)}</span></div>`;

  const brokenN = rules.filter((r) => !r.ok && !r.vacuous).length;
  const unknownN = rules.filter((r) => r.vacuous).length;
  const pill = (tone, label) => `<span class="pill ${tone}">${label}</span>`;
  const rulesStatus = brokenN ? pill('bad', `${brokenN} broken`) : unknownN ? pill('warn', `${unknownN} unchecked`) : pill('ok', rules.length === 1 ? 'Holds' : 'All hold');
  const rulesHtml = rules.length
    ? section('sec-rules', 'Rules', rules.length, `<ul class="rules">${rules.map((r, i) => `<li class="${r.ok ? 'ok' : r.vacuous ? 'unknown' : r.uncertain ? 'broken maybe' : 'broken'}"><span class="mark" aria-hidden="true">${r.ok ? '✓' : r.vacuous ? '?' : '✗'}</span><div>${
      r.ids.length ? `<button type="button" data-select="rule:${i}">${esc(r.says)}</button>` : `<strong>${esc(r.says)}</strong>`
    }<p>${r.ok ? '' : `<span class="sr">${r.vacuous ? 'Cannot check.' : r.uncertain ? 'May break.' : 'Broken.'} </span>`}${esc(r.detail)}</p></div></li>`).join('')}</ul>`, true, rulesStatus)
    : '';

  const confirm = graph
    ? (unsourced.length
      ? `<p>These have no source, so they are drawn dashed. Confirm them, or find a source.</p>
<ul class="claims">${unsourced.map(([id, c]) => `<li><button type="button" data-select="${esc(id)}"><span class="kind">${c.kind === 'box' ? 'Box' : 'Arrow'}</span>${esc(c.label)}</button></li>`).join('')}</ul>`
      : '<p class="all-good">Every box and arrow has a source.</p>')
    : '<p>This diagram came from Mermaid text, so its sources were not checked.</p>';
  const confirmHtml = graph && !unsourced.length
    ? `<div class="sec sec-flat" id="sec-confirm"><h2>To confirm</h2><span class="count">0</span>${pill('ok', 'All sourced')}</div>`
    : section('sec-confirm', 'To confirm', graph ? unsourced.length : null, confirm, true, graph ? pill('warn', 'Dashed') : '');

  const out = graph ? leftOut(graph) : [];
  const leavesOutHtml = graph
    ? section('sec-out', 'Leaves out', out.length || null, out.length ? `<ul class="plain">${out.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>The graph does not say.</p>', true)
    : '';

  const shortcutsHtml = `<div class="keys">${[
    flows.length && ['0', 'Whole graph'],
    flows.length && ['1–' + Math.min(9, flows.length), 'Switch flow'],
    flows.some((f) => f.kind === 'steps') && ['← →', 'Step through'],
    flows.length && ['S', 'Highlight / Solo'],
    ['F', 'Fit to screen'],
    ['+ −', 'Zoom'],
    ['↑ ↓', 'Pan'],
    flows.length && ['[', 'Flows rail'],
    ['\\', 'Details panel'],
    ['?', 'This help'],
    ['Esc', 'Clear'],
  ].filter(Boolean).map(([k, desc]) => `<span class="kb"><kbd>${k}</kbd>${desc}</span>`).join('')}</div>`;
  const howHtml = section('sec-how', 'How to read', null, `${legend}${shortcutsHtml}<p class="hint">Drag the board or scroll to pan. Pinch or ⌘/Ctrl + scroll to zoom at the pointer. Double-click empty space to fit.</p><p class="hint">Rendered with Pele ${esc(peleVersion())}.</p>`, false);

  const broken = brokenN;
  const badgeCount = broken || unsourced.length;
  const badge = graph && badgeCount ? `<span class="badge${broken ? ' bad' : ''}">${badgeCount}</span>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${viewerCss()}
${graph ? `.pele .pele-node, .pele .pele-edge { cursor: pointer; }
#diagram .pele .pele-node:hover > :first-child { stroke: var(--accent); stroke-width: 1.75px; }` : ''}
${styleText(css)}
</style>
</head>
<body>
<main${flows.length ? ' class="has-rail"' : ''}>
${railHtml}
<div class="stage">
<div class="canvas-top">
${canvasLeftHtml}
<button type="button" class="float-btn" id="fm-open" aria-controls="panel" aria-expanded="true" title="Show details panel (\\)">${ICON_PANEL_OPEN}<span>Details</span>${badge}</button>
</div>
<div class="stage-body" id="stage-body">
<div id="diagram">${svg}</div>
</div>
<div class="canvas-bottom">
<p class="sr" id="fm-live" aria-live="polite"></p>
<div class="nav-stack">
<div class="minimap off" id="minimap" aria-hidden="true" title="Drag to move around the graph"><div class="mm-art" id="mm-art"><div class="mm-view" id="mm-view"></div></div></div>
<div class="zoom-dock" role="group" aria-label="Canvas controls">
<button type="button" class="zbtn" id="z-out" title="Zoom out (−)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg><span class="sr">Zoom out</span></button>
<button type="button" class="zbtn" id="z-level" title="Zoom to 100%">100%</button>
<button type="button" class="zbtn" id="z-in" title="Zoom in (+)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9"/></svg><span class="sr">Zoom in</span></button>
<span class="zsep" aria-hidden="true"></span>
<button type="button" class="zbtn" id="fm-fit" title="Fit the whole graph (F)">${ICON_FIT}<span class="sr">Fit the whole graph</span></button>
</div>
</div>
</div>
</div>
<aside class="panel" id="panel" aria-label="Details">
<div class="resize" id="fm-resize" role="separator" aria-orientation="vertical" aria-controls="panel" aria-label="Resize the panel" tabindex="0"></div>
<div class="panel-clip">
<div class="panel-inner">
<header class="panel-head">
<div class="head-row"><h1>${esc(title)}</h1><div class="tools"><button type="button" class="icon-btn" id="fm-close" aria-controls="panel" aria-expanded="true" title="Collapse panel (\\)">${ICON_PANEL_CLOSE}<span class="sr">Collapse panel</span></button></div></div>
<p class="meta">${esc(counts.replace(', ', ' · '))}</p>
</header>
<div class="panel-body">
<div class="detail" id="detail" aria-live="polite"><span class="none">${graph ? POINTER + CLICK_HINT : 'This diagram came from Mermaid text, so it has no sources to show.'}</span></div>
${rulesHtml}${confirmHtml}${leavesOutHtml}${howHtml}
</div>
</div>
</div>
</aside>
</main>
<script type="application/json" id="fm-source">${scriptJson(mermaid)}</script>
<script type="application/json" id="fm-claims">${scriptJson(claims)}</script>
<script type="application/json" id="fm-rules">${scriptJson(rules)}</script>
<script type="application/json" id="fm-flows">${scriptJson(flows)}</script>
<script>${peleBundle()}</script>
<script type="application/json" id="fm-config">${scriptJson({ icons: { close: ICON_CLOSE, copy: ICON_COPY, check: ICON_CHECK }, readable: READABLE_SCALE, limits: LIMITS })}</script>
<script>${viewerJs()}</script>
</body>
</html>
`;
}
