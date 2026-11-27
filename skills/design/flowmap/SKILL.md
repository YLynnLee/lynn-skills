---
name: flowmap
description: "Map how a codebase, system, process, decision or document flows or connects, as a diagram where every box and arrow is traced to its source (a file and line, a URL, a doc section or the user's word) and guesses are drawn dashed for the reader to confirm. It checks promises such as \"nothing ships without review\" against every path and draws a path that breaks one in red. The output is an HTML page that shows the source of whatever the reader clicks, and Mermaid on request. Use for /flowmap, or when the user asks to map, graph, diagram, draw or visualize how something works, connects or flows: an architecture, a request or data flow, a pipeline, a user journey, a decision, or how services, modules or skills hand off to each other; or wants a flow checked for gaps or bugs. Not for charts of numbers, for designing UI, or for a quick sketch nobody will check, where a Mermaid block in the reply is enough."
license: MIT
compatibility: "Needs an agent that can run shell commands, and Node 20 or later. The Pele renderer ships in vendor/pele/, so nothing else is installed. Chrome, Chromium, Edge or Playwright are optional, for PNG previews of the layout."
---

# Flowmap

A flowmap answers one question for one reader. Each box and each arrow is a claim. A claim with a source is drawn solid. A claim with no source is drawn dashed, and the hand-off asks the reader to confirm it. The reader decides whether the graph is right, so it uses their words.

Use it when the reader will rely on the graph or check it. For a quick sketch, such as an idea to talk through or a picture the user will look at once, write a Mermaid flowchart in the reply instead, and offer a traced flowmap if they want one.

## Run

Before the first run, run `node <this skill>/scripts/doctor.mjs`. It prints `OK` or `MISSING` for Node and the skill's own files, with the fix for anything missing. Pele, the renderer, ships with the skill, so there is nothing to install but Node. Its note about PNG previews is optional.

Work in the session's scratch folder if the host gives one, else in a temporary folder outside the repo, unless the user wants the files in the repo. Write a graph file, then run:

```sh
node <this skill>/scripts/flowmap.mjs GRAPH.json [--out DIR] [--root DIR] [--png] [--all] [--dark] [--max-edges N]
```

It checks the graph, then writes one file, `GRAPH.html`: the graph rendered with Pele, light and dark built in, on a page that shows the source of whatever the reader clicks. It prints the report rather than writing it. `--png` writes a 2x PNG to a temp folder for you to look at the layout, and prints its path. `--all` also keeps `GRAPH.svg`, `GRAPH.mmd`, `GRAPH.report.md` and the PNG next to the page; use it only when the user wants those files. It exits 1 on an error and prints what to fix.

The command checks three things:
- **Sources.** Each file source must exist under `root`, and each cited line must be in the file. A cited line that shares no word with its claim is a warning, and so is a file source with no line, `#heading` or `name()`. The word check is a plausibility check: one shared word passes, so it catches a wrong file or line number, not a line that says something else. Read each line you cite. URLs and notes cannot be checked, and the report lists them as such.
- **Flow.** It warns about boxes that nothing reaches, decisions with fewer than two ways out, dead ends, and loops with no way out.
- **Rules.** Each rule in `rules` is checked against every path in the graph. A broken rule comes with the shortest path that breaks it: the failing box is marked red (`breaks`) or orange (`mayBreak` if the path uses an unsourced claim), and the leading boxes on the path get a blue border (`bugPath`).

## Steps

1. **Pin the question.** Name the reader and the one question the graph answers, such as "How does an order get from the cart to a receipt?". Set where it starts and where it stops. If the user gave only a topic, pick the question yourself and say it in the hand-off. Ask only when two readings would give different graphs.

2. **Collect the claims.** Read the real material: the code, the docs, the URL, the conversation. For each box and arrow, note where it came from: `src/cart.ts:40`, a URL, a doc section, or `user said`. Cite the line that says it, as `path:12`, `path:12-18`, `path#heading` or `path, name()`, since the command compares the cited words with the claim. Draw only what you have read. When you cannot find a source, keep the claim only if the reader needs it, and leave its `source` out. It is then drawn dashed.

3. **Pick the form.** A flowchart covers most subjects: things, and how they connect or what moves between them. If the subject has another clear shape, such as messages over time or a strict hierarchy, use that Mermaid type instead (`references/mermaid.md`). Write that diagram as `.mmd` and give it to the same command, which renders it but cannot check its sources. Say so in the hand-off, and give a short table there of each part and where it came from, so the reader can still trace every claim.

