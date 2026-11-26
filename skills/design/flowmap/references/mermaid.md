# Other Mermaid diagrams

A flowchart fits most subjects. Use another type only when the subject has that shape. Pele 1.13 renders every diagram type that Mermaid 12.1 has, and some more. See https://pele.run for the syntax of each.

| The subject is… | Use | First line |
|---|---|---|
| Things and how they connect or flow | the graph format (`graph-format.md`) | — |
| Messages between parties over time | sequence | `sequenceDiagram` |
| States and the steps between them | state | `stateDiagram-v2` |
| A tree of ideas around one topic | mindmap | `mindmap` |
| Stored data and its relations | entity relation | `erDiagram` |
| Types and their members | class | `classDiagram` |
| Events in order | timeline | `timeline` |
| Work across people or teams | swimlane | `swimlane-beta` |
| Causes of one effect | ishikawa | `ishikawa` |
| Amounts that flow between things | sankey | `sankey` |
| Work over calendar time | gantt | `gantt` |

To check a model of a system that changes state, and show its bugs as paths, use a model checker, such as the statechart skill that inspired this one: https://github.com/cursor/plugins/tree/main/pstack/skills/statechart.

## Writing `.mmd` directly

- Give the file to the same command: `node <this skill>/scripts/flowmap.mjs diagram.mmd --png`. It renders the file into a page and reports its size. It cannot check sources, so say in the hand-off which parts you read and which you assumed.
- Quote labels that hold punctuation, such as `A["Pay (card)"]`. In quoted labels, write `#quot;` for `"` and `#35;` for `#`.
- Do not use the word `end` as a node id in a flowchart. Mermaid reads it as the end of a subgraph.
- Pele ignores `%%{init: {theme: ...}}%%` and `themeVariables`. Colors come from the CSS in `assets/theme.css`. A `classDef` color is written as a `style` attribute, which wins over the theme in both light and dark mode. So use `class X teal` with the theme colors rather than `classDef`.
- When Pele fails, it throws `PeleError` with `code` (`syntax`, `semantic`, `unsupported-diagram` or `limit`), `line`, `column` and a `snippet`. The command prints them. Fix that line.
