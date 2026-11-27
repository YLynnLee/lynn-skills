// Checks a flowmap graph and turns it into Mermaid flowchart text.
// The graph format is documented in references/graph-format.md.

export const SHAPES = {
  box: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  decision: ['{', '}'],
  database: ['[(', ')]'],
  hexagon: ['{{', '}}'],
  circle: ['((', '))'],
  subroutine: ['[[', ']]'],
  flag: ['>', ']'],
};
export const COLORS = ['blue', 'teal', 'green', 'yellow', 'orange', 'pink', 'purple', 'gray'];
export const DIRECTIONS = ['LR', 'RL', 'TB', 'TD', 'BT'];
export const EDGE_STYLES = { solid: '-->', thick: '==>' };
const ASSUMED_EDGE = '-.->';

export const DEFAULT_MAX_EDGES = 20;
const MAX_NODE_LABEL = 40;
const MAX_EDGE_LABEL = 32;
const MAX_COLORS = 6;
// Above this many arrows, a graph with two or more decisions should name its journeys in `flows`.
const FLOWS_MIN_EDGES = 12;

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** A source is a non-empty string or a non-empty array of them. Returns a list, or null when there is none. */
export function sources(item) {
  const s = item?.source;
  if (s === undefined || s === null) return null;
  const list = Array.isArray(s) ? s : [s];
  return list.length && list.every(isText) ? list : undefined; // undefined = present but malformed
}

/** Text that a reader would call a code name rather than a description. */
export function looksLikeCode(label) {
  const t = label.trim();
  return (
    /^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(t) || // camelCase
    /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(t) || // snake_case
    /\w\(\)/.test(t) // call()
  );
}

