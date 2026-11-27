# Graph format

A flowmap graph is a JSON file. The command checks it, writes it as a Mermaid flowchart, and renders it with Pele.

```json
{
  "title": "How an order gets from the cart to a receipt",
  "direction": "LR",
  "root": "/Users/me/shop",
  "leavesOut": ["Refunds, which start from the admin page", "Retries when the card network is down"],
  "rules": [
    { "says": "No receipt goes out unless the card is accepted", "to": "email", "through": "check" }
  ],
  "groups": {
    "shop": { "label": "In the shop", "color": "blue" },
    "pay": { "label": "Payment", "color": "orange" },
    "card": { "label": "Card check", "parent": "pay" }
  },
  "nodes": [
    { "id": "cart", "label": "You open the cart", "shape": "stadium", "group": "shop", "source": "src/cart.ts:12" },
    { "id": "check", "label": "Card accepted?", "shape": "decision", "group": "card", "source": "src/pay.ts:40" },
    { "id": "orders", "label": "Orders", "shape": "database", "source": ["src/db/schema.sql:8", "docs/data.md#orders"] },
    { "id": "email", "label": "Receipt email" }
  ],
  "edges": [
    { "from": "cart", "to": "check", "label": "you press pay", "source": "src/cart.ts:58" },
    { "from": "check", "to": "orders", "label": "yes", "style": "thick", "source": "src/pay.ts:44" },
    { "from": "orders", "to": "email", "label": "sends the receipt" }
  ]
}
```

In this graph, the box "Receipt email" and the arrow "sends the receipt" have no `source`. They are drawn dashed and listed under "To confirm" in the report.

## Fields

### Top level

