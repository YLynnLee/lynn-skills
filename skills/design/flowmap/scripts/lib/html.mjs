// Writes a standalone HTML viewer. Pele draws the diagram onto a full-bleed dotted board with its own
// camera (drag or scroll to pan, pinch or ⌘/Ctrl + scroll to zoom, a minimap when it overflows).
// Three zones: a collapsible Flows rail on the left (when the graph has flows) picks a flow, sets
// Highlight or Solo and steps through it; the board in the middle keeps only the view controls (zoom
// and minimap, bottom-right); a sliding resizable right panel shows sources, rules, claims to confirm,
// and what the graph leaves out.
// Pele is inlined, so the page works offline.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { leftOut, resolveFlows, sources, toMermaid } from './graph.mjs';
import { LIMITS, peleVersion } from './render.mjs';

const require = createRequire(import.meta.url);

const peleBundle = () => readFileSync(require.resolve('pele/global'), 'utf8');

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
:root {
  color-scheme: light dark;
  --canvas: #f5f4f0;
  --dot: #d6d4cc;
  --page-fg: #181816;
  --page-muted: #65645d;
  --page-faint: #8f8d84;
  --card: #ffffff;
  --surface: #f7f6f2;
  --surface-hover: #efeee8;
  --rule: #e6e4dc;
  --rule-strong: #d4d1c7;
  --accent: #2d5ee0;
  --accent-soft: #eaf0fe;
  --accent-border: #c5d7fb;
  --ok: #157a3e;
  --bad: #d93842;
  --guess: #b45a0a;
  --ink: #1a1a18;
  --ink-fg: #ffffff;
  --line: #8b8980;
  --box: #ffffff;
  --box-line: #c9c7be;
  --glass: rgb(255 255 255 / 0.84);
  --glass-solid: rgb(255 255 255 / 0.96);
  --glass-edge: rgb(255 255 255 / 0.92);
  --shadow-sm: 0 1px 2px rgb(24 24 20 / 0.05);
  --shadow-float: 0 1px 2px rgb(24 24 20 / 0.05), 0 8px 24px -4px rgb(24 24 20 / 0.09);
  --shadow-pop: 0 4px 12px rgb(24 24 20 / 0.07), 0 18px 42px -6px rgb(24 24 20 / 0.14);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif;
  --mono: "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #111110;
    --dot: #282824;
    --page-fg: #f1f0eb;
    --page-muted: #9d9c93;
    --page-faint: #6f6e66;
    --card: #181816;
    --surface: #20201d;
    --surface-hover: #292925;
    --rule: #2c2c28;
    --rule-strong: #3c3c36;
    --accent: #6c97ff;
    --accent-soft: rgb(108 151 255 / 0.15);
    --accent-border: rgb(108 151 255 / 0.32);
    --ok: #4ade80;
    --bad: #ff6b70;
    --guess: #f0a43a;
    --ink: #f2f1ec;
    --ink-fg: #141412;
    --line: #77766e;
    --box: #1e1e1c;
    --box-line: #45443e;
    --glass: rgb(24 24 22 / 0.80);
    --glass-solid: rgb(26 26 24 / 0.96);
    --glass-edge: rgb(255 255 255 / 0.06);
    --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.32);
    --shadow-float: 0 2px 6px rgb(0 0 0 / 0.35), 0 10px 28px -4px rgb(0 0 0 / 0.50);
    --shadow-pop: 0 8px 20px rgb(0 0 0 / 0.45), 0 22px 48px -6px rgb(0 0 0 / 0.65);
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; background: var(--canvas); color: var(--page-fg);
  font: 13.5px/1.5 var(--font); overflow: hidden;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
button { font: inherit; color: inherit; }

/* Workspace shell: flows rail on the left (when there are flows), the board in the middle, the
   sliding resizable inspector on the right. Navigate left, look in the middle, inspect right. */
main {
  --side: 384px; --rail: 288px;
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr);
  height: 100vh; height: 100dvh;
}
main.has-rail { grid-template-columns: auto minmax(0, 1fr) auto; }
.stage {
  --stage-h: 100dvh;
  container-type: inline-size;
  position: relative; height: 100%; min-width: 0;
  background-color: var(--canvas);
  background-image: radial-gradient(var(--dot) 1.05px, transparent 1.05px);
  background-size: 20px 20px;
  overflow: hidden;
}

/* Focus rings */
.fcard:focus-visible, .fv-back:focus-visible, .step-btn:focus-visible, .fv-steps button:focus-visible, .fv-boxes button:focus-visible,
.fmode button:focus-visible, .float-btn:focus-visible, .zbtn:focus-visible,
.icon-btn:focus-visible,
.sec summary:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

/* Floating top canvas overlay (no heavy header bar): flow switcher on left, panel reopen button on right. */
.canvas-top {
  position: absolute; top: 14px; left: 14px; right: 14px; z-index: 6;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  pointer-events: none;
}
.canvas-top > * { pointer-events: auto; }

/* The Flows rail: docked on the left. Index of scenario cards, or one flow opened as a timeline. */
.rail {
  position: relative; width: var(--rail); height: 100%; min-width: 0; overflow: hidden;
  background: var(--card); border-right: 1px solid var(--rule);
  transition: width 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}
.rail-inner { width: var(--rail); height: 100%; position: relative; transition: opacity 0.18s ease; }
main.fm-rail-closed .rail { width: 0; border-right-width: 0; }
main.fm-rail-closed .rail-inner { opacity: 0; pointer-events: none; }
.rv { position: absolute; inset: 0; display: flex; flex-direction: column; min-height: 0; }
.rv[hidden] { display: none; }
.rv.enter { animation: rvIn 0.2s cubic-bezier(0.22, 1, 0.36, 1); }
.rv-flow.enter { animation-name: rvInR; }
@keyframes rvIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: none; } }
@keyframes rvInR { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }

