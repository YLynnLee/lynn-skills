---
name: reference-to-style
description: Use when the user shares design references (screenshot, website, Pinterest pin, Figma frame, game UI, drawing, moodboard) and wants a UI style defined from them, says "in the style of" or "get inspired by", or says a design copies a reference too closely, feels generic, or doesn't fit the subject.
license: MIT
compatibility: Needs Python 3.9+ with Pillow and numpy. Node 18+ with Playwright and Chromium is needed for live-site references and for verifying the board; without it, image references still work and the board is reported as unverified.
---

# Reference to style

Turns references into a style for the whole site, shown on a visual board (`board.html`) and backed by a measured style guide (`style.md`). The look comes from the references; the content comes from the subject. The skill only defines the style: it never changes the app or site.

**Align the style once, before any page changes.** The guide is the source of truth: build every visual from it, and put every correction into it first, so nothing built from it can drift from what you saw on the board.

**Measure, don't eyeball.** Vision is good at seeing what a reference does and poor at exact colours, sizes and spacing. Every value a reference shows comes from `scripts/measure.py` (anything else is derived from those or chosen, and says so), and every board sample is rendered and measured the same way by `scripts/verify.py` until it matches. The board stays visual; the numbers live in the guide and the report.

**Start quiet, then tune.** A reference is its style at full concentration, and spreading every trait over every element can overdo it. So the first pass uses each distinctive trait only where it does the most work, at its measured values, and the user turns single traits up or down at the review. Strength changes where a trait appears, never its measured values.

## When not to use

- The user wants an exact match to their own Figma frame. Build the frame.
- The project already has its style. Roll it out instead (with `apply-everywhere`, if installed).

## Requires

Before step 1, run `python3 <this skill>/scripts/doctor.py` (on Windows, `py -3` in place of `python3` throughout). It checks every dependency and prints the exact install command for each missing one.

- **Exit 0:** ready.
- **Exit 1:** Python packages are missing. Show the user the printed commands and wait; nothing can be measured without them.
- **Exit 2:** the browser can't run. Offer the printed install commands. If the user can't install it, carry on with image references only (ask for screenshots of live sites), run `check.py` with `--unverified`, and say at the review that the board's accuracy is not proven.

## Decisions

Make every decision the run needs yourself, and stop once: at the board. The board shows the user the whole style at a glance, so they judge it there, not as a list of questions up front.

- **Decide, don't ask:** which traits to take and leave, the starting strength of each, the style name and slug, the subject list, the direction when the references agree, and how to steer clear of an existing style. Record each choice in the guide (a `chosen:` source or a Take/Leave row), so it can be changed later.
- **Ask early only when you can't go on:** a reference won't load or is only a thumbnail, a dependency is missing, or the references point to opposite directions (such as pale drafting paper and dark blueprint) that neither they nor the project settle. Then ask one short question with the options, your pick first, and nothing else.
- **Keep the stop short.** Numbers live in the guide and `verify.md`, so the message carries no tables or measurements. End it with this block, then wait:

> ## Your input needed: anything to change?
> **Board:** `<path to board.html>` · **Accuracy:** 35 of 35 measurements match (`verify.md`)
> **Decided for you:** name and slug; the main traits taken and left; the direction, if there was a choice
> **Started quiet:** each quiet trait and where it appears, in a few words
> 1. Turn a trait up or down: name it, such as "more of the grid" or "less red"
> 2. Change something else: say what
> 3. Nothing: the style is saved as it is
>
> **Using it:** the style is saved in `design/styles/<slug>/`. Name it when you want it used, such as "apply `<slug>` everywhere". The app or site doesn't change.

With a question tool, ask it there too, starting with "Your input needed". Nothing needs approving: every saved style is ready to use, and the user picks one by name later.

## Steps

1. **See the references, then measure them.** Open each one: scroll live sites and watch their motion. If one won't load or is only a thumbnail, ask for a screenshot. Never work from a title or URL. Save a screenshot of each one for `references/`, and note any motion you saw. Prefer PNG: JPEG greys out thin coloured lines.

   Then read `references/measure.md` and measure one crop per trait you might take (a heading, a button, a rule, a patch of background), all in one run.

2. **Read the project.** Do this before choosing a style, so the direction already fits:
   - Read `design/styles/index.md` if it exists, so the new style doesn't clash with earlier ones, and note which slugs are taken.
   - List 4–8 real objects, materials, processes, measurements or places, each with its source. Start from the index's shared subject list. Use real things, not symbols of the topic, and leave out anything you can't source.
   - Find the site's tokens (CSS custom properties, framework classes, or Webflow variables) and every component type in use, such as headings, buttons, cards, figures, list rows, navigation and forms, with where each one lives. The guide restyles their look; their content and structure stay.