| Field | Required | Value |
|---|---|---|
| `title` | no | Text shown at the top of the graph. Usually the question it answers. |
| `direction` | no | `LR`, `RL`, `TD`, `TB` or `BT`. The default is `TD`. |
| `root` | no | The folder that file sources start from, absolute or relative to the graph file. `--root` overrides it. The default is the folder the command runs in. |
| `leavesOut` | no, but warned | What a reader might expect that the graph does not show, as text or a list. It goes in the report and the page. |
| `rules` | no | Promises about the flow, checked against every path. See [Rule](#rule). |
| `flows` | no, but warned | Named journeys through the graph, listed in the HTML page's Flows rail, with Highlight / Solo and step-through. See [Flow](#flow). |
| `groups` | no | An object of groups, keyed by group id. |
| `nodes` | yes | A non-empty list of boxes. Pele lays them out in this order. A group is drawn whole, where its first box is listed. |
| `edges` | no | A list of arrows. |

### Group

| Field | Required | Value |
|---|---|---|
| `label` | no | Text on the group's frame. The default is the group id. |
| `color` | no | `blue`, `teal`, `green`, `yellow`, `orange`, `pink`, `purple` or `gray`. Boxes in the group take this color. |
| `parent` | no | The id of the group that holds this group. Groups can nest. |

### Node (a box)

| Field | Required | Value |
|---|---|---|
| `id` | yes | A unique id, used in `edges`. Any text. The command turns it into a Mermaid-safe id. |
| `label` | yes | The text in the box. A `\n` in the text starts a new line. |
| `shape` | no | `box` (the default), `round`, `stadium`, `decision`, `database`, `hexagon`, `circle`, `subroutine` or `flag`. |
| `group` | no | The id of the group that holds the box. |
| `color` | no | A color, as for groups. It wins over the group's color. |
| `source` | no | Where the claim comes from, as text or a list of text, such as `src/a.ts:12`, a URL, `README.md#install` or `user said`. With no source, the box is drawn dashed. |

### Edge (an arrow)

| Field | Required | Value |
|---|---|---|
| `from`, `to` | yes | Node ids. |
| `label` | no | What happens, as a short verb phrase. |
| `style` | no | `solid` (the default) or `thick`, for the main path. Dotted arrows are kept for claims with no source. |
| `source` | no | As for nodes. With no source, the arrow is drawn dotted. |

### Rule

Each rule has `says`, the promise in the reader's words, and exactly one of these:

| Form | Holds when | Broken shows |
|---|---|---|
| `"to": B, "through": C` | Every path to B passes C. | The shortest path to B that skips C. |
| `"never": B` | No path reaches B. | The shortest path to B. |
| `"reaches": B` | Some path reaches B. | That nothing does. |

`from` names the box the paths start at. Without it, they start at every box no arrow points to. On a broken path, the failing box is marked red (`breaks`) and its arrows red; if the path uses an unsourced box or arrow, the failing box and arrows are marked orange (`mayBreak`) instead, and the report says so, because the break may come from a guess. Leading boxes on a broken path get a blue border (`bugPath`).

A `through` rule about a box that no path reaches says nothing, so the report marks it `?` ("cannot check") rather than ✓. Add the arrow in, or fix `from`. So does a rule whose `to` and `through` are the same box, since every path to a box passes it.

The rules are checked against the graph, not the system. A rule that holds is only as true as the graph's arrows.

### Flow

Named journeys that the reader can toggle in the HTML viewer (either **Highlight**, which dims the rest of the full graph, or **Solo**, which redraws just that flow by itself). Each flow has `label` (required), optional `note`, and either:

| Field | Value |
|---|---|
| `steps` | Ordered list of at least 2 node ids (`["cart", "check", "orders", "email"]`). Every consecutive pair must have an arrow in `edges`. |
| `nodes` | List of at least 2 node ids for a branching sub-flow; highlights all arrows between those boxes. |

Write one flow for the main path and one for each branch a reader would ask about. A graph with more than 12 arrows and two or more decisions, and no `flows`, gets a warning, since its page has no Flows rail.

## Sources

A source that names a file is checked against the files under `root`. These forms name a file:
- `path`
- `path:12` and `path:12-18`
- `path#heading`
- `path, detail`, such as `scripts/a.mjs, main()` or `SKILL.md, step 2`

A path needs an extension or a slash, or it reads as a note. A bare name, such as `Makefile` or `Dockerfile:3`, and a path with spaces, such as `docs/My notes.md:3`, name a file only when that file is under `root`.

Cite a line, a range, a `#heading` or a `name()`. A claim whose file sources are all whole files, or `path, note` such as `SKILL.md, step 2`, gets a warning, because nothing checks that the file says the claim.

The words of a cited line are compared with the claim: a box's label, or an arrow's label. An arrow with no label, or one that only names a branch (`yes`, `no`, `true`, `false`, `else`, `ok`), is compared with the labels of the boxes it joins.

This is a plausibility check. One shared word is enough to pass, so it catches a wrong path or a line number that has drifted, but not a line that uses the same word to say something else: `const config = ...` passes for "User confirms the order". Read each line you cite.

When the claim and the cited line are in different writing systems, such as a Korean label citing English code, the words cannot be compared. The command checks the line is there, skips the word check, and the report lists the source under "Line checked, words not compared". A label that mixes the two, such as "Webflow 페이지", is still compared on its English word.

URLs and notes such as `user said` cannot be checked. The report lists them, so the reader knows which claims rest on trust.

## Checks

**Errors** stop the render:
- A missing or repeated id.
- An edge to a node that does not exist.
- An unknown shape, color, direction or style.
- A group that is missing, or that is inside itself.
- A malformed `source`.
- A source file that is not under `root`.
- A cited line 0, a line past the end of the file, or a range that runs backwards.
- A rule with no `says`, with no form or two forms, or with a box that does not exist.
- A flow with no `label`, neither or both of `steps`/`nodes`, fewer than 2 nodes, an unknown node, or a `steps` pair with no arrow between them.

**Warnings** are printed and written to the report:
- A cited line, or a range of up to 40 lines, that shares no word with its claim. Words match whole, so "art" does not meet "start". `camelCase` and `snake_case` are split, plurals and `-ed`/`-ing` forms match, and stop words are ignored. The path does not count, except that a `SKILL.md` counts its skill's folder name.
- A claim whose file sources have no line, `#heading` or `name()`.
- A `#heading` the Markdown file does not have, or a `name()` the file does not mention.
- A graph with more than 12 arrows and two or more decisions, and no `flows`.
- A cited `SKILL.md` that mentions `/sibling-skill` (a folder next to it with a `SKILL.md`) that is in neither a box label nor `leavesOut`.
- Boxes that nothing reaches from where the flow starts.
- A `decision` with one way out, or none.
- A dead end: a box with no way out that is not a `stadium`, `database` or `circle`. This is only checked when the graph has a `stadium`, because a map of parts has leaves.
- Boxes that can loop forever, with no path to an end: a box with no way out, a `stadium` or a `circle`. A graph with none of these is a map of parts, and its loops are not checked.
- A broken rule, or one that cannot be checked.
- A drawing more than 4 times as wide as it is tall, or as tall as it is wide.
- No `leavesOut`.
- More arrows than `--max-edges`, which is 20 by default.
- A box with no arrows.
- A box label longer than 40 characters, or an arrow label longer than 32.
- A label that reads as a code name (`camelCase`, `snake_case` or `call()`).
- Two boxes with the same label.
- An arrow drawn twice.
- More than six colors.
- An empty group.

## Output

`NAME.html` is the one file written by default. `--all` also keeps `NAME.mmd`, `NAME.svg` and `NAME.report.md` next to it; the report is always printed.

`NAME.mmd` (with `--all`) is plain Mermaid, so GitHub, Obsidian and other Mermaid viewers can show it. They do not get the full theme, but `classDef` fallbacks are included for the marks it uses, so guesses and broken rules still show up. It has:
- one `class` line for each color, such as `class n_cart,n_check blue`;
- `classDef` and `class ... assumed` for boxes with no source;
- `-.->` for arrows with no source;
- `classDef` and `class ... breaks` (or `mayBreak` if a guess is on the path) for the failing box, `bugPath` for leading boxes on the path, and a red or orange `linkStyle` for its arrows.

`NAME.html` is a standalone page. It mounts the Mermaid with Pele, which is inlined, for zoom and pan, so it works offline, at about 850 KB.
- **Size:** the drawing opens at a readable size, never shrunk below 80% of its natural size, so labels stay about 13px. A bigger graph scrolls, starting from its top left, and "Fit whole graph" shrinks it to the canvas's width and height.
- **Side panel:** each box and arrow maps to its claim, so a click shows its source, or that it has none, and Esc clears it. Clicking a rule or a claim to confirm lights it up and scrolls it into view. The header keeps the title and status chips (rules, claims to confirm) in view. The rules, the claims to confirm, what the graph leaves out, and the legend are sections that fold.
- **Panel size:** the panel closes (the "Details" button on the canvas brings it back, with a count of broken rules, else rules that may break, else claims to confirm), widens with its expand button, and resizes by dragging its edge or with the arrow keys. The browser remembers the width and whether it is open. Below 900px wide, the panel sits under the canvas.
- **Legend:** it lists only the marks and shapes the graph uses.
- **Order:** the selection card, then the rules, the claims to confirm, what the graph leaves out, and the legend with how to pan and zoom.
- **Theme:** the page uses the same theme CSS as the SVG, and hides the drawing's title, which the panel already shows.

The sources table is only in the report.

`NAME.svg` (with `--all`) carries `assets/theme.css` in a `<style>` element. It follows the viewer's light or dark setting. Pass `--css FILE` to use your own theme, or `--no-theme` to leave the theme out. Pele's variables are listed at https://pele.run/theming.

`NAME.png` (with `--png`) is the SVG at 2x, for looking at the layout. It goes to `flowmap/` in the system's temp folder, or next to the page with `--all`. It is light unless `--dark`, padded with the theme's background. The command uses Playwright when it can load it, from the skill folder or from `~/.cache/flowmap` (`$FLOWMAP_PLAYWRIGHT_DIR`). Otherwise it uses Chrome or Chromium on the computer, or Edge on Windows (`$FLOWMAP_CHROME` to name one). With neither, the report says `No PNG`.
