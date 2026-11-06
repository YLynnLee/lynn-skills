# reference-to-style

An agent skill that turns design references (screenshots, live sites, Figma frames, drawings, moodboards) into a measured style for your site, shown on a visual board you can open in a browser and backed by a written style guide. You get a style that comes from the references without copying them.

It never touches your app. It writes a style guide (`style.md`) and a one-page visual board (`board.html`) into `design/styles/<slug>/`, and makes the early calls itself, stopping at the board so you can tweak it. Nothing needs approving: every saved style is ready, and you name the one you want when you use it.

**Measured, not eyeballed.** Vision models see what a reference does but misjudge exact colours, sizes and spacing. So the skill measures crops of each reference with scripts. It then renders the board in a headless browser, measures it the same way, and fixes it until the two match. `verify.md` shows the numbers, so you only judge the direction and how strong each trait is.

**Starts quiet.** The first board uses each distinctive trait only where it does the most work, so the style doesn't overwhelm the site. At the review you turn single traits up or down ("more of the grid", "less red"). The measured values stay the same; only where each trait appears changes.

## What it produces

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

`examples/drafting-sheet/` is a finished run. Start with its `style.md` and `verify.md`.

## Install

The easiest way is to install the whole collection for your agent (Claude Code, Codex, Copilot, Gemini CLI, Cursor and others): see [Install](../../../README.md#install) in the repo README.

To install just this skill by hand: the skill is the folder holding `SKILL.md` (`skills/design/reference-to-style/` in this repo). Put it where your agent loads skills.

**Claude Code, for all your projects:** clone the repo and link the folder into your skills.

```bash
git clone https://github.com/YLynnLee/lynn-skills ~/lynn-skills
```

```bash
ln -s ~/lynn-skills/skills/design/reference-to-style ~/.claude/skills/reference-to-style
```

**Claude Code, for one project:** link or copy the folder to `.claude/skills/reference-to-style` inside the project.

Other agents that read `SKILL.md` skills work the same way: put the folder in their skills directory, or run `npx skills@latest add YLynnLee/lynn-skills --skill reference-to-style`.

### Dependencies

| What | Needed for | Install |
|---|---|---|
| Python 3.9+, Pillow, numpy | Everything | `python3 -m pip install -r requirements.txt` |
| Node 18+, Playwright, Chromium | Live-site references and verifying the board | `npm install` then `npx playwright install chromium`, both in the skill folder |

Then check:

```bash
python3 scripts/doctor.py
```

It prints `OK` or `MISSING` for each dependency, with the exact fix. Without Node or Playwright, the skill still works from image references, but it tells you the board is unverified.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Playwright not found`, although you installed it | Install it inside the skill folder (`npm install`). A global install also works: the scripts look in `npm root -g`. Or set `NODE_PATH` to the folder that contains `playwright`. |
| `Chromium could not start` | Run `npx playwright install chromium`. If that download is blocked, set `CHROMIUM_PATH` to an installed Chromium or Chrome. |
| pip says `externally-managed-environment` (Homebrew Python, recent Debian or Ubuntu) | Make a virtual environment first: `python3 -m venv .venv`, activate it, then install. |
| `python3` isn't found on Windows | Use `py -3` in its place. |
| verify reports `font "…" did not load` | The board's web fonts couldn't download. Fix the network or the font link, and don't change sizes to compensate. |

## Tests

```bash
python3 -m unittest discover -s tests
```

These tests check that the measurements match renders whose true values are known, and they run `check.py` and `verify.py` against the example and copies broken on purpose. Browser tests skip when Playwright isn't available. CI runs them on Linux, with the oldest and a current Python, whenever this folder changes (`.github/workflows/reference-to-style.yml` at the repo root).

## Notes

- **Rolling out the style.** The guide's Mapping section lists every token and component in your project and what each becomes. A companion skill, `apply-everywhere`, rolls it out from that list, but it's optional: the Mapping works as a checklist on its own.
- **Reference rights.** References and crops stay in your project. The skill takes the style (palette, type character, rhythm) and leaves the assets, logos, copy and layouts. Check that you may use any reference you save in a public repo.

## License

MIT. See `LICENSE`.