3. **Read the style.** With several references, read what they share. Tie each trait to the crop that shows it; that evidence goes in the guide, not the chat.

   | Take: the style | Leave: what belongs to one reference |
   |---|---|
   | Palette, type character, line and shape, surface, density, rhythm, hierarchy, motion | Assets, logos, copy, exact page layouts, one-off details |

   Give each Take trait a strength, written in the guide's Strength column:

   | Strength | Where the trait appears | Used for |
   |---|---|---|
   | `quiet` | Only the 1–3 places it does the most work, named | The start for every distinctive trait (an accent colour, a display face, a texture, a motif) |
   | `full` | Every component it fits | The start only for what every page needs: the page surface, the text colour, and traits that set no mood (such as square corners) |
   | `strong` | Every component it fits, and given more room: more area, a feature use | Only when the user asks for more |

   Turning a quiet trait down means moving it to the Leave column.

   Decide the style yourself (see Decisions): choose the traits, a name whose slug isn't taken (unless the user asked to revise that style), and a direction that doesn't clash with an existing style. Don't stop here unless the references conflict in a way nothing settles.

4. **Write the guide.** Every run gets its own folder, so no run overwrites another:

   ```
   design/styles/
     index.md              every style, where it applies, shared subject list
     <slug>/
       style.md            the guide
       board.html          the visual check
       measured.json       what measure.py read from the references
       verify.md           how closely the board matches them
       references/         reference screenshots
   ```

   Copy `assets/style.md` from this skill to `style.md` and fill it in. Keep every heading, in order, and write `None` for an empty section, so all guides read the same. Write values exactly (hex, px, font names), so another session can rebuild the style without the references.
   - **Evidence:** one row per measured crop, numbers copied from `measure.py`'s output.
   - **Tokens:** every token says where it came from: `crop:<name>` (the value is measured there; a colour must match that crop's reading or its `likely` value), `derived: <rule>` (built from measured tokens, such as a hover tone or a text colour darkened to 4.5:1), or `chosen: <reason>` for what no reference shows, such as states and body type. Sizes come from measurements too: font size is the cap height (the ink height of a type crop of capitals) ÷ the font's cap height ratio. Every rule names a real subject source and uses nothing from the Leave column. Prefix every token with `--<slug>-`, so styles can share a page without clashing.
   - **Components:** give each component type a property table (property, then token or exact value, for every state), so it can be rebuilt without guessing. Use tokens wherever one exists. Follow each trait's strength: a component outside a quiet trait's named places uses the style's plainer tokens instead, such as the body face or the ink colour.
   - **Mapping:** map every existing token, class or variable from step 2, and every component type, to its new token or component spec. This is what `apply-everywhere` rolls out, so leave nothing in the project unmapped: write `Keep` or `Drop` with a reason where nothing replaces it.

5. **Show the style, then iterate.** Read `references/board.md`, copy `assets/board.html` as a file copy (not by retyping it) and fill in its placeholders from the guide alone: every component type with states, a Styles section, one very small real section, and motion, each tagged with `data-crop` for the crop it came from. Then verify it against the references and check it against the guide, and fix every failure yourself, for at most three rounds:

   ```
   python3 <this skill>/scripts/verify.py design/styles/<slug>
   python3 <this skill>/scripts/check.py design/styles/<slug>
   ```

   Open the board in the user's browser and give the paths to `board.html` and `verify.md`.

   Then add the style and any new subject items to `design/styles/index.md`, creating it from `assets/index.md` if needed. `design/styles/` is the only place in the project this skill changes.

   **Stop for the review** with the block from Decisions: anything to change? Accuracy is shown by `verify.md`, along with anything still failing after three rounds, so the user judges direction and strength only. For each round of feedback, update the guide, rebuild only the affected parts of the board, then run verify and the check once and fix what they report for at most three rounds without undoing the user's changes. Update the index if the name or subject list changed, reopen the board and ask again. Every round ends measured, so the saved style is always accurate, whenever the user stops. To turn a trait up or down, change its Strength (write `(user feedback)` after it) and the components it reaches; values stay measured, so this needs no `data-accept`. If the user wants a trait bolder than the reference itself (larger, heavier, more saturated), that changes a value: treat it as below. A change the user asks for is on purpose even when it moves away from a reference: give the token `chosen: user feedback` and mark its sample `data-accept` with the same reason, so verify reports it as on purpose instead of failing it, and never undo it to make verify pass. If the user rejects the direction itself rather than details, don't patch tokens: go back to step 3, re-read the references, choose a new direction, rebuild and stop for the review again.

   The run ends when the user has nothing to change or moves on to something else. There is no approval step. To use the style later, the user names it: `apply-everywhere` (if installed) rolls it out from the guide's Mapping section, or the Mapping works as a checklist on its own.

## Example

Read `examples/drafting-sheet/style.md` and `verify.md`; the JSON files and `board.html` are generated output, worth opening only to see the `data-crop` tags. `examples/drafting-sheet/` is a finished run: a drawing-sheet reference measured into eight crops, the guide, and a board whose 36 measurements match (one on purpose).

References: technical drawings and blueprints, for a site about a growing wheel.

- **Take:** thin precise linework, ruled grids, small technical labels, dense annotation.
- **Leave:** each drawing's title block, parts and sheet layout.
- **Subject:** a 5.5 m growing wheel, real rig dimensions, engineering drawings.
- **Rule:** blueprint dimension lines + real rig dimensions = figures annotated with their measured values.
