// Checks how things can move through a graph: boxes nothing reaches, dead ends, loops with
// no way out, and the reader's own rules. A broken rule comes with the shortest path that
// breaks it, like the statechart skill's bug paths. It checks the graph as drawn, not the
// real system, so a path that uses an unsourced arrow says so.
import { sources } from './graph.mjs';

// Shapes that mean "the flow starts or stops here", so a box with no way out is expected.
const END_SHAPES = new Set(['stadium', 'database', 'circle']);
// Shapes that end the flow even when an arrow leaves them. A database is read again, so it is not one.
const LOOP_EXITS = new Set(['stadium', 'circle']);

const out = (graph) => {
  const next = new Map(graph.nodes.map((n) => [n.id, []]));
  (graph.edges ?? []).forEach((e, i) => next.get(e.from).push({ to: e.to, edge: i }));
  return next;
};

/** Boxes where the flow starts: those no arrow points to, or else the first box. */
export function starts(graph) {
  const pointed = new Set((graph.edges ?? []).map((e) => e.to));
  const list = graph.nodes.filter((n) => !pointed.has(n.id)).map((n) => n.id);
  return list.length ? list : [graph.nodes[0].id];
}

/**
 * Breadth-first search from `from` (a list of ids), never entering `avoid`.
 * Returns the shortest path to each box reached, as { nodes, edges }.
 */
function search(graph, from, avoid) {
  const next = out(graph);
  const back = new Map(from.filter((id) => id !== avoid).map((id) => [id, null]));
  const queue = [...back.keys()];
  while (queue.length) {
    const at = queue.shift();
    for (const { to, edge } of next.get(at)) {
      if (to === avoid || back.has(to)) continue;
      back.set(to, { prev: at, edge });
      queue.push(to);
    }
  }
  return (id) => {
    if (!back.has(id)) return null;
    const nodes = [id];
    const edges = [];
    for (let step = back.get(id); step; step = back.get(step.prev)) {
      nodes.unshift(step.prev);
      edges.unshift(step.edge);
    }
    return { nodes, edges };
  };
}

/** Which boxes can reach any box in `targets`. */
function canReach(graph, targets) {
  const prev = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges ?? []) prev.get(e.to).push(e.from);
  const seen = new Set(targets);
  const queue = [...targets];
  while (queue.length) for (const p of prev.get(queue.shift())) if (!seen.has(p)) { seen.add(p); queue.push(p); }
  return seen;
}

/** True when some path of one arrow or more leads from a box in `from` to `to`. */
function leadsTo(graph, from, to) {
  const next = out(graph);
  const seen = new Set();
  const queue = from.flatMap((id) => next.get(id).map((s) => s.to));
  while (queue.length) {
    const at = queue.shift();
    if (at === to) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    queue.push(...next.get(at).map((s) => s.to));
  }
  return false;
}

/**
 * Check the flow of a valid graph.
 * A rule is `ok`, broken (with a `path`, and `uncertain` when the path uses an unsourced claim),
 * or `vacuous`: nothing reaches its box, so it says nothing.
 * @returns {{ warnings: string[], rules: { says: string, ok: boolean, vacuous?: boolean, uncertain?: boolean, detail: string, path?: { nodes: string[], edges: number[] } }[],
 *             breaks: { nodes: Set<string>, mayBreak: Set<string>, pathNodes: Set<string>, edges: Set<number>, maybeEdges: Set<number> } }}
 */