4. **Write the graph.** Use the format in `references/graph-format.md`.
   - Label each box with what the reader calls it, such as "Payment service" or "You review the guide", in the reader's language. Keep code names out, unless the reader will look for that name in the code.
   - Label each arrow with what happens, as a short verb phrase, such as "sends the order" or "fails twice". Leave the label out only when the arrow is obvious.
   - Use groups for phases, layers or owners. Give each group a color only when the color means something, such as "writes to production". Use six colors or fewer.
   - Use `LR` for flows and pipelines and `TD` for hierarchies and decisions.
   - Use `decision` for a branch, `database` for stored data, `stadium` for a start or end, and `box` for the rest.
   - Set `root` to the folder the file sources start from, relative to the graph file. The graph usually sits in a scratch folder, so this is usually an absolute path to the repo.
   - Write `leavesOut`: what a reader might expect in the graph that is not there, and why. Every graph has limits, and the page carries them, so a reader who finds it later knows them.
   - Write `rules` when the subject has promises that matter, such as "nothing reaches production without review" or "a failed payment never sends a receipt". Take them from the material or the user, in the reader's words. Skip rules for a map of parts with no flow.
   - Write `flows` whenever a reader could take more than one path through the graph, such as "Happy path" and "Leave mid-deck": one for the main path, and one for each branch a reader would ask about. Use `steps` for a path in order and `nodes` for a part with branches. The HTML page lists them in a Flows rail on the left, where the reader picks one, highlights it inside the whole graph or views it solo, and steps through it. Without `flows` the page has no rail, and the command warns when a graph with more than 12 arrows and two decisions has none.

5. **Run the command and read the report.** Run it without `--png` while you fix things, since that is fast. Fix every error, and fix each warning or say in the hand-off why it stays.
   - When a cited line shares no words with its claim, find the line that does say it and cite that, or drop the source so the claim stays dashed. Keep the label in the reader's words.
   - A broken rule is a finding. Trace every box and arrow on its path against the real material, one step at a time. Assume the graph is wrong until you verify each step. If the path is real, keep every arrow on it and report the break to the user as a likely bug. If it uses an unsourced claim (drawn orange as `mayBreak`), confirm that claim first. Never weaken or drop a rule to make it hold.
   - A rule that cannot be checked is about a box nothing reaches. Add the missing arrow, or fix the rule's `from`.
   - Aim for about 20 arrows or fewer. When the graph is busier, merge boxes that act the same for this reader, drop detail the reader does not need, or split it into an overview and a close-up. When every arrow belongs on the graph, keep them and name the journeys in `flows`, so the reader can trace one at a time. When you simplify, keep every broken-rule path intact, do not merge boxes that break different rules, keep remaining boxes connected, and name what you dropped in `leavesOut`.

   The step is done when the report has no errors and each warning is fixed or explained.

6. **Look at it.** Run with `--png` and read the PNG at the path the command prints. Look for arrows that cross for no reason, labels that collide, a reading order that jumps back and forth, and a drawing much wider or taller than a screen (the report warns). Change the direction, the order of the nodes, or the grouping, then render again. Pele lays boxes out in the order `nodes` lists them, and draws each group whole where its first box is listed. So a group that holds both where the flow starts and where it ends, such as "On your phone", pulls the ends up beside the starts and sends arrows back up the page; group by phase instead, or leave the ends out of the group. When the graph has `flows`, open each one in the rail and check that it lights up the whole journey it names. The step is done when no reorder would remove a crossing and no labels collide, or after three renders, when you say in the hand-off what still reads badly.
   - The command makes the PNG with Playwright if it is installed, else with Chrome or Chromium on the computer (or Edge, on Windows). When it prints `No PNG`, open the HTML page with a browser tool if you have one.
   - With no browser tool, ask the user before installing Playwright, since it downloads a browser: `npm install --prefix ~/.cache/flowmap playwright && npx --prefix ~/.cache/flowmap playwright install chromium`. If they decline, say in the hand-off that nobody has looked at the layout.

7. **Hand off.** Findings first, then files. Leave out any item below that is empty.
   - Say the question that the graph answers.
   - Give each rule with ✓, ✗ or ?. For each broken rule, give its path in one line, say which box breaks which rule when more than one rule breaks, and say whether you verified each step against the real material.
   - List each dashed claim from the report's "To confirm" section, so that the reader can confirm it or correct it.
   - Name the flows in the page's Flows rail, so the reader knows which journeys to pick.
   - Give the path to the HTML page, the one file to open. If the host can publish an HTML page as a link, offer to publish it.
   - List the sources the command could not check: URLs, notes, and lines whose words it did not compare because they are in another language than the claim.
   - Say what the graph leaves out, from `leavesOut`.
   - Give the command that renders it again.
   - When the reader will paste the graph somewhere, such as a README or an issue, run with `--all` and give the Mermaid text from `GRAPH.mmd` as a `mermaid` code block.

8. **Take the reader's answers.** When the reader confirms a dashed claim, set its `source` to `user said`, or to the line they point to, so it is drawn solid. When they correct a claim, change the graph to match. Render again and hand off what changed. The loop ends when "To confirm" is empty or the reader stops.

## Rules

- Give a claim only a source that says it. A claim keeps its dashed style until a source is found or the reader confirms it.
- Never weaken or drop a rule in `rules` to make it hold. Fix the graph if it is wrong, or report the break.
- Draw the boxes and arrows the question needs and the material supports, and only those.
- Render with Pele, unless the user asks for another renderer. Pele ignores Mermaid's `theme` and `themeVariables`; `assets/theme.css` sets the colors.
- When Pele reports an error in a `.mmd` file, it gives the line and column. Fix that line and keep the rest of the diagram.
