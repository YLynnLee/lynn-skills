# How flowmap turns a subject into a graph

Rendered with Pele 1.13.0: flowchart, 11 boxes, 13 arrows, 3 groups. 532 × 1730 px.

## Warnings

None.

## Rules

- ✓ Nothing is handed off before the command has checked the graph. Every path from the start to "You confirm the dashed claims" passes "Any errors?".

## Leaves out

- The command's options, such as --out, --css and --max-edges
- Mermaid files of other types, which are rendered but not checked
- How a warning is fixed, which is up to the agent

## Source checks

26 file sources were checked against the files under `../..` (from the graph's folder). Each file is there, and each cited line is in the file.
23 cited lines were compared with the words of their claims.
No source warnings.

## To confirm

These have no source, so they are drawn dashed. Ask the reader to confirm them, or find a source.

- Arrow "You confirm the dashed claims" → "Pin the reader's question" (a new question)

## Sources

| Claim | Source |
|---|---|
| Box "You ask for a graph" | SKILL.md:3 |
| Box "Pin the reader's question" | SKILL.md:31 |
| Box "Collect claims and sources" | SKILL.md:33 |
| Box "The graph file" | SKILL.md:37; references/graph-format.md:3 |
| Box "Any errors?" | scripts/flowmap.mjs:97; scripts/lib/graph.mjs, validate(); scripts/lib/sources.mjs, checkSources() |
| Box "Check the flow and rules" | scripts/flowmap.mjs:101 |
| Box "Mermaid text" | scripts/flowmap.mjs:103 |
| Box "Pele draws the SVG" | scripts/lib/render.mjs:1 |
| Box "Report: warnings, claims to confirm" | scripts/flowmap.mjs, buildReport() |
| Box "Look at the image" | SKILL.md:56 |
| Box "You confirm the dashed claims" | SKILL.md:63 |
| Arrow "You ask for a graph" → "Pin the reader's question" | SKILL.md:31 |
| Arrow "Pin the reader's question" → "Collect claims and sources" (reads the real material) | SKILL.md:33 |
| Arrow "Collect claims and sources" → "The graph file" (writes) | SKILL.md:37 |
| Arrow "Any errors?" → "The graph file" (yes: fix them) | SKILL.md:48 |
| Arrow "The graph file" → "Any errors?" (runs the command) | SKILL.md:48 |
| Arrow "Any errors?" → "Check the flow and rules" (no) | scripts/flowmap.mjs:101 |
| Arrow "Check the flow and rules" → "Mermaid text" (marks broken paths red) | scripts/lib/graph.mjs:287-288 |
| Arrow "Mermaid text" → "Pele draws the SVG" (renders) | scripts/flowmap.mjs:111 |
| Arrow "Pele draws the SVG" → "Report: warnings, claims to confirm" (counts boxes and arrows) | scripts/flowmap.mjs:158 |
| Arrow "Report: warnings, claims to confirm" → "Look at the image" (renders a PNG) | SKILL.md:56 |
| Arrow "Look at the image" → "The graph file" (reads badly: change it) | SKILL.md:56 |
| Arrow "Look at the image" → "You confirm the dashed claims" (hands off) | SKILL.md:60 |

## Files

- `flowmap.html`
- `flowmap.mmd`
- `flowmap.svg`
- `flowmap.png`
- `flowmap.report.md`
