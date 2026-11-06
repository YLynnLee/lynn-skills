# reference-to-style

Turns design references (screenshots, live sites, Pinterest pins, Figma frames, game UI, drawings, moodboards) into a measured style for your site. You get a visual board you can open in a browser, backed by a written style guide. The style comes from the references without copying them.

Skill: [`skills/design/reference-to-style/SKILL.md`](../../skills/design/reference-to-style/SKILL.md) · Model-invoked · MIT

## What it does

It never touches your app. It writes a style guide (`style.md`) and a one-page visual board (`board.html`) into `design/styles/<slug>/`, makes the early calls itself, and stops once, at the board, so you can tweak it. Nothing needs approving: every saved style is ready, and you name the one you want when you use it.

**Measured, not eyeballed.** Vision models see what a reference does but misjudge exact colours, sizes and spacing. So the skill measures crops of each reference with scripts. It then renders the board in a headless browser, measures it the same way, and fixes it until the two match. `verify.md` shows the numbers, so you only judge the direction and how strong each trait is.

**Starts quiet.** The first board uses each distinctive trait only where it does the most work, so the style doesn't overwhelm the site. At the review you turn single traits up or down ("more of the grid", "less red"). The measured values stay the same; only where each trait appears changes.

What it writes:

```
design/styles/
  index.md            every style in the project, and a shared list of real subject material
  <slug>/
    style.md          the guide: evidence, tokens with sources, style rules, components, mapping to your code
    board.html        styles, components with states, one small real section, motion
    measured.json     what the scripts read from the references
    verify.md         how closely the board matches the references, crop by crop
    references/       the reference screenshots and crops
```

[`examples/drafting-sheet/`](../../skills/design/reference-to-style/examples/drafting-sheet/) is a finished run. Start with its `style.md` and `verify.md`.

## When to reach for it

- You have references and want a style defined from them: "make it in the style of this", "get inspired by these".
- A design copies a reference too closely, feels generic, or doesn't fit its subject.

Not when you want an exact build of your own Figma frame (build the frame), or when the project already has its style (roll it out instead, for example with `apply-everywhere`).

## Setup

Install the collection for your agent (see [Install](../../README.md#install)), or just this skill:

```bash
npx skills@latest add YLynnLee/lynn-skills --skill reference-to-style
```

Then install its dependencies, inside the skill folder:

| What | Needed for | Install |
|---|---|---|
| Python 3.9+, Pillow, numpy | Everything | `python3 -m pip install -r requirements.txt` |
| Node 18+, Playwright, Chromium | Live-site references and verifying the board | `npm install` then `npx playwright install chromium` |

```bash
python3 scripts/doctor.py
```

`doctor.py` prints `OK` or `MISSING` for each dependency, with the exact fix. The skill runs it before every run too. Without Node or Playwright it still works from image references, but tells you the board is unverified.

## Common questions

**Does it change my site?** No. `design/styles/` is the only place it writes. The guide's Mapping section lists every token and component in your project and what each becomes; roll it out with `apply-everywhere`, or use the Mapping as a checklist.

**Can I keep several styles?** Yes. Each run gets its own folder and slug, and `index.md` lists them all. Tokens are prefixed with the slug, so styles can share a page.

**Will it copy my references?** It takes the style (palette, type character, line, surface, density, rhythm, motion) and leaves assets, logos, copy and exact layouts. References and crops stay in your project; check that you may use any you save in a public repo.

**It says `Playwright not found`, but I installed it.** Install it inside the skill folder (`npm install`). A global install also works: the scripts look in `npm root -g`. Or set `NODE_PATH` to the folder that contains `playwright`.

**It says `Chromium could not start`.** Run `npx playwright install chromium`. If that download is blocked, set `CHROMIUM_PATH` to an installed Chromium or Chrome.

**pip says `externally-managed-environment`.** (Homebrew Python, recent Debian or Ubuntu.) Make a virtual environment first: `python3 -m venv .venv`, activate it, then install.

**`python3` isn't found on Windows.** Use `py -3` in its place.

**verify reports `font "…" did not load`.** The board's web fonts couldn't download. Fix the network or the font link; don't change sizes to compensate.

## It's working if

- The board opens in your browser and looks like the references' style, applied to your subject, not like a copy of them.
- `verify.md` says every measurement matches, or names each one that differs on purpose.
- Every token in `style.md` names its source: a measured crop, a rule it was derived by, or a stated choice.
- Asking for "more of X" or "less of Y" changes where a trait appears, not its measured values.

## Tests

From the skill folder:

```bash
python3 -m unittest discover -s tests
```

They check the measurements against renders whose true values are known, and run `check.py` and `verify.py` against the example and copies broken on purpose. Browser tests skip when Playwright isn't available. CI runs them on Linux with the oldest and a current Python whenever the skill changes (`.github/workflows/reference-to-style.yml`).
