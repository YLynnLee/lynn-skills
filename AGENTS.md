# AGENTS.md

Instructions for AI agents working **on** this repo (not for using its skills).

This is a public collection of agent skills in the open Agent Skills format. Skills must stay agent-neutral: they are used by Claude Code, Codex, Copilot, Gemini CLI, Cursor and others.

## Layout

- One folder per skill: `skills/<category>/<skill-name>/SKILL.md`. The folder name equals the `name` in the frontmatter.
- Each skill is self-contained: its scripts, references, assets, tests and dependency files live inside its own folder. Never reach outside it with relative paths.
- `.claude-plugin/plugin.json` lists every skill in its `skills` array. `.claude-plugin/marketplace.json` publishes the plugin.
- `README.md` lists every skill under its category.

## Adding or renaming a skill

Follow the checklist in `CONTRIBUTING.md`, then run:

```bash
python3 scripts/validate.py
```

It must print `0 problem(s)`.

## Writing skills

- Frontmatter: `name` (lowercase-with-hyphens, ≤ 64 chars) and `description` (≤ 1024 chars, says what it does **and when to use it**). Optional: `license`, `compatibility`.
- Keep `SKILL.md` lean; move long detail into `references/` and point to it from the step that needs it.
- Don't name one vendor's tools in instructions ("use the Read tool"). Describe the action ("open the file") so any agent can follow it.
- Scripts: Python 3.9+ or Node 18+, with a `doctor`-style check that prints exact install commands for anything missing.
- Tests for a skill live in its `tests/`, with a CI workflow in `.github/workflows/<skill-name>.yml` filtered to that skill's path.