export function checkFlow(graph) {
  const warnings = [];
  const edges = graph.edges ?? [];
  const label = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const node = new Map(graph.nodes.map((n) => [n.id, n]));
  const breaks = {
    nodes: new Set(),
    mayBreak: new Set(),
    pathNodes: new Set(),
    edges: new Set(),
    maybeEdges: new Set(),
  };

  const next = out(graph);
  const first = starts(graph);
  const reach = search(graph, first);

  for (const n of graph.nodes) {
    const ways = next.get(n.id).length;
    if (n.shape === 'decision' && ways < 2) {
      warnings.push(`"${n.label}" is a decision with ${ways ? 'one way' : 'no way'} out. Add the other branch, or make it a box.`);
    }
  }

  // Reach, dead ends and loops only mean something once there are arrows.
  if (edges.length) {
    const unreached = graph.nodes.filter((n) => !reach(n.id));
    if (unreached.length) {
      warnings.push(`Nothing reaches ${unreached.map((n) => `"${n.label}"`).join(', ')} from where the flow starts (${first.map((id) => `"${label.get(id)}"`).join(', ')}). Add the arrow in, or leave the box out.`);
    }
    const sinks = graph.nodes.filter((n) => next.get(n.id).length === 0);
    // Dead ends only matter in a flow with a marked start or end; a map of parts has leaves.
    if (graph.nodes.some((n) => n.shape === 'stadium')) {
      for (const n of sinks) {
        if (!END_SHAPES.has(n.shape) && n.shape !== 'decision') warnings.push(`"${n.label}" is a dead end: nothing leaves it. If the flow stops here, make it a stadium. If not, add the arrow out.`);
      }
    }
    // A way out is a box with no arrows out, or a start or end shape (a stadium that loops back to
    // the start is still an end). With none of these, the graph is a map of parts, and loops are normal.
    const ends = [...sinks, ...graph.nodes.filter((n) => LOOP_EXITS.has(n.shape))];
    if (ends.length) {
      const exits = canReach(graph, ends.map((n) => n.id));
      const stuck = graph.nodes.filter((n) => !exits.has(n.id) && reach(n.id));
      if (stuck.length) warnings.push(`${stuck.map((n) => `"${n.label}"`).join(', ')} can loop forever: no path from there reaches an end. Add a way out, or say why there is none.`);
    }
  }

  const names = (ids) => ids.map((id) => `"${label.get(id)}"`).join(' → ');
  const rules = (graph.rules ?? []).map((rule) => {
    const from = rule.from ? [rule.from] : first;
    const fromText = rule.from ? `"${label.get(rule.from)}"` : 'the start';
    let path = null;
    let detail;
    if (rule.through !== undefined) {
      // A rule about a box nothing leads to holds for no path, so it says nothing. A start box is
      // where the flow begins, not a box it reaches, unless the rule starts there itself.
      if (!leadsTo(graph, from, rule.to) && !(rule.from === rule.to)) {
        detail = `No path from ${fromText} reaches "${label.get(rule.to)}", so the rule says nothing. Add the arrow in, or check the rule's \`from\`.`;
        return { says: rule.says, ok: false, vacuous: true, detail };
      }
      path = search(graph, rule.from ? from : from.filter((id) => id !== rule.to), rule.through)(rule.to);
      detail = path
        ? `This path reaches "${label.get(rule.to)}" without passing "${label.get(rule.through)}": ${names(path.nodes)}.`
        : `Every path from ${fromText} to "${label.get(rule.to)}" passes "${label.get(rule.through)}".`;
    } else if (rule.never !== undefined) {
      path = search(graph, from)(rule.never);
      detail = path
        ? `This path reaches "${label.get(rule.never)}": ${names(path.nodes)}.`
        : `No path from ${fromText} reaches "${label.get(rule.never)}".`;
    } else {
      const found = search(graph, from)(rule.reaches);
      detail = found
        ? `${fromText[0].toUpperCase()}${fromText.slice(1)} reaches "${label.get(rule.reaches)}": ${names(found.nodes)}.`
        : `No path from ${fromText} reaches "${label.get(rule.reaches)}".`;
      if (!found) return { says: rule.says, ok: false, detail };
      return { says: rule.says, ok: true, detail };
    }
    if (!path) return { says: rule.says, ok: true, detail };
    const guesses = path.edges.filter((i) => !sources(edges[i])).length + path.nodes.filter((id) => !sources(node.get(id))).length;
    const uncertain = guesses > 0;
    if (uncertain) detail += ` It uses ${guesses} unsourced ${guesses === 1 ? 'claim' : 'claims'}, so confirm those before you call it a bug.`;
    const target = path.nodes.at(-1);
    if (uncertain) {
      breaks.mayBreak.add(target);
      for (const i of path.edges) breaks.maybeEdges.add(i);
    } else {
      breaks.nodes.add(target);
      for (const i of path.edges) breaks.edges.add(i);
    }
    for (const id of path.nodes.slice(0, -1)) breaks.pathNodes.add(id);
    return { says: rule.says, ok: false, uncertain, detail, path };
  });
  // Confirmed breaks take precedence over uncertain breaks, and both take precedence over leading path nodes.
  for (const id of breaks.nodes) {
    breaks.mayBreak.delete(id);
    breaks.pathNodes.delete(id);
  }
  for (const id of breaks.mayBreak) breaks.pathNodes.delete(id);
  for (const i of breaks.edges) breaks.maybeEdges.delete(i);
  for (const r of rules) if (!r.ok) warnings.push(`${r.vacuous ? 'Rule cannot be checked' : r.uncertain ? 'Rule may break' : 'Rule broken'}: ${r.says}. ${r.detail}`);
  return { warnings, rules, breaks };
}