/* Index view */
.rail-head { flex: none; padding: 14px 12px 12px 16px; border-bottom: 1px solid var(--rule); display: grid; gap: 6px; }
.rail-row { display: flex; align-items: center; gap: 7px; }
.rail-row h2 { margin: 0; font-size: 13px; font-weight: 650; letter-spacing: -0.005em; }
.rail-row .count { font: 500 12px/1 var(--font); font-variant-numeric: tabular-nums; color: var(--page-faint); }
.rail-row .icon-btn { margin-left: auto; }
.rail-sub { margin: 0; padding-right: 8px; font-size: 12px; line-height: 1.45; color: var(--page-muted); }
.rail-filter {
  margin-top: 6px; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--rule);
  background: var(--surface); color: var(--page-fg); font: 12.5px var(--font); outline: none;
}
.rail-filter:focus { border-color: var(--accent); background: var(--card); }
.rail-list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: 4px 0; display: grid; align-content: start; }
.rail-list li[hidden] { display: none; }
.rail-empty { margin: 0; padding: 4px 18px; font-size: 12px; color: var(--page-faint); }
.rail-empty[hidden] { display: none; }
.rail-list li + li .fcard { border-top: 1px solid var(--rule); }
.fcard {
  all: unset; box-sizing: border-box; width: 100%; cursor: pointer; position: relative;
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 11px; align-items: start;
  padding: 13px 16px 14px;
  transition: background 0.14s ease;
}
/* A thin accent bar on the left marks the row under the pointer, whose flow the board previews. */
.fcard::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2.5px; border-radius: 0 2px 2px 0; background: var(--accent); opacity: 0; transition: opacity 0.14s ease; }
.fcard:hover, .fcard.peek { background: var(--surface); }
.fcard:hover::before, .fcard.peek::before { opacity: 1; }
.fcard:hover .fc-name, .fcard.peek .fc-name { color: var(--accent); }
.fcard:hover .fkey, .fcard.peek .fkey { color: var(--accent); border-color: var(--accent-border); background: var(--accent-soft); }
.fcard:focus-visible { outline-offset: -2px; }
.fc-body { min-width: 0; display: grid; gap: 4px; }
.fc-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.fc-name { font-size: 13px; font-weight: 600; line-height: 1.3; color: var(--page-fg); overflow-wrap: anywhere; }
.fc-meta { flex: none; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--page-faint); }
.fc-note { font-size: 12px; line-height: 1.42; color: var(--page-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fc-ends { margin-top: 1px; font-size: 11.5px; line-height: 1.4; color: var(--page-faint); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fkey {
  display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 6px; border: 1px solid var(--rule); background: var(--surface);
  font: 600 10.5px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--page-muted);
  transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
}
.fkey.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.rail-foot { flex: none; display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 10px 16px 12px; border-top: 1px solid var(--rule); }

/* Flow view */
.fv-head { flex: none; padding: 10px 12px 14px 14px; border-bottom: 1px solid var(--rule); display: grid; gap: 9px; }
.fv-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.fv-back {
  all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 3px;
  height: 28px; padding: 0 8px 0 4px; margin-left: -4px; border-radius: 8px;
  font: 550 12px/1 var(--font); color: var(--page-muted); cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.fv-back:hover { background: var(--surface-hover); color: var(--page-fg); }
.fv-back svg, .fv-switch svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.fv-switch { display: inline-flex; align-items: center; gap: 1px; }
.fv-of { min-width: 34px; text-align: center; font: 600 11px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--page-faint); }
.fv-title { margin: 2px 0 0; display: flex; align-items: flex-start; gap: 9px; font-size: 15px; font-weight: 650; line-height: 1.3; letter-spacing: -0.012em; outline: none; }
.fv-title .fkey { margin-top: 0; flex: none; }
.fv-note { margin: 0; font-size: 12.5px; line-height: 1.48; color: var(--page-muted); }
.fv-steps, .fv-boxes { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: 12px 12px 16px 14px; }
.fv-steps li { position: relative; padding-bottom: 2px; }
/* The spine joins the dots; it stops at the last step. */
.fv-steps li:not(:last-child)::before { content: ""; position: absolute; left: 11px; top: 26px; bottom: -4px; width: 1.5px; background: var(--rule-strong); border-radius: 1px; }
.fv-steps li.done:not(:last-child)::before, .fv-steps li.cur:not(:last-child)::before { background: color-mix(in srgb, var(--accent) 45%, var(--rule-strong)); }
.fv-steps button, .fv-boxes button {
  all: unset; box-sizing: border-box; width: 100%; cursor: pointer; position: relative;
  display: flex; align-items: flex-start; gap: 10px; padding: 2px 4px 2px 0; border-radius: 8px;
  font-size: 12.5px; line-height: 1.38; color: var(--page-muted);
  transition: color 0.12s ease;
}
.fv-steps button:hover, .fv-boxes button:hover { color: var(--page-fg); }
.slabel { flex: 1; min-width: 0; padding: 3px 8px; margin-left: -4px; border-radius: 7px; transition: background 0.12s ease, box-shadow 0.12s ease; }
.fv-steps button:hover .slabel, .fv-boxes button:hover .slabel { background: var(--surface); }
.sdot {
  flex: none; display: inline-grid; place-items: center; width: 23px; height: 23px; border-radius: 50%;
  font: 600 10px/1 var(--mono); font-variant-numeric: tabular-nums;
  color: var(--page-muted); background: var(--card); border: 1.5px solid var(--rule-strong);
  transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
}
.is-decision .sdot { border-radius: 5px; transform: rotate(45deg) scale(0.86); }
.is-decision .sdot > span { transform: rotate(-45deg) scale(1.16); }
.is-end .sdot { border-radius: 8px; width: 27px; margin: 0 -2px; }
.svia { display: block; margin: 1px 0 6px 33px; padding-left: 2px; font-size: 11px; line-height: 1.35; color: var(--page-faint); font-style: italic; }
.fv-steps li.done button { color: var(--page-fg); }
.fv-steps li.done .sdot { color: var(--accent); border-color: var(--accent-border); background: var(--accent-soft); }
.fv-steps li.cur button { color: var(--page-fg); font-weight: 600; }
.fv-steps li.cur .sdot { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 0 0 3.5px var(--accent-soft); }
.fv-steps li.cur .slabel { background: var(--card); box-shadow: 0 0 0 1px var(--accent-border), var(--shadow-sm); }
.fv-boxes { display: grid; align-content: start; gap: 2px; }
.bdot { flex: none; width: 23px; height: 23px; display: inline-grid; place-items: center; }
.bdot::before { content: ""; width: 9px; height: 9px; border-radius: 3px; border: 1.5px solid var(--page-faint); }
.fv-boxes .is-decision .bdot::before { transform: rotate(45deg); border-radius: 2px; }
.fv-boxes button.sel { color: var(--page-fg); font-weight: 600; }
.fv-boxes button.sel .bdot::before { border-color: var(--accent); background: var(--accent); }
.fv-boxes button.sel .slabel { background: var(--card); box-shadow: 0 0 0 1px var(--accent-border), var(--shadow-sm); }
.fv-foot { flex: none; padding: 0 12px 12px; border-top: 1px solid var(--rule); background: var(--card); }
.fv-sum { margin: 12px 2px 0; font-size: 12px; color: var(--page-muted); }
.fl-bar { height: 3px; margin: 0 -12px 11px; background: var(--rule); overflow: hidden; }
.fl-bar > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1); }
.fv-ctrl { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; }
.fl-pos { text-align: center; font: 600 11px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--page-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.fl-pos b { color: var(--accent); }
.step-btn {
  all: unset; box-sizing: border-box; height: 32px; min-width: 32px; padding: 0 9px;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  border-radius: 9px; border: 1px solid var(--rule); background: var(--card);
  font: 600 12.5px/1 var(--font); color: var(--page-fg); cursor: pointer;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.1s ease;
}
.step-btn:hover:not(:disabled) { border-color: var(--rule-strong); background: var(--surface); }
.step-btn:active:not(:disabled) { transform: scale(0.96); }
.step-btn:disabled { opacity: 0.35; cursor: default; }
.step-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.step-btn.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 88%, #000); border-color: transparent; }
.step-btn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }

/* Highlight / Solo: a full-width segmented switch in the flow view's head. */
.fmode {
  display: grid; grid-template-columns: 1fr 1fr; padding: 2px; border-radius: 9px;
  border: 1px solid var(--rule); background: var(--surface);
}
.fmode button {
  all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 26px; padding: 0 8px; border-radius: 7px;
  font: 550 12px/1 var(--font); color: var(--page-muted); cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
}
.fmode button svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
.fmode button:hover { color: var(--page-fg); }
.fmode button[aria-pressed="true"] { background: var(--card); color: var(--page-fg); box-shadow: var(--shadow-sm); }

/* The rail's reopen button on the board keeps the active flow and step in sight. */
#rail-open { display: none; max-width: min(360px, calc(100% - 120px)); }
main.fm-rail-closed #rail-open { display: inline-flex; }
#rail-open .ro-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#rail-open .ro-step { flex: none; font: 600 11px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--accent); background: var(--accent-soft); padding: 3px 6px; border-radius: 6px; }
#rail-open .ro-step[hidden] { display: none; }

/* Subtle title badge on canvas when there are no flows and the right panel is collapsed. */
.canvas-title {
  display: none; align-items: baseline; gap: 8px; max-width: min(420px, calc(100% - 120px));
  padding: 7px 12px; border-radius: 10px;
  background: var(--glass); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--rule); box-shadow: inset 0 1px 0 var(--glass-edge), var(--shadow-float);
}
main.fm-closed .canvas-title { display: inline-flex; }
.ct-name { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ct-meta { flex: none; font-size: 11.5px; color: var(--page-muted); white-space: nowrap; }

/* Floating right-panel reopen button (visible when right column is collapsed). */
.float-btn {
  display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px;
  font: 550 12.5px/1 var(--font); border-radius: 11px; border: 1px solid var(--rule);
  background: var(--glass); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
  color: var(--page-fg); cursor: pointer;
  box-shadow: inset 0 1px 0 var(--glass-edge), var(--shadow-float);
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;
}
.float-btn:hover { background: var(--glass-solid); border-color: var(--rule-strong); }
.float-btn:active { transform: scale(0.975); }
.float-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; color: var(--page-muted); }
.float-btn:hover svg { color: var(--page-fg); }
.float-btn .badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px;
  display: inline-grid; place-items: center; font: 700 10.5px/1 var(--mono); font-variant-numeric: tabular-nums;
  background: var(--guess); color: #fff;
}
.float-btn .badge.bad { background: var(--bad); }
#fm-open { display: none; margin-left: auto; }
main.fm-closed #fm-open { display: inline-flex; }

/* Full-bleed dotted board canvas. Without scripts the drawing scrolls; with them (.fm-cam) it is a
   pan-and-zoom board: the SVG keeps its natural size and a transform places it. */
.stage-body {
  position: relative; width: 100%; height: 100%;
  overflow: hidden;
}
#diagram {
  --pele-font: var(--font); --pele-font-mono: var(--mono);
  height: 100%; padding: 66px 36px 92px;
  display: grid; align-items: start; justify-items: start;
  overflow: auto; overscroll-behavior: contain;
}
#diagram svg { display: block; max-width: 100%; height: auto; margin: auto; }
#diagram.fm-cam {
  position: absolute !important; inset: 0; padding: 0; display: block;
  overflow: hidden; touch-action: none; cursor: grab;
  -webkit-user-select: none; user-select: none;
}
#diagram.fm-cam > svg { position: absolute; left: 0; top: 0; margin: 0; transform-origin: 0 0; }
#diagram.fm-cam.fm-panning, #diagram.fm-cam.fm-panning * { cursor: grabbing !important; }
.pele .pele-title { display: none; }