/** Escape a label for a quoted Mermaid string. Defends against Mermaid parser hazards and turns newlines into line breaks. */
export function escapeLabel(text) {
  return String(text)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '')
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\\(?=n)/g, '#92;')
    .replace(/%(?=%)/g, '#37;')
    .replace(/:(?=:|$)/g, '#58;')
    .replace(/\[(?=\[)/g, '#91;')
    .replace(/(direction)\s+(?=LR|RL|TB|TD|BT)/gi, '$1#32;')
    .replace(/C4(?=Container|Component|Dynamic|Deployment)/g, 'C#52;')
    .replace(/\r?\n/g, '<br>');
}

/**
 * Check a graph. Errors stop the render; warnings are things to fix or explain.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validate(graph, { maxEdges = DEFAULT_MAX_EDGES } = {}) {
  const errors = [];
  const warnings = [];
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return { errors: ['The graph must be a JSON object.'], warnings };
  }
  const { title, direction, groups = {}, nodes, edges = [] } = graph;

  if (title !== undefined && !isText(title)) errors.push('`title` must be non-empty text.');
  if (direction !== undefined && !DIRECTIONS.includes(direction)) {
    errors.push(`\`direction\` must be one of ${DIRECTIONS.join(', ')}, not ${JSON.stringify(direction)}.`);
  }

  // Groups
  if (typeof groups !== 'object' || Array.isArray(groups) || groups === null) {
    errors.push('`groups` must be an object keyed by group id.');
  } else {
    for (const [id, g] of Object.entries(groups)) {
      if (!g || typeof g !== 'object') { errors.push(`Group "${id}" must be an object.`); continue; }
      if (g.label !== undefined && !isText(g.label)) errors.push(`Group "${id}": \`label\` must be non-empty text.`);
      if (g.color !== undefined && !COLORS.includes(g.color)) errors.push(`Group "${id}": color ${JSON.stringify(g.color)} is not one of ${COLORS.join(', ')}.`);
      if (g.parent !== undefined && !(g.parent in groups)) errors.push(`Group "${id}": parent "${g.parent}" is not a group.`);
    }
    for (const id of Object.keys(groups)) {
      const seen = new Set();
      for (let at = id; at !== undefined && groups[at]; at = groups[at].parent) {
        if (seen.has(at)) { errors.push(`Group "${id}" is inside itself (parent loop).`); break; }
        seen.add(at);
      }
    }
  }
  const groupIds = new Set(Object.keys(groups ?? {}));

  // Nodes
  const ids = new Set();
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push('`nodes` must be a non-empty list.');
  } else {
    for (const [i, n] of nodes.entries()) {
      const where = isText(n?.id) ? `Node "${n.id}"` : `Node ${i + 1}`;
      if (!n || typeof n !== 'object') { errors.push(`${where} must be an object.`); continue; }
      if (!isText(n.id)) errors.push(`${where}: \`id\` must be non-empty text.`);
      else if (ids.has(n.id)) errors.push(`${where}: the id is used twice.`);
      else ids.add(n.id);
      if (!isText(n.label)) errors.push(`${where}: \`label\` must be non-empty text.`);
      if (n.shape !== undefined && !(n.shape in SHAPES)) errors.push(`${where}: shape ${JSON.stringify(n.shape)} is not one of ${Object.keys(SHAPES).join(', ')}.`);
      if (n.color !== undefined && !COLORS.includes(n.color)) errors.push(`${where}: color ${JSON.stringify(n.color)} is not one of ${COLORS.join(', ')}.`);
      if (n.group !== undefined && !groupIds.has(n.group)) errors.push(`${where}: group "${n.group}" is not in \`groups\`.`);
      if (sources(n) === undefined) errors.push(`${where}: \`source\` must be text or a list of text.`);
    }
  }

  // Edges
  if (!Array.isArray(edges)) {
    errors.push('`edges` must be a list.');
  } else {
    for (const [i, e] of edges.entries()) {
      const where = `Edge ${i + 1}${e && isText(e.from) && isText(e.to) ? ` (${e.from} → ${e.to})` : ''}`;
      if (!e || typeof e !== 'object') { errors.push(`${where} must be an object.`); continue; }
      for (const end of ['from', 'to']) {
        if (!isText(e[end])) errors.push(`${where}: \`${end}\` must be a node id.`);
        else if (Array.isArray(nodes) && !ids.has(e[end])) errors.push(`${where}: \`${end}\` "${e[end]}" is not a node.`);
      }
      if (e.label !== undefined && !isText(e.label)) errors.push(`${where}: \`label\` must be non-empty text.`);
      if (e.style !== undefined && !(e.style in EDGE_STYLES)) {
        errors.push(`${where}: style ${JSON.stringify(e.style)} is not one of ${Object.keys(EDGE_STYLES).join(', ')}. Dotted arrows are kept for claims with no source.`);
      }
      if (sources(e) === undefined) errors.push(`${where}: \`source\` must be text or a list of text.`);
    }
  }
  // What the graph leaves out, where sources start, rules about the flow, and named journeys (flows)
  const { leavesOut, root, rules, flows } = graph;
  if (leavesOut !== undefined && !isText(leavesOut) && !(Array.isArray(leavesOut) && leavesOut.length && leavesOut.every(isText))) {
    errors.push('`leavesOut` must be text or a non-empty list of text.');
  }
  if (root !== undefined && !isText(root)) errors.push('`root` must be a folder path.');
  if (rules !== undefined && !Array.isArray(rules)) {
    errors.push('`rules` must be a list.');
  } else {
    for (const [i, r] of (rules ?? []).entries()) {
      const where = `Rule ${i + 1}`;
      if (!r || typeof r !== 'object') { errors.push(`${where} must be an object.`); continue; }
      if (!isText(r.says)) errors.push(`${where}: \`says\` must state the rule in the reader's words.`);
      const kinds = ['through', 'never', 'reaches'].filter((k) => r[k] !== undefined);
      if (kinds.length !== 1) errors.push(`${where}: give exactly one of \`through\` (with \`to\`), \`never\` or \`reaches\`.`);
      if (r.through !== undefined && r.to === undefined) errors.push(`${where}: \`through\` needs \`to\`, the box the path must not reach without passing it.`);
      if (r.to !== undefined && r.through === undefined) errors.push(`${where}: \`to\` is only used with \`through\`.`);
      for (const k of ['from', 'to', 'through', 'never', 'reaches']) {
        if (r[k] !== undefined && !ids.has(r[k])) errors.push(`${where}: \`${k}\` "${r[k]}" is not a node.`);
      }
    }
  }
  const edgePairs = new Set((Array.isArray(edges) ? edges : []).map((e) => `${e?.from}\u0000${e?.to}`));
  if (flows !== undefined && !Array.isArray(flows)) {
    errors.push('`flows` must be a list.');
  } else {
    for (const [i, f] of (flows ?? []).entries()) {
      const where = `Flow ${i + 1}${isText(f?.label) ? ` ("${f.label}")` : ''}`;
      if (!f || typeof f !== 'object') { errors.push(`${where} must be an object.`); continue; }
      if (!isText(f.label)) errors.push(`${where}: \`label\` must be non-empty text.`);
      if (f.note !== undefined && !isText(f.note)) errors.push(`${where}: \`note\` must be non-empty text.`);
      const kinds = ['steps', 'nodes'].filter((k) => f[k] !== undefined);
      if (kinds.length !== 1) {
        errors.push(`${where}: give either \`steps\` (an ordered path) or \`nodes\` (a set of boxes).`);
        continue;
      }
      const list = f[kinds[0]];
      if (!Array.isArray(list) || list.length < 2) {
        errors.push(`${where}: \`${kinds[0]}\` must list at least two node ids.`);
        continue;
      }
      let allKnown = true;
      for (const id of list) {
        if (!isText(id) || !ids.has(id)) {
          errors.push(`${where}: "${id}" is not a node.`);
          allKnown = false;
        }
      }
      if (allKnown && f.steps) {
        for (let k = 0; k < f.steps.length - 1; k++) {
          if (!edgePairs.has(`${f.steps[k]}\u0000${f.steps[k + 1]}`)) {
            errors.push(`${where}: no arrow goes from "${f.steps[k]}" to "${f.steps[k + 1]}".`);
          }
        }
      }
    }
  }
  if (errors.length) return { errors, warnings };

  // Warnings: the graph renders, but the reader may struggle with it.
  if (leavesOut === undefined) {
    warnings.push('The graph does not say what it leaves out. Add `leavesOut`, so a reader who finds it later knows its limits.');
  }
  if (edges.length > maxEdges) {
    warnings.push(`${edges.length} arrows is more than ${maxEdges}, so the graph is hard to read. Merge boxes that act the same, drop detail the reader does not need, split it into an overview and a close-up, or name its journeys in \`flows\` so the reader can trace one at a time.`);
  }
  const decisions = nodes.filter((n) => n.shape === 'decision').length;
  if (!flows?.length && edges.length > FLOWS_MIN_EDGES && decisions >= 2) {
    warnings.push(`${edges.length} arrows and ${decisions} decisions make several journeys, and the graph names none. Add \`flows\`, such as the main path and each branch a reader takes, so the page lists them and the reader can trace one at a time.`);
  }
  const touched = new Set(edges.flatMap((e) => [e.from, e.to]));
  if (edges.length) {
    for (const n of nodes) if (!touched.has(n.id)) warnings.push(`"${n.label}" has no arrows. Connect it, or leave it out.`);
  }
  const byLabel = new Map();
  for (const n of nodes) {
    const key = n.label.trim().toLowerCase();
    byLabel.set(key, [...(byLabel.get(key) ?? []), n.id]);
    if (n.label.length > MAX_NODE_LABEL) warnings.push(`"${n.label}" is longer than ${MAX_NODE_LABEL} characters. Shorten it, and keep the detail in the hand-off.`);
    if (looksLikeCode(n.label)) warnings.push(`"${n.label}" reads as a code name. Use the reader's words, unless the reader looks for this name in the code.`);
  }
  for (const [label, list] of byLabel) {
    if (list.length > 1) warnings.push(`${list.length} boxes are labelled "${label}" (${list.join(', ')}). The reader cannot tell them apart.`);
  }
  const seenEdges = new Set();
  for (const e of edges) {
    const key = `${e.from}\u0000${e.to}\u0000${e.label ?? ''}`;
    if (seenEdges.has(key)) warnings.push(`The arrow ${e.from} → ${e.to}${e.label ? ` "${e.label}"` : ''} is drawn twice.`);
    seenEdges.add(key);
    if (e.label && e.label.length > MAX_EDGE_LABEL) warnings.push(`The arrow label "${e.label}" is longer than ${MAX_EDGE_LABEL} characters.`);
    if (e.label && looksLikeCode(e.label)) warnings.push(`The arrow label "${e.label}" reads as a code name. Say what happens, in the reader's words.`);
  }
  const used = new Set([
    ...Object.values(groups).map((g) => g.color),
    ...nodes.map((n) => n.color),
  ].filter(Boolean));
  if (used.size > MAX_COLORS) warnings.push(`${used.size} colors is more than ${MAX_COLORS}. The reader cannot keep that many apart.`);
  for (const id of groupIds) {
    const hasNode = nodes.some((n) => n.group === id);
    const hasChild = Object.values(groups).some((g) => g.parent === id);
    if (!hasNode && !hasChild) warnings.push(`Group "${groups[id].label ?? id}" is empty.`);
  }
  const flowLabels = new Map();
  for (const f of flows ?? []) {
    const key = f.label.trim().toLowerCase();
    flowLabels.set(key, (flowLabels.get(key) ?? 0) + 1);
    if (f.nodes) {
      const set = new Set(f.nodes);
      const hasEdge = edges.some((e) => set.has(e.from) && set.has(e.to));
      if (!hasEdge) warnings.push(`Flow "${f.label}" has no arrows between its boxes.`);
    }
  }
  for (const [label, count] of flowLabels) {
    if (count > 1) warnings.push(`${count} flows are labelled "${label}". Give each flow a distinct name.`);
  }
  return { errors, warnings };
}

/** Unsourced boxes and arrows: what the reader should confirm. */
export function assumptions(graph) {
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  return [
    ...graph.nodes.filter((n) => !sources(n)).map((n) => `Box "${n.label}"`),
    ...(graph.edges ?? []).filter((e) => !sources(e)).map((e) => `Arrow "${label.get(e.from)}" → "${label.get(e.to)}"${e.label ? ` (${e.label})` : ''}`),
  ];
}

/** Make Mermaid-safe ids that stay readable in the .mmd file. A prefix avoids Mermaid keywords such as `end`. */
function idMaker(prefix) {
  const taken = new Set();
  return (raw) => {
    const base = `${prefix}_${String(raw).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x'}`;
    let id = base;
    for (let k = 2; taken.has(id); k++) id = `${base}_${k}`;
    taken.add(id);
    return id;
  };
}

/** `leavesOut` as a list. */
export const leftOut = (graph) => [graph.leavesOut ?? []].flat();

// Fixed fallback styles written into the .mmd file so plain Mermaid viewers (GitHub, Obsidian)
// still show guesses and broken rules. assets/theme.css overrides them with !important for dark mode.
export const BREAK_STROKE = 'stroke:#e5484d,stroke-width:3px';
export const MAY_BREAK_STROKE = 'stroke:#e8730c,stroke-width:3px';
export const CLASS_DEFS = {
  assumed: 'fill:#ffffff,stroke:#b45309,stroke-dasharray:6 4,stroke-width:2px,color:#92400e',
  bugPath: 'stroke:#1680f3,stroke-width:2.5px',
  mayBreak: 'fill:#fff3e6,stroke:#e8730c,stroke-width:3px,color:#b85a06',
  breaks: 'fill:#ffecee,stroke:#e5484d,stroke-width:3px,color:#cd2834',
};

/**
 * Turn a valid graph into Mermaid flowchart text. Call validate() first.
 * `breaks` marks rule violations: failing boxes get `breaks` (or `mayBreak` if the path uses a guess),
 * leading boxes on the path get `bugPath`, and path arrows get red or orange `linkStyle`.
 */
export function toMermaid(graph, { breaks } = {}) {
  const { title, direction = 'TD', groups = {}, nodes, edges = [] } = graph;
  const nodeId = new Map();
  const groupId = new Map();
  const makeNode = idMaker('n');
  const makeGroup = idMaker('g');
  for (const n of nodes) nodeId.set(n.id, makeNode(n.id));
  for (const id of Object.keys(groups)) groupId.set(id, makeGroup(id));

  const lines = [];
  if (title) lines.push('---', `title: ${JSON.stringify(title)}`, '---');
  lines.push(`flowchart ${direction}`);

  const nodeLine = (n, indent) => {
    const [open, close] = SHAPES[n.shape ?? 'box'];
    return `${indent}${nodeId.get(n.id)}${open}"${escapeLabel(n.label)}"${close}`;
  };
  // Boxes go out in the order the graph lists them, since Pele lays them out in that order.
  // A group goes out whole, where its first box is listed. Groups with no boxes go last.
  const chain = (n) => {
    const list = [];
    for (let g = n.group; g !== undefined; g = groups[g].parent) list.unshift(g);
    return list;
  };
  const emitted = new Set();
  const emitGroup = (gid, depth) => {
    emitted.add(gid);
    const indent = '  '.repeat(depth);
    lines.push(`${indent}subgraph ${groupId.get(gid)}["${escapeLabel(groups[gid].label ?? gid)}"]`);
    emitMembers(gid, depth + 1);
    lines.push(`${indent}end`);
  };
  const emitMembers = (gid, depth) => {
    for (const n of nodes) {
      const c = chain(n);
      const at = gid === undefined ? 0 : c.indexOf(gid) + 1;
      if (gid !== undefined && at === 0) continue; // not in this group
      if (at === c.length) lines.push(nodeLine(n, '  '.repeat(depth)));
      else if (!emitted.has(c[at])) emitGroup(c[at], depth);
    }
    for (const [child, g] of Object.entries(groups)) if (g.parent === gid && !emitted.has(child)) emitGroup(child, depth);
  };
  emitMembers(undefined, 1);

  for (const e of edges) {
    const arrow = sources(e) ? EDGE_STYLES[e.style ?? 'solid'] : ASSUMED_EDGE;
    const label = e.label ? `|"${escapeLabel(e.label)}"|` : '';
    lines.push(`  ${nodeId.get(e.from)} ${arrow}${label} ${nodeId.get(e.to)}`);
  }

  // Colors: a box takes its own color, else the nearest group's color.
  const colorOf = (n) => {
    if (n.color) return n.color;
    for (let g = n.group; g !== undefined; g = groups[g].parent) if (groups[g].color) return groups[g].color;
    return undefined;
  };
  const classes = new Map();
  const addClass = (cls, id) => classes.set(cls, [...(classes.get(cls) ?? []), id]);
  for (const n of nodes) {
    const c = colorOf(n);
    if (c) addClass(c, nodeId.get(n.id));
    if (!sources(n)) addClass('assumed', nodeId.get(n.id));
    if (breaks?.nodes?.has(n.id)) addClass('breaks', nodeId.get(n.id));
    else if (breaks?.mayBreak?.has(n.id)) addClass('mayBreak', nodeId.get(n.id));
    else if (breaks?.pathNodes?.has(n.id)) addClass('bugPath', nodeId.get(n.id));
  }
  for (const [cls, def] of Object.entries(CLASS_DEFS)) {
    if (classes.has(cls)) lines.push(`  classDef ${cls} ${def}`);
  }
  for (const [cls, list] of classes) lines.push(`  class ${list.join(',')} ${cls}`);
  if (breaks?.edges?.size) lines.push(`  linkStyle ${[...breaks.edges].sort((a, b) => a - b).join(',')} ${BREAK_STROKE}`);
  if (breaks?.maybeEdges?.size) {
    const onlyMaybe = [...breaks.maybeEdges].filter((i) => !breaks?.edges?.has(i)).sort((a, b) => a - b);
    if (onlyMaybe.length) lines.push(`  linkStyle ${onlyMaybe.join(',')} ${MAY_BREAK_STROKE}`);
  }

  return { mermaid: `${lines.join('\n')}\n`, nodeId, groupId, edgeId: edgeIds(edges, nodeId) };
}

/** The data-id Pele gives each arrow, in edge order. Repeats of a pair are numbered 0, 2, 3, ... (no 1), as Mermaid does. */
function edgeIds(edges, nodeId) {
  const seen = new Map();
  return edges.map((e) => {
    const pair = `${nodeId.get(e.from)}_${nodeId.get(e.to)}`;
    const n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    return `L_${pair}_${n === 0 ? 0 : n + 1}`;
  });
}

/**
 * Resolve named `flows` into full-graph highlight ids and standalone Solo Mermaid diagrams.
 * Clicking a box or arrow in Solo mode maps back to the full graph's claim via `soloMap`.
 */
export function resolveFlows(graph, { breaks } = {}) {
  const flows = graph?.flows ?? [];
  if (!flows.length) return [];
  const full = toMermaid(graph, { breaks });
  const edges = graph.edges ?? [];
  const groups = graph.groups ?? {};
  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]));

  return flows.map((f) => {
    const rawNodes = f.steps ?? f.nodes;
    const nodeOrder = [...new Set(rawNodes)];
    const nodeSet = new Set(nodeOrder);
    const edgeIndices = [];
    if (f.steps) {
      const seen = new Set();
      for (let k = 0; k < f.steps.length - 1; k++) {
        const a = f.steps[k];
        const b = f.steps[k + 1];
        edges.forEach((e, idx) => {
          if (e.from === a && e.to === b && !seen.has(idx)) {
            seen.add(idx);
            edgeIndices.push(idx);
          }
        });
      }
    } else {
      edges.forEach((e, idx) => {
        if (nodeSet.has(e.from) && nodeSet.has(e.to)) edgeIndices.push(idx);
      });
    }

    const subNodes = graph.nodes.filter((n) => nodeSet.has(n.id));
    const groupSet = new Set();
    for (const n of subNodes) {
      for (let g = n.group; g !== undefined && groups[g]; g = groups[g].parent) groupSet.add(g);
    }
    const subGroups = Object.fromEntries(Object.entries(groups).filter(([id]) => groupSet.has(id)));
    const subEdges = edgeIndices.map((idx) => edges[idx]);

    let subBreaks;
    if (breaks) {
      const intersect = (set) => new Set([...(set ?? [])].filter((id) => nodeSet.has(id)));
      const subEdgeBreaks = new Set();
      const subMaybeEdges = new Set();
      edgeIndices.forEach((origIdx, newIdx) => {
        if (breaks.edges?.has(origIdx)) subEdgeBreaks.add(newIdx);
        if (breaks.maybeEdges?.has(origIdx)) subMaybeEdges.add(newIdx);
      });
      subBreaks = {
        nodes: intersect(breaks.nodes),
        mayBreak: intersect(breaks.mayBreak),
        pathNodes: intersect(breaks.pathNodes),
        edges: subEdgeBreaks,
        maybeEdges: subMaybeEdges,
      };
    }

    const solo = toMermaid({
      direction: graph.direction,
      groups: subGroups,
      nodes: subNodes,
      edges: subEdges,
    }, { breaks: subBreaks });

    const soloMap = {};
    for (const n of subNodes) {
      const sId = solo.nodeId.get(n.id);
      const fId = full.nodeId.get(n.id);
      if (sId !== fId) soloMap[sId] = fId;
    }
    edgeIndices.forEach((origIdx, newIdx) => {
      const sId = solo.edgeId[newIdx];
      const fId = full.edgeId[origIdx];
      if (sId !== fId) soloMap[sId] = fId;
    });

    const ids = [
      ...nodeOrder.map((id) => full.nodeId.get(id)),
      ...edgeIndices.map((idx) => full.edgeId[idx]),
      ...[...groupSet].map((g) => full.groupId.get(g)),
    ];

    const stepNodeIds = f.steps ? f.steps.map((id) => full.nodeId.get(id)) : null;
    const stepEdgeIds = f.steps
      ? f.steps.slice(1).map((to, k) => {
        const from = f.steps[k];
        const idx = edges.findIndex((e) => e.from === from && e.to === to);
        return idx >= 0 ? full.edgeId[idx] : null;
      })
      : null;

    return {
      label: f.label,
      note: f.note ?? null,
      kind: f.steps ? 'steps' : 'nodes',
      stepLabels: f.steps ? f.steps.map((id) => labelById.get(id)) : null,
      stepNodeIds,
      stepEdgeIds,
      nodeCount: nodeOrder.length,
      edgeCount: edgeIndices.length,
      ids,
      mermaid: solo.mermaid,
      soloMap,
    };
  });
}