/* Flow spotlight: dim everything outside the active flow while preserving the full layout. */
:is(#diagram, .mm-art).fm-focus .pele-node:not(.fm-in),
:is(#diagram, .mm-art).fm-focus .pele-edge:not(.fm-in),
:is(#diagram, .mm-art).fm-focus .pele-edge-label:not(.fm-in) { opacity: 0.12; transition: opacity 0.2s ease; }
:is(#diagram, .mm-art).fm-focus .pele-cluster:not(.fm-in) { opacity: 0.2; transition: opacity 0.2s ease; }
.mm-art.fm-focus .pele-edge.fm-in path:not(.pele-marker) { stroke: var(--accent); stroke-width: 9px; }
#diagram.fm-focus .pele-node.fm-in,
#diagram.fm-focus .pele-edge.fm-in,
#diagram.fm-focus .pele-edge-label.fm-in,
#diagram.fm-focus .pele-cluster.fm-in { opacity: 1; transition: opacity 0.2s ease; }
#diagram.fm-focus .pele-edge.fm-in:not([style]) path:not(.pele-marker) { stroke: var(--accent); stroke-width: 2.75px; }
#diagram.fm-focus .pele-edge.fm-in:not([style]) .pele-marker { fill: var(--accent); }
#diagram.fm-focus .pele-edge-label.fm-in rect { stroke: var(--accent); }

/* View controls sit together in the bottom-right corner: the minimap above the zoom dock. */
.canvas-bottom { position: absolute; right: 16px; bottom: 16px; z-index: 5; }


.nav-stack {
  display: flex; flex-direction: column; align-items: stretch; gap: 8px;
}
.minimap {
  position: relative; padding: 6px; border-radius: 11px; cursor: pointer; touch-action: none;
  background: var(--glass); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid var(--rule); box-shadow: inset 0 1px 0 var(--glass-edge), var(--shadow-float);
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.minimap.off { opacity: 0; transform: translateY(4px); pointer-events: none; }
.minimap .mm-art { position: relative; overflow: hidden; border-radius: 6px; margin: 0 auto; }
.minimap .mm-art::before, .minimap .mm-art::after { content: ""; position: absolute; left: 0; right: 0; height: 14px; z-index: 1; pointer-events: none; opacity: 0; transition: opacity 0.15s ease; }
.minimap .mm-art::before { top: 0; background: linear-gradient(var(--glass-solid), transparent); }
.minimap .mm-art::after { bottom: 0; background: linear-gradient(transparent, var(--glass-solid)); }
.minimap.mm-top .mm-art::before, .minimap.mm-bottom .mm-art::after { opacity: 1; }
.minimap .mm-art > svg { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: 0.85; pointer-events: none; }
.minimap .mm-view {
  position: absolute; border-radius: 4px; pointer-events: none;
  border: 1.5px solid var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent);
  box-shadow: 0 0 0 999px color-mix(in srgb, var(--canvas) 55%, transparent);
}
.zoom-dock {
  display: inline-flex; align-items: center; padding: 3px; gap: 2px;
  background: var(--glass); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid var(--rule); border-radius: 11px;
  box-shadow: inset 0 1px 0 var(--glass-edge), var(--shadow-float);
}
.zbtn {
  all: unset; box-sizing: border-box; height: 28px; min-width: 28px; padding: 0 7px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 8px; font: 550 11.5px/1 var(--font); font-variant-numeric: tabular-nums;
  color: var(--page-muted); cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;
}
.zbtn:hover { background: var(--surface); color: var(--page-fg); }
.zbtn:active { transform: scale(0.95); }
.zbtn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
.zbtn:disabled { opacity: 0.35; cursor: default; background: none; }
#z-level { min-width: 48px; color: var(--page-fg); }
.zsep { width: 1px; height: 16px; background: var(--rule); margin: 0 2px; }

@container (max-width: 600px) {
  .minimap { display: none; }
}

/* The sliding inspector panel. Inner wrapper keeps stable width during collapse so text never squishes. */
.panel {
  position: relative; width: var(--side); height: 100%; min-width: 0;
  background: var(--card); border-left: 1px solid var(--rule);
  box-shadow: -1px 0 0 rgb(24 24 20 / 0.02);
  transition: width 0.26s cubic-bezier(0.22, 1, 0.36, 1), border-left-color 0.2s ease;
}
.panel-clip {
  width: 100%; height: 100%; overflow: hidden;
}
.panel-inner {
  width: var(--side); height: 100%;
  display: flex; flex-direction: column; min-width: 0;
  transition: opacity 0.18s ease;
}
main.fm-closed .panel { width: 0; border-left-width: 0; }
main.fm-closed .panel-inner { opacity: 0; pointer-events: none; }
main.fm-closed .resize { pointer-events: none; }
main.fm-dragging, main.fm-dragging * { cursor: col-resize !important; user-select: none; }
main.fm-dragging .panel { transition: none; }

/* Tactile resize seam with subtle hover pill grip */
.resize { position: absolute; z-index: 8; top: 0; bottom: 0; left: -6px; width: 12px; cursor: col-resize; touch-action: none; }
.resize::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 5px; width: 2px;
  background: var(--accent); opacity: 0; transition: opacity 0.15s ease;
}
.resize::before {
  content: ""; position: absolute; top: 50%; left: 3px; width: 6px; height: 34px;
  transform: translateY(-50%); border-radius: 99px;
  background: var(--card); border: 1px solid var(--rule-strong);
  box-shadow: var(--shadow-sm); opacity: 0; transition: opacity 0.16s ease, border-color 0.16s ease;
}
.resize:hover::after, .resize:focus-visible::after, main.fm-dragging .resize::after { opacity: 1; }
.resize:hover::before, .resize:focus-visible::before, main.fm-dragging .resize::before { opacity: 1; border-color: var(--accent); }
.resize:focus-visible { outline: none; }

/* Right panel header */
.panel-head { flex: none; padding: 16px 14px 14px 20px; border-bottom: 1px solid var(--rule); }
.head-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; }
.panel-head h1 {
  margin: 3px 0 0; font-size: 15px; font-weight: 650; line-height: 1.35;
  letter-spacing: -0.015em; text-wrap: balance; color: var(--page-fg);
}
.meta { margin: 4px 0 0; color: var(--page-faint); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.tools { display: flex; gap: 2px; margin-right: -4px; }
.icon-btn {
  all: unset; box-sizing: border-box; width: 28px; height: 28px;
  display: grid; place-items: center; border-radius: 8px;
  color: var(--page-muted); cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;
}
.icon-btn:hover { background: var(--surface-hover); color: var(--page-fg); }
.icon-btn:active { transform: scale(0.94); }
.icon-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }

/* Status pills in section headings say at a glance what each section found. */
.pill {
  display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 99px;
  font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap;
  color: var(--tone); background: color-mix(in srgb, var(--tone) 10%, var(--card));
}
.pill::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.pill.ok { --tone: var(--ok); }
.pill.bad { --tone: var(--bad); }
.pill.warn { --tone: var(--guess); }

/* Right panel scrollable body */
.panel-body {
  flex: 1; overflow-y: auto; overscroll-behavior: contain;
  padding: 14px 18px 40px 20px;
}
.panel-body::-webkit-scrollbar, #diagram::-webkit-scrollbar, .fm-menu-list::-webkit-scrollbar { width: 8px; height: 8px; }
.panel-body::-webkit-scrollbar-thumb, #diagram::-webkit-scrollbar-thumb, .fm-menu-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--page-muted) 26%, transparent);
  border-radius: 99px; border: 2px solid transparent; background-clip: content-box;
}
.panel-body::-webkit-scrollbar-thumb:hover, #diagram::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--page-muted) 44%, transparent); background-clip: content-box;
}
.panel-body::-webkit-scrollbar-track, #diagram::-webkit-scrollbar-track { background: transparent; }

/* Inspector detail card: an icon tile and a status pill say what it is; no colored edge. */
.detail {
  --tone: var(--accent);
  padding: 14px; border-radius: 12px;
  border: 1px solid var(--rule); background: var(--card);
  font-size: 13px;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.detail:not(.on) { display: flex; align-items: center; padding: 11px 12px; background: transparent; border: 1px dashed var(--rule-strong); }
.detail.on { box-shadow: var(--shadow-sm); animation: fmIn 0.18s cubic-bezier(0.22, 1, 0.36, 1); }
.detail.ok { --tone: var(--ok); }
.detail.guess { --tone: var(--guess); }
.detail.bad { --tone: var(--bad); }
@keyframes fmIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.detail .none { color: var(--page-muted); display: flex; gap: 10px; align-items: center; font-size: 12.5px; line-height: 1.45; }
.detail .none svg {
  flex: none; width: 28px; height: 28px; padding: 7px; border-radius: 8px;
  background: var(--surface);
  fill: none; stroke: currentColor; stroke-width: 1.55; stroke-linecap: round; stroke-linejoin: round; color: var(--page-muted);
}
.detail .top { display: flex; align-items: center; gap: 8px; margin: -2px 0 8px; }
.detail .tag { font-size: 12px; font-weight: 600; color: var(--page-muted); }
.pill.guess { --tone: var(--guess); }
.pill.plain { color: var(--page-muted); background: var(--surface); }
.pill.plain::before { display: none; }
.detail .clear { width: 26px; height: 26px; margin: -4px -6px -4px auto; }
.detail strong { display: block; font-size: 15px; font-weight: 650; line-height: 1.35; letter-spacing: -0.012em; text-wrap: pretty; }
.detail p { margin: 6px 0 0; color: var(--page-muted); font-size: 12.5px; line-height: 1.5; }

/* The card's groups: one small heading, then rows of one shape. */
.detail .d-group { margin-top: 16px; }
.detail .d-head { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: var(--page-muted); }
.detail .d-rows { display: grid; gap: 1px; margin: 0 -8px; }
.detail .d-row {
  all: unset; box-sizing: border-box; width: 100%;
  display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 4px 6px 8px;
  border-radius: 8px; font-size: 12.5px; line-height: 1.35; color: var(--page-fg);
  transition: background 0.13s ease;
}
.detail .d-row:hover { background: var(--surface); }
.detail .d-row.go { cursor: pointer; }
.detail .d-row.go:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.detail .r-lead { flex: none; width: 20px; display: grid; place-items: center; }
.detail .r-icon { display: grid; place-items: center; color: var(--page-muted); }
.detail .r-icon svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.detail .r-main { flex: 1; min-width: 0; display: grid; gap: 1px; }
.detail .r-title { overflow-wrap: anywhere; }
.detail .r-sub { font-size: 11.5px; color: var(--page-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail .r-meta { flex: none; font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--page-faint); white-space: nowrap; }
.detail .r-act { flex: none; width: 26px; height: 26px; display: grid; place-items: center; }
.detail .j-chev { width: 14px; height: 14px; fill: none; stroke: var(--page-faint); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.13s ease, stroke 0.13s ease; }
.detail .d-row.go:hover .j-chev { stroke: var(--page-fg); transform: translateX(2px); }
.detail .d-row.cur .r-title { color: var(--accent); font-weight: 600; }
.detail .d-row.cur .fkey { background: var(--accent); border-color: var(--accent); color: #fff; }
.detail .copy {
  all: unset; box-sizing: border-box; width: 26px; height: 26px; display: grid; place-items: center;
  border-radius: 7px; color: var(--page-faint); cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.detail .copy:hover { background: var(--card); color: var(--page-fg); }
.detail .copy:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.detail .copy.done { color: var(--ok); }
.detail .copy svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.detail .d-note { margin: 0; padding: 9px 11px; border-radius: 9px; font-size: 12.5px; line-height: 1.5; color: var(--page-muted); background: var(--surface); }
.detail .d-note.guess { color: var(--guess); background: color-mix(in srgb, var(--guess) 8%, var(--card)); }
.detail .d-note.bad { color: var(--bad); background: color-mix(in srgb, var(--bad) 7%, var(--card)); }

/* Collapsible inspector sections */
.sec { border-top: 1px solid var(--rule); margin-top: 18px; }
.sec + .sec { margin-top: 0; }
.sec summary, .sec-flat {
  list-style: none; display: flex; align-items: center; gap: 8px;
  padding: 12px 8px; margin: 2px -8px; cursor: pointer; border-radius: 8px;
  transition: background 0.14s ease;
}
.sec summary::-webkit-details-marker { display: none; }
.sec.sec-flat { margin: 0; padding: 14px 0; cursor: default; border-radius: 0; }
.sec + .sec.sec-flat { margin-top: 0; }
.sec .pill { margin-left: 2px; }
.sec summary:hover { background: var(--surface); }
.sec h2 { margin: 0; font-size: 13px; font-weight: 600; letter-spacing: -0.005em; color: var(--page-fg); }
.sec .count {
  font: 500 12px/1 var(--font); font-variant-numeric: tabular-nums; color: var(--page-faint);
}
.sec .chev { margin-left: auto; fill: none; stroke: var(--page-faint); stroke-width: 1.7; stroke-linecap: round; transition: transform 0.16s ease; transform: rotate(-90deg); }
.sec summary:hover .chev { stroke: var(--page-fg); }
.sec[open] .chev { transform: none; }
.sec-body { padding: 0 0 18px; }
.sec-body p { margin: 0 0 8px; color: var(--page-muted); font-size: 12.5px; line-height: 1.5; }
.all-good { color: var(--ok) !important; font-weight: 500; }

/* Legend & keyboard shortcuts */
.legend { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 8px 10px; font-size: 12px; color: var(--page-muted); margin-bottom: 12px; }
.key { display: flex; align-items: center; gap: 7px; line-height: 1.3; }
.key svg { flex: none; overflow: visible; }
.k-box { fill: var(--box); stroke: var(--box-line); stroke-width: 1; }
.k-guess { fill: none; stroke: var(--guess); stroke-width: 2; stroke-dasharray: 4 3; }
.k-main { stroke: var(--ink); stroke-width: 3; }
.k-guess-line { stroke: var(--guess); stroke-width: 2; stroke-dasharray: 3 3; }
.k-break-box { fill: color-mix(in srgb, var(--bad) 14%, var(--box)); stroke: var(--bad); stroke-width: 2.5; }
.k-maybe-box { fill: color-mix(in srgb, var(--guess) 14%, var(--box)); stroke: var(--guess); stroke-width: 2.5; }
.k-path-box { fill: var(--box); stroke: var(--accent); stroke-width: 2.5; }
.k-shape { fill: var(--canvas); stroke: var(--line); stroke-width: 1.25; }
.keys { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 0 0 10px; }
.kb { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--page-muted); }
.kb kbd, .fnum {
  display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px;
  border-radius: 5px; border: 1px solid var(--rule); background: var(--surface);
  font: 600 10.5px/1 var(--mono); font-variant-numeric: tabular-nums; color: var(--page-fg);
}
.hint { font-size: 12px !important; color: var(--page-faint) !important; }


/* Rules & claims */
.claims, .rules { list-style: none; margin: 0; padding: 0; }
.claims { display: grid; gap: 6px; }
.claims .kind { display: block; font-size: 11px; font-weight: 600; color: var(--guess); margin-bottom: 2px; }
.plain { margin: 0; padding-left: 17px; font-size: 12.5px; color: var(--page-muted); line-height: 1.5; }
.plain li { margin: 0 0 5px; }
.rules { display: grid; gap: 2px; }
.rules li {
  display: flex; gap: 10px; padding: 8px 8px 9px; margin: 0 -8px; border-radius: 9px; font-size: 12.5px;
  transition: background 0.14s ease, box-shadow 0.14s ease;
}
.rules li:has(button):hover { background: var(--surface); }
.rules .mark { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; flex: none; font-size: 10.5px; font-weight: 700; color: #fff; margin-top: 1px; }
.rules .ok .mark { background: var(--ok); }
.rules .broken .mark { background: var(--bad); }
.rules .broken.maybe .mark, .rules .unknown .mark { background: var(--guess); }
.rules button[data-select], .rules strong { display: block; font-weight: 600; color: var(--page-fg); line-height: 1.4; }
.rules button[data-select] { padding: 0; margin: 0; }
.rules button[data-select]:hover, .rules button[data-select]:focus-visible { background: none; }
.rules li:has(button:focus-visible) { box-shadow: inset 0 0 0 2px var(--accent); }
.rules .broken button[data-select], .rules .broken strong { color: var(--bad); }
.rules .broken.maybe button[data-select], .rules .broken.maybe strong { color: var(--guess); }
.rules p { margin: 2px 0 0; color: var(--page-muted); line-height: 1.45; font-size: 12px; }
.rules li.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-border); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
button[data-select] { all: unset; cursor: pointer; border-radius: 4px; padding: 1px 4px; margin: 0 -4px; }
.claims button[data-select] {
  all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%;
  padding: 8.5px 10.5px; border: 1.5px dashed color-mix(in srgb, var(--guess) 75%, transparent);
  border-radius: 9px; font-size: 12.5px; background: color-mix(in srgb, var(--guess) 4%, var(--card));
  transition: background 0.14s ease, border-color 0.14s ease;
}
button[data-select]:hover, button[data-select]:focus-visible { background: var(--accent-soft); outline: none; }
.claims button[data-select]:hover, .claims button[data-select]:focus-visible { background: color-mix(in srgb, var(--guess) 9%, var(--card)); border-color: var(--guess); }
.claims button[data-select][aria-pressed="true"] { border-style: solid; border-color: var(--guess); background: color-mix(in srgb, var(--guess) 12%, var(--card)); }

/* Interactive SVG hover & selection feedback */
${graph ? '.pele .pele-node, .pele .pele-edge { cursor: pointer; }' : ''}
${graph ? '#diagram .pele .pele-node:hover > :first-child { stroke: var(--accent); stroke-width: 1.75px; }' : ''}
#diagram .pele .pele-node.fm-on > :first-child { stroke: var(--accent) !important; stroke-width: 3px !important; }
#diagram .pele .pele-edge.fm-on path:not(.pele-marker) { stroke: var(--accent) !important; stroke-width: 3px !important; }
#diagram .pele .pele-edge.fm-on .pele-marker { fill: var(--accent) !important; stroke: none !important; }

/* Phones and narrow windows: canvas on top, panel below it, page scrolls. */
@media (max-width: 900px) {
  body { overflow: auto; }
  main { display: block; height: auto; }
  .stage { --stage-h: 74dvh; height: 74dvh; border-bottom: 1px solid var(--rule); }
  .panel, main.fm-closed .panel { width: auto; height: auto; border-left: 0; }
  .panel-inner, main.fm-closed .panel-inner { width: auto; opacity: 1; pointer-events: auto; }
  .panel-body { overflow: visible; }
  .resize, .tools, #fm-open, main.fm-closed #fm-open, main.fm-closed .canvas-title { display: none; }
  .rail, main.fm-rail-closed .rail { width: auto; height: 52dvh; border-right: 0; border-bottom: 1px solid var(--rule); }
  .rail-inner, main.fm-rail-closed .rail-inner { width: auto; opacity: 1; pointer-events: auto; }
  .rail-foot, #rail-close, #rail-open, main.fm-rail-closed #rail-open { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .panel, .panel-inner, .rail, .rail-inner, .rv, .sec .chev, .fl-bar > i, .sdot, .fcard { transition: none; animation: none; }
}
.error { color: var(--bad); white-space: pre-wrap; font: 13px var(--mono); }
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
<script>
(() => {
  const read = (id) => JSON.parse(document.getElementById(id).textContent);
  const source = read('fm-source');
  const claims = read('fm-claims');
  const rules = read('fm-rules');
  const flows = read('fm-flows');
  const box = document.getElementById('diagram');
  const detail = document.getElementById('detail');
  const rail = document.getElementById('rail');
  const live = document.getElementById('fm-live');
  const roLabel = document.getElementById('ro-label');
  const roStep = document.getElementById('ro-step');
  let selected = null;
  let activeFlow = null; // flow index, or null for All
  let flowMode = 'highlight'; // 'highlight' | 'solo'
  let stepIdx = -1; // active step index inside a 'steps' flow, -1 = overview
  let mounted = null;
  let mountedSource = source;

  // Map each box/arrow id to the flow indices that contain it, for quick pivoting in the inspector.
  const flowsOf = {};
  flows.forEach((f, i) => {
    for (const id of f.ids) (flowsOf[id] ??= []).push(i);
  });

  const text = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = value;
    return el;
  };
  const light = (ids) => {
    box.querySelectorAll('.fm-on').forEach((el) => el.classList.remove('fm-on'));
    const soloMap = activeFlow !== null && flowMode === 'solo' ? flows[activeFlow].soloMap : null;
    const rev = soloMap ? Object.fromEntries(Object.entries(soloMap).map(([s, f]) => [f, s])) : null;
    for (const id of ids) {
      const domId = rev?.[id] ?? id;
      box.querySelector('[data-id="' + CSS.escape(domId) + '"]')?.classList.add('fm-on');
    }
  };

  // Dim what is outside the active flow, on the board and in the minimap alike.
  // A hovered card in the rail's index previews its flow the same way, without moving the camera.
  let preview = null;
  const applyFocus = () => {
    const fi = activeFlow ?? preview;
    const spotlight = fi !== null && (activeFlow === null || flowMode === 'highlight');
    for (const root of [box, document.getElementById('mm-art')]) {
      root.querySelectorAll('.fm-in').forEach((el) => el.classList.remove('fm-in'));
      root.classList.toggle('fm-focus', spotlight);
      if (!spotlight) continue;
      for (const id of flows[fi].ids) {
        root.querySelectorAll('[data-id="' + CSS.escape(id) + '"]').forEach((el) => el.classList.add('fm-in'));
      }
    }
  };

  const swapSource = (nextSource) => {
    if (nextSource === mountedSource || !mounted) return;
    mountedSource = nextSource;
    mounted.update(nextSource);
    box.scrollLeft = 0;
    box.scrollTop = 0;
  };

  // The rail mirrors the state: the index or the open flow, its mode and step, and the board's reopen button.
  let railView = 'index';
  const syncRail = () => {
    if (!rail) return;
    const view = activeFlow === null ? 'index' : String(activeFlow);
    if (view !== railView) {
      // Keep keyboard focus in the rail when the view it sat in goes away.
      const hadFocus = rail.contains(document.activeElement);
      const back = view === 'index';
      const from = back ? Number(railView) : null;
      railView = view;
      rail.dataset.view = back ? 'index' : 'flow';
      rail.querySelectorAll('.rv').forEach((sec) => {
        const on = back ? sec.id === 'rv-index' : sec.dataset.fv === view;
        sec.hidden = !on;
        sec.classList.remove('enter');
        if (on && !reduceMotion.matches) { void sec.offsetWidth; sec.classList.add('enter'); }
      });
      const fresh = back ? null : rail.querySelector('[data-fv="' + view + '"]');
      if (fresh) fresh.querySelector('.fv-steps, .fv-boxes').scrollTop = 0;
      if (hadFocus) {
        if (back) rail.querySelector('.fcard[data-flow="' + from + '"]')?.focus({ preventScroll: false });
        else fresh.querySelector('.fv-title').focus({ preventScroll: true });
      }
      rail.querySelectorAll('.fcard.peek').forEach((c) => c.classList.remove('peek'));
    }
    document.querySelectorAll('.fcard[data-flow]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.flow) === activeFlow)));
    document.querySelectorAll('[data-fmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fmode === flowMode)));
    roStep.hidden = true;
    if (activeFlow === null) { roLabel.textContent = 'All flows'; return; }
    const f = flows[activeFlow];
    roLabel.textContent = f.label;
    const sec = rail.querySelector('[data-fv="' + activeFlow + '"]');
    if (f.kind === 'steps' && f.stepLabels?.length) {
      const total = f.stepLabels.length;
      const pos = sec.querySelector('.fl-pos');
      if (stepIdx >= 0) {
        pos.replaceChildren('Step ', text('b', '', String(stepIdx + 1)), ' of ' + total);
        roStep.hidden = false;
        roStep.textContent = (stepIdx + 1) + '/' + total;
      } else pos.textContent = total + ' steps';
      sec.querySelector('[data-prev]').disabled = stepIdx <= 0;
      const next = sec.querySelector('[data-next]');
      next.disabled = stepIdx >= total - 1;
      sec.querySelector('[data-fill]').style.width = (stepIdx < 0 ? 0 : ((stepIdx + 1) / total) * 100) + '%';
      sec.querySelectorAll('.fv-steps li').forEach((li, i) => {
        li.classList.toggle('done', stepIdx >= 0 && i < stepIdx);
        li.classList.toggle('cur', i === stepIdx);
        const b = li.querySelector('button');
        if (i === stepIdx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      const cur = sec.querySelector('.fv-steps li.cur');
      if (cur && railOpen) cur.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    } else {
      sec.querySelectorAll('[data-box]').forEach((b) => b.classList.toggle('sel', b.dataset.box === selected));
    }
  };
  const say = (msg) => { if (live) live.textContent = msg; };

  const main = document.querySelector('main');
  const emptyDetail = detail.innerHTML;
  const closeIcon = ${JSON.stringify(ICON_CLOSE)};
  const copyIcon = ${JSON.stringify(ICON_COPY)};
  const checkIcon = ${JSON.stringify(ICON_CHECK)};
  const chevIcon = '<svg class="j-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
  // The card's head: icon tile (tinted by cardTone), what it is, a status pill, and a clear button.
  const lead = (tag, status, statusTone, cardTone) => {
    const top = document.createElement('div');
    top.className = 'top';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'icon-btn clear';
    clear.title = 'Clear the selection (Esc)';
    clear.innerHTML = closeIcon + '<span class="sr">Clear the selection</span>';
    clear.addEventListener('click', () => show(activeFlow !== null ? 'flow:' + activeFlow : null));
    top.append(text('span', 'tag', tag), text('span', 'pill ' + (statusTone || 'plain'), status), clear);
    detail.className = 'detail on' + (cardTone ? ' ' + cardTone : '');
    detail.append(top);
  };
  // Everything in the card is a group: a small heading over rows of one shape,
  // [icon or key] [title, faint subline] [meta] [action], so sources, ends and flows read alike.
  const ICONS = {
    file: '<path d="M4 1.8h5.2L12.5 5v9.2H4z"/><path d="M9 1.8V5h3.5"/>',
    link: '<path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.8.8"/><path d="M9.2 6.8a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.8-.8"/>',
    note: '<path d="M3 4h10M3 8h10M3 12h6"/>',
    from: '<circle cx="5" cy="8" r="2.4"/><path d="M7.4 8h6M11 5.5 13.5 8 11 10.5"/>',
    to: '<path d="M2.5 8h6M6.5 5.5 9 8l-2.5 2.5"/><rect x="10.5" y="4" width="3.2" height="8" rx="1"/>',
  };
  const icon = (name) => { const el = document.createElement('span'); el.className = 'r-icon'; el.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">' + ICONS[name] + '</svg>'; return el; };
  const group = (label) => {
    const g = document.createElement('div');
    g.className = 'd-group';
    const rows = document.createElement('div');
    rows.className = 'd-rows';
    g.append(text('div', 'd-head', label), rows);
    detail.append(g);
    return rows;
  };
  const row = ({ lead, title, sub, meta, onClick, current, action }) => {
    const r = document.createElement(onClick ? 'button' : 'div');
    if (onClick) { r.type = 'button'; r.addEventListener('click', onClick); }
    r.className = 'd-row' + (onClick ? ' go' : '') + (current ? ' cur' : '');
    const leadEl = document.createElement('span');
    leadEl.className = 'r-lead';
    leadEl.append(lead);
    const main = document.createElement('span');
    main.className = 'r-main';
    main.append(text('span', 'r-title', title));
    if (sub) main.append(text('span', 'r-sub', sub));
    r.append(leadEl, main);
    if (meta) r.append(text('span', 'r-meta', meta));
    const act = document.createElement('span');
    act.className = 'r-act';
    if (action) act.append(action);
    else if (onClick) act.innerHTML = chevIcon;
    r.append(act);
    return r;
  };
  // A source as a row: the file name, the folder under it, the line as meta, and a copy button.
  const sourceRow = (s) => {
    const isUrl = /^[a-z]+:\\/\\//i.test(s);
    const cut = isUrl ? -1 : s.search(/[\\s,]/);
    const path = cut < 0 ? s : s.slice(0, cut);
    const rest = cut < 0 ? '' : s.slice(cut).replace(/^[\\s,]+/, '');
    const isPath = !isUrl && /[./#]/.test(path) && !/\\s/.test(path);
    let lead = 'note', title = s, sub = '', meta = '';
    if (isPath) {
      const slash = path.lastIndexOf('/');
      title = path.slice(slash + 1);
      const m = title.match(/^(.*?)(?::(\\d+(?:-\\d+)?)|(#.+))$/);
      if (m) { title = m[1]; meta = m[2] ? 'L' + m[2].replace('-', '–') : m[3]; }
      if (rest) title += ' · ' + rest;
      sub = slash > 0 ? path.slice(0, slash) : '';
      lead = 'file';
    } else if (isUrl) {
      lead = 'link';
      try { const u = new URL(s); title = u.host; sub = (u.pathname + u.search + u.hash).replace(/^\\/$/, ''); } catch { /* keep whole */ }
    }
    let copy = null;
    if (navigator.clipboard) {
      copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'copy';
      copy.title = 'Copy source';
      copy.setAttribute('aria-label', 'Copy source');
      copy.innerHTML = copyIcon;
      copy.addEventListener('click', () => {
        navigator.clipboard.writeText(s).then(() => {
          copy.classList.add('done');
          copy.innerHTML = checkIcon;
          copy.title = 'Copied';
          setTimeout(() => { copy.classList.remove('done'); copy.innerHTML = copyIcon; copy.title = 'Copy source'; }, 1300);
        }).catch(() => {});
      });
    }
    return row({ lead: icon(lead), title, sub, meta, action: copy });
  };
  const selectAndReveal = (id) => {
    show(id);
    const soloMap = activeFlow !== null && flowMode === 'solo' ? flows[activeFlow].soloMap : null;
    const domId = soloMap ? Object.keys(soloMap).find((k) => soloMap[k] === id) ?? id : id;
    const el = box.querySelector('[data-id="' + CSS.escape(domId) + '"]');
    if (el) reveal(el, { minK: READABLE, maxK: Math.max(cam.k, READABLE) });
  };

  // Bring boxes or arrows into view by moving the board camera (never the page). Leaves the view alone
  // when they are on screen at a readable zoom; else frames them, zooming out no further than minK
  // (a long flow that cannot fit at minK is shown from its start) and in no further than maxK.
  const reveal = (els, { minK = 0.6, maxK = Math.max(cam.k, minK) } = {}) => {
    const list = els instanceof Element ? [els] : [...els];
    if (!list.length || !svgEl) return;
    const v = box.getBoundingClientRect();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of list) {
      const q = el.getBoundingClientRect();
      if (!q.width && !q.height) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    if (l === Infinity) return;
    const p = pad();
    const onScreen = l >= v.left + p.left && r <= v.right - p.right && t >= v.top + p.top && b <= v.bottom - p.bottom;
    if (onScreen && cam.k >= minK - 1e-3) return;
    const g = { x: (l - v.left - cam.x) / cam.k, y: (t - v.top - cam.y) / cam.k, w: (r - l) / cam.k, h: (b - t) / cam.k };
    const target = frame(g, maxK);
    if (target.k < minK) {
      // Too big to show whole and readable: readable size, centered across, from the top.
      const aw = box.clientWidth - p.left - p.right;
      target.k = minK;
      target.x = p.left + aw / 2 - (g.x + g.w / 2) * minK;
      target.y = p.top - g.y * minK;
    }
    animateTo(target);
  };

  const gotoStep = (idx) => {
    if (activeFlow === null) return;
    const f = flows[activeFlow];
    if (f.kind !== 'steps' || !f.stepNodeIds?.length) return;
    stepIdx = Math.max(0, Math.min(f.stepNodeIds.length - 1, idx));
    const nodeId = f.stepNodeIds[stepIdx];
    const edgeId = stepIdx > 0 ? f.stepEdgeIds[stepIdx - 1] : null;
    show(nodeId, edgeId ? [nodeId, edgeId] : [nodeId]);
    syncRail();
    say('Step ' + (stepIdx + 1) + ' of ' + f.stepLabels.length + ': ' + f.stepLabels[stepIdx]);
    // Follow the step at a readable size, so stepping through a long flow is never a zoomed-out blur.
    const lit = box.querySelector('.pele-node.fm-on');
    if (lit) reveal(lit, { minK: READABLE, maxK: Math.max(cam.k, READABLE) });
  };

  const setFlow = (index, mode = flowMode) => {
    const changed = index !== activeFlow;
    activeFlow = index;
    flowMode = mode;
    if (changed) stepIdx = -1;
    // A selection from outside the new flow would point at a dimmed box, so drop it.
    if (changed && index !== null && selected && !selected.startsWith('flow:') && !selected.startsWith('rule:') && !flows[index].ids.includes(selected)) selected = null;
    syncRail();
    if (changed) say(activeFlow === null ? 'Whole graph' : flows[activeFlow].label + ', ' + (flows[activeFlow].kind === 'steps' ? flows[activeFlow].stepLabels.length + ' steps' : flows[activeFlow].nodeCount + ' boxes'));
    if (activeFlow === null) {
      swapSource(source);
      applyFocus();
      if (selected?.startsWith('flow:')) show(null);
      return;
    }
    const f = flows[activeFlow];
    if (flowMode === 'solo') {
      swapSource(f.mermaid);
      applyFocus();
    } else {
      swapSource(source);
      applyFocus();
      if (stepIdx < 0) reveal(box.querySelectorAll('.pele-node.fm-in'));
    }
    if (stepIdx >= 0) gotoStep(stepIdx);
    else if (!selected || selected.startsWith('flow:')) show('flow:' + activeFlow);
  };

  const show = (key, extraLight) => {
    selected = key;
    detail.replaceChildren();
    document.querySelectorAll('.rules li.sel').forEach((li) => li.classList.remove('sel'));
    document.querySelectorAll('button[data-select]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.select === key)));
    const rule = key?.startsWith('rule:') ? rules[Number(key.slice(5))] : null;
    const flowItem = key?.startsWith('flow:') ? flows[Number(key.slice(5))] : null;
    const c = key && claims[key];
    if (rule) {
      if (activeFlow !== null && flowMode === 'solo') {
        activeFlow = null;
        stepIdx = -1;
        syncRail();
        swapSource(source);
        applyFocus();
      }
      light(rule.ids);
      const tone = rule.ok ? 'ok' : (rule.vacuous || rule.uncertain) ? 'guess' : 'bad';
      lead('Rule', rule.ok ? 'Holds' : rule.vacuous ? 'Cannot check' : rule.uncertain ? 'May break' : 'Broken', tone, tone);
      detail.append(text('strong', '', rule.says));
      group(rule.ok ? 'Why it holds' : rule.vacuous ? 'Why it cannot be checked' : 'Why it breaks').append(text('p', 'd-note' + (rule.ok ? '' : rule.vacuous || rule.uncertain ? ' guess' : ' bad'), rule.detail));
      document.querySelector('[data-select="' + CSS.escape(key) + '"]')?.closest('li')?.classList.add('sel');
    } else if (flowItem) {
      // The rail shows the flow itself; the panel waits for a box, arrow or step.
      light([]);
      detail.className = 'detail';
      detail.innerHTML = emptyDetail;
    } else if (c) {
      light(extraLight ?? [key]);
      lead(c.kind === 'box' ? 'Box' : 'Arrow', c.sources ? 'Sourced' : 'Guess', c.sources ? 'ok' : 'warn', c.sources ? '' : 'guess');
      // Title: a box's label; an arrow's own label, or where it goes when it has none.
      detail.append(text('strong', '', c.kind === 'arrow' ? (c.via || (claims[c.from]?.label ?? '') + ' → ' + (claims[c.to]?.label ?? '')) : c.label));
      if (c.kind === 'arrow') {
        const rows = group('Connects');
        for (const [role, id] of [['from', c.from], ['to', c.to]]) {
          if (claims[id]) rows.append(row({ lead: icon(role), title: claims[id].label, meta: role === 'from' ? 'From' : 'To', onClick: () => selectAndReveal(id) }));
        }
      }
      if (c.sources) {
        const rows = group(c.sources.length === 1 ? 'Source' : c.sources.length + ' sources');
        for (const s of c.sources) rows.append(sourceRow(s));
      } else {
        group('Source').append(text('p', 'd-note guess', 'None yet, so it is drawn dashed. Confirm it, or find a line that says it.'));
      }
      const belongs = flowsOf[key];
      if (belongs?.length) {
        const rows = group('In flows');
        for (const fi of belongs) {
          const f = flows[fi];
          const at = f.kind === 'steps' ? f.stepNodeIds.indexOf(key) : -1;
          const go = () => { if (activeFlow !== fi) setFlow(fi); if (at >= 0) gotoStep(at); else show(key); };
          rows.append(row({ lead: text('kbd', 'fkey', fi < 9 ? String(fi + 1) : '·'), title: f.label, meta: at >= 0 ? 'Step ' + (at + 1) + ' of ' + f.stepNodeIds.length : '', onClick: go, current: fi === activeFlow }));
        }
      }
    } else {
      light([]);
      detail.className = 'detail';
      detail.innerHTML = emptyDetail;
    }
    rail?.querySelectorAll('[data-box]').forEach((b) => b.classList.toggle('sel', b.dataset.box === key));
  };

  box.addEventListener('click', (event) => {
    const el = event.target.closest('.pele-node[data-id], .pele-edge[data-id]');
    if (!el) {
      // A click on empty board drops the selection, back to the active flow if there is one.
      if (selected && !selected.startsWith('flow:')) show(activeFlow !== null ? 'flow:' + activeFlow : null);
      return;
    }
    const soloMap = activeFlow !== null && flowMode === 'solo' ? flows[activeFlow].soloMap : null;
    const claimId = soloMap?.[el.dataset.id] ?? el.dataset.id;
    if (claims[claimId]) {
      if (activeFlow !== null && flows[activeFlow].kind === 'steps') {
        const pos = flows[activeFlow].stepNodeIds.indexOf(claimId);
        if (pos >= 0) { stepIdx = pos; syncRail(); }
      }
      show(claimId === selected ? (activeFlow !== null ? 'flow:' + activeFlow : null) : claimId);
      if (selected && !selected.startsWith('flow:')) setOpen(true);
    }
  });

  document.querySelectorAll('[data-flow]').forEach((b) => b.addEventListener('click', () => {
    preview = null;
    setFlow(b.dataset.flow === '' ? null : Number(b.dataset.flow));
  }));
  document.querySelectorAll('[data-flow-step]').forEach((b) => b.addEventListener('click', () => {
    if (activeFlow === null) return;
    const n = flows.length;
    setFlow((activeFlow + Number(b.dataset.flowStep) + n) % n);
  }));
  // Hover or focus a card to preview its flow on the board.
  document.querySelectorAll('.fcard').forEach((c) => {
    const on = () => { if (activeFlow !== null) return; preview = Number(c.dataset.flow); c.classList.add('peek'); applyFocus(); };
    const off = () => { c.classList.remove('peek'); if (preview !== Number(c.dataset.flow)) return; preview = null; if (activeFlow === null) applyFocus(); };
    c.addEventListener('pointerenter', on);
    c.addEventListener('pointerleave', off);
    c.addEventListener('focus', on);
    c.addEventListener('blur', off);
  });
  // Many flows get a filter box.
  const filter = document.getElementById('rail-filter');
  filter?.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('.fcard').forEach((c) => {
      const hit = !q || c.textContent.toLowerCase().includes(q);
      c.parentElement.hidden = !hit;
      shown += hit;
    });
    document.getElementById('rail-empty').hidden = shown > 0;
  });
  document.querySelectorAll('[data-fmode]').forEach((b) => b.addEventListener('click', () => {
    if (activeFlow !== null) setFlow(activeFlow, b.dataset.fmode);
  }));
  // Step controls and step lists in the rail. Picking a step of another flow opens that flow first.
  document.querySelectorAll('[data-prev]').forEach((b) => b.addEventListener('click', () => gotoStep(stepIdx - 1)));
  document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => gotoStep(stepIdx < 0 ? 0 : stepIdx + 1)));
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const [fi, si] = b.dataset.step.split(':').map(Number);
    if (activeFlow !== fi) setFlow(fi);
    gotoStep(si);
  }));
  document.querySelectorAll('[data-box]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.box;
    show(id === selected ? 'flow:' + activeFlow : id);
    if (selected === id) {
      const soloMap = flowMode === 'solo' && activeFlow !== null ? flows[activeFlow].soloMap : null;
      const domId = soloMap ? Object.keys(soloMap).find((k) => soloMap[k] === id) ?? id : id;
      const el = box.querySelector('[data-id="' + CSS.escape(domId) + '"]');
      if (el) reveal(el, { minK: READABLE, maxK: Math.max(cam.k, READABLE) });
    }
  }));

  // Keyboard shortcuts (ignored while typing or with modifier keys).
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'Escape') {
      if (selected && !selected.startsWith('flow:')) {
        stepIdx = -1;
        syncRail();
        show(activeFlow !== null ? 'flow:' + activeFlow : null);
      } else if (activeFlow !== null) setFlow(null);
      else if (selected) show(null);
      return;
    }
    if (event.key === '\\\\') { setOpen(!open); return; }
    if (rail && event.key === '[') { setRailOpen(!railOpen); return; }
    if (event.key === '?') {
      setOpen(true);
      const how = document.getElementById('sec-how');
      how.open = true;
      const body = how.closest('.panel-body');
      body.scrollTo({ top: how.offsetTop - body.offsetTop - 8, behavior: 'smooth' });
      return;
    }
    if (event.key === '+' || event.key === '=') { zoomStep(1.25); return; }
    if (event.key === '-' || event.key === '_') { zoomStep(0.8); return; }
    if (flows.length && event.key === '0') { setFlow(null); return; }
    if (flows.length && /^[1-9]$/.test(event.key)) {
      const idx = Number(event.key) - 1;
      if (idx < flows.length) setFlow(idx === activeFlow ? null : idx);
      return;
    }
    if (activeFlow !== null && (event.key === 's' || event.key === 'S')) {
      setFlow(activeFlow, flowMode === 'solo' ? 'highlight' : 'solo');
      return;
    }
    if (activeFlow !== null && flows[activeFlow].kind === 'steps') {
      if (event.key === 'ArrowRight') { event.preventDefault(); gotoStep(stepIdx < 0 ? 0 : stepIdx + 1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); if (stepIdx > 0) gotoStep(stepIdx - 1); return; }
    }
    if (event.key === 'f' || event.key === 'F') { fitAll(); return; }
    // Arrow keys pan the board, unless focus is in the panel (where they scroll or resize it).
    const pan = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
    if (pan && !event.target?.closest?.('.panel, .rail')) {
      event.preventDefault();
      const d = event.shiftKey ? 320 : 96;
      animateTo({ k: cam.k, x: cam.x + pan[0] * d, y: cam.y + pan[1] * d }, 160);
    }
  });

  // A big graph scrolls, so bring the first lit box or arrow into view, not just the canvas.
  document.querySelectorAll('button[data-select]').forEach((b) => b.addEventListener('click', () => {
    show(b.dataset.select === selected ? null : b.dataset.select);
    reveal(box.querySelectorAll('.fm-on'));
  }));
  // The panel: open or closed, and how wide. Both are remembered in this browser when it allows.
  const store = {
    get: (k) => { try { return localStorage.getItem('flowmap:' + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('flowmap:' + k, v); } catch { /* not kept */ } },
  };
  const MIN = 300, DEFAULT = 384;
  const handle = document.getElementById('fm-resize');
  const openBtn = document.getElementById('fm-open');
  const closeBtn = document.getElementById('fm-close');
  const maxWidth = () => Math.max(MIN, Math.round(innerWidth * 0.7));
  let width = Number(store.get('side')) || DEFAULT;
  const setWidth = (w, save = true) => {
    width = Math.min(maxWidth(), Math.max(MIN, Math.round(w)));
    main.style.setProperty('--side', width + 'px');
    handle.setAttribute('aria-valuemin', MIN);
    handle.setAttribute('aria-valuemax', maxWidth());
    handle.setAttribute('aria-valuenow', width);
    if (save) store.set('side', width);
  };
  let open = true;
  const setOpen = (value) => {
    if (open === value) return;
    open = value;
    main.classList.toggle('fm-closed', !open);
    openBtn.setAttribute('aria-expanded', String(open));
    closeBtn.setAttribute('aria-expanded', String(open));
    store.set('open', open ? '1' : '0');
    (open ? closeBtn : openBtn).focus({ preventScroll: true });
  };
  setWidth(width, false);
  if (store.get('open') === '0') { open = false; main.classList.add('fm-closed'); openBtn.setAttribute('aria-expanded', 'false'); closeBtn.setAttribute('aria-expanded', 'false'); }
  closeBtn.addEventListener('click', () => setOpen(false));

  // The flows rail: open or closed, remembered like the panel.
  let railOpen = true;
  const railOpenBtn = document.getElementById('rail-open');
  const railCloseBtn = document.getElementById('rail-close');
  const setRailOpen = (value, focus = true) => {
    if (!rail || railOpen === value) return;
    railOpen = value;
    main.classList.toggle('fm-rail-closed', !railOpen);
    railOpenBtn.setAttribute('aria-expanded', String(railOpen));
    railCloseBtn.setAttribute('aria-expanded', String(railOpen));
    store.set('rail', railOpen ? '1' : '0');
    if (focus) (railOpen ? railCloseBtn : railOpenBtn).focus({ preventScroll: true });
  };
  if (rail) {
    if (store.get('rail') === '0') setRailOpen(false, false);
    railCloseBtn.addEventListener('click', () => setRailOpen(false));
    railOpenBtn.addEventListener('click', () => setRailOpen(true));
  }
  openBtn.addEventListener('click', () => setOpen(true));
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    main.classList.add('fm-dragging');
    const right = main.getBoundingClientRect().right;
    const move = (e) => setWidth(right - e.clientX, false);
    const up = () => {
      main.classList.remove('fm-dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      store.set('side', width);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => setWidth(DEFAULT));
  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 64 : 16;
    const to = { ArrowLeft: width + step, ArrowRight: width - step, Home: maxWidth(), End: MIN }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    setWidth(to);
  });
  addEventListener('resize', () => setWidth(width, false));

  // The board camera. The SVG keeps its natural size; cam places it: screen = graph * k + (x, y).
  // One model for every input: drag, wheel, pinch, keys, buttons, minimap and "reveal".
  const cam = { x: 0, y: 0, k: 1 };
  const MIN_K = 0.1, MAX_K = 4, READABLE = ${READABLE_SCALE};
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const zoomLevel = document.getElementById('z-level');
  const zoomIn = document.getElementById('z-in');
  const zoomOut = document.getElementById('z-out');
  const mini = document.getElementById('minimap');
  const miniArt = document.getElementById('mm-art');
  const miniView = document.getElementById('mm-view');
  let svgEl = null, natW = 0, natH = 0, miniSvg = null, miniK = 1;
  let viewedSource = null; // the source the camera was framed for
  let touched = false;     // the reader moved the camera, so resizes keep their view
  let anim = 0;
  let lastW = 0, lastH = 0;

  // Room the floating controls take on each side of the board.
  const pad = () => {
    const narrow = box.clientWidth < 600;
    return { top: 64, bottom: 64, left: narrow ? 16 : 40, right: narrow ? 16 : 40 };
  };
  const clampK = (k) => Math.min(MAX_K, Math.max(MIN_K, k));
  // Keep at least a strip of the graph on screen so it can never be lost off the edge.
  const clampCam = (c) => {
    const keep = 80, w = natW * c.k, h = natH * c.k, vw = box.clientWidth, vh = box.clientHeight;
    c.x = Math.min(vw - Math.min(keep, w), Math.max(Math.min(keep, w) - w, c.x));
    c.y = Math.min(vh - Math.min(keep, h), Math.max(Math.min(keep, h) - h, c.y));
    return c;
  };
  // The camera that shows graph rect g whole, centered, at no more than maxK.
  const frame = (g, maxK = 1) => {
    const p = pad(), aw = Math.max(40, box.clientWidth - p.left - p.right), ah = Math.max(40, box.clientHeight - p.top - p.bottom);
    const k = clampK(Math.min(maxK, aw / Math.max(1, g.w), ah / Math.max(1, g.h)));
    return { k, x: p.left + (aw - g.w * k) / 2 - g.x * k, y: p.top + (ah - g.h * k) / 2 - g.y * k };
  };
  const whole = () => ({ x: 0, y: 0, w: natW, h: natH });
  // First view: the whole graph if it is readable that way; else fill the width at a readable size, from the top.
  const startView = () => {
    const fitted = frame(whole());
    if (fitted.k >= READABLE || !natW) return fitted;
    const p = pad(), aw = box.clientWidth - p.left - p.right;
    const k = Math.min(1, Math.max(READABLE, aw / natW));
    return { k, x: natW * k <= aw ? p.left + (aw - natW * k) / 2 : p.left, y: p.top };
  };

  const apply = () => {
    if (!svgEl) return;
    svgEl.style.transform = 'translate(' + cam.x + 'px,' + cam.y + 'px) scale(' + cam.k + ')';
    zoomLevel.textContent = Math.round(cam.k * 100) + '%';
    zoomIn.disabled = cam.k >= MAX_K - 1e-3;
    zoomOut.disabled = cam.k <= MIN_K + 1e-3;
    drawMini();
  };
  const stop = () => { cancelAnimationFrame(anim); anim = 0; };
  const set = (c) => { stop(); Object.assign(cam, clampCam({ ...c })); apply(); };
  const animateTo = (target, ms = 300) => {
    stop();
    const to = clampCam({ ...target });
    if (reduceMotion.matches || !svgEl) { Object.assign(cam, to); apply(); return; }
    const from = { ...cam }, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      cam.k = from.k * Math.pow(to.k / from.k, e);
      cam.x = from.x + (to.x - from.x) * e;
      cam.y = from.y + (to.y - from.y) * e;
      apply();
      anim = p < 1 ? requestAnimationFrame(tick) : 0;
    };
    anim = requestAnimationFrame(tick);
  };
  // The camera at zoom k that keeps the graph point under screen point (sx, sy) where it is.
  const zoomedAt = (k, sx, sy) => {
    const v = box.getBoundingClientRect(), nk = clampK(k);
    const gx = (sx - v.left - cam.x) / cam.k, gy = (sy - v.top - cam.y) / cam.k;
    return { k: nk, x: sx - v.left - gx * nk, y: sy - v.top - gy * nk };
  };
  const center = () => { const v = box.getBoundingClientRect(); return [v.left + v.width / 2, v.top + v.height / 2]; };
  const zoomStep = (f) => { touched = true; animateTo(zoomedAt(cam.k * f, ...center()), 220); };
  const fitAll = () => { touched = false; animateTo(frame(whole())); };

  // Take over a freshly rendered SVG. A new graph (Solo, or back to All) gets a fresh view.
  const attach = () => {
    const svg = box.querySelector(':scope > svg');
    if (!svg) return;
    box.classList.add('fm-cam');
    const fresh = svg !== svgEl;
    svgEl = svg;
    natW = Number(svg.getAttribute('width')) || svg.getBBox?.().width || 0;
    natH = Number(svg.getAttribute('height')) || svg.getBBox?.().height || 0;
    for (const [prop, val] of [['width', natW + 'px'], ['height', natH + 'px'], ['max-width', 'none'], ['max-height', 'none']]) {
      svg.style.setProperty(prop, val, 'important');
    }
    if (fresh || viewedSource !== mountedSource) buildMini();
    lastW = box.clientWidth; lastH = box.clientHeight;
    if (viewedSource !== mountedSource) {
      viewedSource = mountedSource;
      touched = false;
      set(startView());
    } else apply();
  };

  // The minimap: a small copy of the drawing with the visible part outlined. Shown only when part is off screen.
  // The minimap is as wide as the zoom dock under it, and the drawing fills that width at a readable
  // size. A drawing taller than the box scrolls inside it to follow the view; it holds still mid-drag.
  const MINI_H = 168;
  const dock = document.querySelector('.zoom-dock');
  let miniOY = 0, miniFullH = 0, miniDragging = false;
  const buildMini = () => {
    miniSvg?.remove();
    if (!svgEl || !natW || !natH) return;
    const innerW = Math.max(100, (dock?.offsetWidth || 154) - 14);
    miniK = innerW / natW;
    miniFullH = natH * miniK;
    miniSvg = svgEl.cloneNode(true);
    miniSvg.removeAttribute('id');
    miniSvg.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    miniSvg.removeAttribute('aria-roledescription');
    miniSvg.removeAttribute('role');
    miniArt.style.width = Math.round(innerW) + 'px';
    miniArt.style.height = Math.round(Math.min(MINI_H, miniFullH)) + 'px';
    miniArt.prepend(miniSvg);
    miniOY = 0;
  };
  const drawMini = () => {
    if (!miniSvg) return;
    const vw = box.clientWidth, vh = box.clientHeight;
    const x0 = -cam.x / cam.k, y0 = -cam.y / cam.k, x1 = x0 + vw / cam.k, y1 = y0 + vh / cam.k;
    const all = x0 <= 1 && y0 <= 1 && x1 >= natW - 1 && y1 >= natH - 1;
    mini.classList.toggle('off', all);
    const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(natW, x1), cy1 = Math.min(natH, y1);
    const artH = Math.min(MINI_H, miniFullH);
    if (!miniDragging) {
      // Keep the outlined part centered in the box, within the drawing's ends.
      const mid = ((cy0 + cy1) / 2) * miniK;
      miniOY = Math.max(0, Math.min(miniFullH - artH, mid - artH / 2));
    }
    // Set properties one by one: the inline style also holds Pele's color variables.
    miniSvg.style.setProperty('transform', 'translate(0px,' + (-miniOY) + 'px) scale(' + miniK + ')');
    mini.classList.toggle('mm-top', miniOY > 0.5);
    mini.classList.toggle('mm-bottom', miniOY < miniFullH - artH - 0.5);
    Object.assign(miniView.style, {
      left: cx0 * miniK + 'px', top: (cy0 * miniK - miniOY) + 'px',
      width: Math.max(4, (cx1 - cx0) * miniK) + 'px', height: Math.max(4, (cy1 - cy0) * miniK) + 'px',
    });
  };
  const miniGo = (e, smooth) => {
    const a = miniArt.getBoundingClientRect();
    const gx = (e.clientX - a.left) / miniK, gy = (e.clientY - a.top + miniOY) / miniK;
    const to = { k: cam.k, x: box.clientWidth / 2 - gx * cam.k, y: box.clientHeight / 2 - gy * cam.k };
    touched = true;
    smooth ? animateTo(to, 200) : set(to);
  };
  mini.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    mini.setPointerCapture(e.pointerId);
    miniGo(e, true);
    miniDragging = true;
    const move = (ev) => miniGo(ev, false);
    const up = () => { miniDragging = false; drawMini(); mini.removeEventListener('pointermove', move); mini.removeEventListener('pointerup', up); mini.removeEventListener('pointercancel', up); };
    mini.addEventListener('pointermove', move);
    mini.addEventListener('pointerup', up);
    mini.addEventListener('pointercancel', up);
  });

  // Drag to pan (anywhere: a press that does not move is still a click), two fingers to pinch.
  const pointers = new Map();
  let drag = null, pinch = null, swallowClick = false;
  box.addEventListener('pointerdown', (e) => {
    if (!svgEl || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1)) return;
    if (e.button === 1) e.preventDefault();
    swallowClick = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: e.button === 1 };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v = box.getBoundingClientRect();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: cam.k, gx: (mx - v.left - cam.x) / cam.k, gy: (my - v.top - cam.y) / cam.k };
      for (const id of pointers.keys()) box.setPointerCapture?.(id);
    }
  });
  box.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v = box.getBoundingClientRect();
      const k = clampK(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
      touched = true; swallowClick = true;
      set({ k, x: mx - v.left - pinch.gx * k, y: my - v.top - pinch.gy * k });
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved || !box.classList.contains('fm-panning')) {
      drag.moved = true;
      box.setPointerCapture?.(e.pointerId);
      box.classList.add('fm-panning');
    }
    touched = true; swallowClick = true;
    set({ k: cam.k, x: drag.cx + dx, y: drag.cy + dy });
  });
  const release = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    pinch = null;
    if (pointers.size === 1) {
      const [p] = pointers.values();
      drag = { x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: true };
    } else if (!pointers.size) {
      drag = null;
      box.classList.remove('fm-panning');
    }
  };
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  // A drag ends in a click on whatever is under the pointer; that click is not a selection.
  box.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  // Wheel and trackpad: scroll pans, pinch (ctrl + wheel) or ⌘/Ctrl + scroll zooms at the pointer.
  box.addEventListener('wheel', (e) => {
    if (!svgEl) return;
    e.preventDefault();
    touched = true;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? box.clientHeight : 1;
    let dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      set(zoomedAt(cam.k * Math.exp(-Math.max(-60, Math.min(60, dy)) * 0.01), e.clientX, e.clientY));
      return;
    }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    set({ k: cam.k, x: cam.x - dx, y: cam.y - dy });
  }, { passive: false });
  // Safari reports trackpad pinches as gesture events.
  let gestureK = 0;
  box.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureK = cam.k; });
  box.addEventListener('gesturechange', (e) => { e.preventDefault(); touched = true; set(zoomedAt(gestureK * e.scale, e.clientX, e.clientY)); });
  box.addEventListener('gestureend', (e) => e.preventDefault());
  // Double-click on empty board fits the whole graph.
  box.addEventListener('dblclick', (e) => {
    if (e.target.closest('.pele-node, .pele-edge, .pele-edge-label')) return;
    e.preventDefault();
    fitAll();
  });

  // Keep the view steady when the board changes size (panel opened, closed, resized, or the window).
  new ResizeObserver(() => {
    if (!svgEl) return;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    if (!touched) set(startView());
    else set({ k: cam.k, x: cam.x + (w - lastW) / 2, y: cam.y + (h - lastH) / 2 });
    lastW = w; lastH = h;
  }).observe(box);

  const fit = document.getElementById('fm-fit');
  fit.addEventListener('click', fitAll);
  zoomIn.addEventListener('click', () => zoomStep(1.25));
  zoomOut.addEventListener('click', () => zoomStep(0.8));
  zoomLevel.addEventListener('click', () => { touched = true; animateTo(zoomedAt(1, ...center()), 220); });

  try {
    mounted = pele.mount(box, source, {
      limit: ${LIMITS.limit}, outputLimit: ${LIMITS.outputLimit}, maxEdges: ${LIMITS.maxEdges},
      zoom: false,
      onRender: () => {
        attach();
        applyFocus();
        if (activeFlow !== null && stepIdx >= 0) {
          const f = flows[activeFlow];
          const nid = f.stepNodeIds[stepIdx];
          const eid = stepIdx > 0 ? f.stepEdgeIds[stepIdx - 1] : null;
          light(eid ? [nid, eid] : [nid]);
        } else if (selected) show(selected);
      },
    });
  } catch (error) {
    box.after(text('p', 'error', 'The interactive view failed, so this is the static drawing. ' + (error && error.message || error)));
  }
  attach();
})();
</script>
</body>
</html>
`;
}
