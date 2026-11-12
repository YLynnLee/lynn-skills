# lynn-skills

Public agent skills by YLynnLee, in the open Agent Skills format. `AGENTS.md` is a symlink to this file, so every agent reads the same instructions. These are for working **on** this repo, not for using its skills.

## Layout

Skills live in bucket folders: `skills/<bucket>/<skill-name>/SKILL.md`.

| Bucket | Holds | In README + plugin? |
|---|---|---|
| `design/` | Design and front-end style work | Yes (promoted) |
| `productivity/`, … | Add a new promoted bucket when a skill doesn't fit an existing one | Yes (promoted) |
| `in-progress/` | Beta: public on purpose, feedback wanted | No |
| `misc/` | Kept around, rarely used, not maintained | No |
| `deprecated/` | No longer used | No |

- Every skill in a promoted bucket appears in the top-level `README.md`, in its bucket's `README.md`, and in `.claude-plugin/plugin.json`'s `skills` array. Skills in `in-progress/`, `misc/` and `deprecated/` appear only in their bucket README.
- Every bucket has a `README.md`. Promoted buckets and the top-level README group skills into **User-invoked** and **Model-invoked**; the others use a flat list.
- Every promoted skill has a docs page at `docs/<bucket>/<skill-name>.md`. See `.agents/writing-skills.md` for its sections.
- Install commands are copied verbatim from `.agents/install-block.md` into the README.
- Gemini CLI installs one bucket per command, so a new promoted bucket needs its own `gemini skills install ... --path skills/<bucket>` line in `.agents/install-block.md`.

## Writing skills

- Folder, frontmatter and body rules: `.agents/writing-skills.md`.
- User-invoked vs model-invoked: `.agents/invocation.md`.
- Skills must stay agent-neutral (`.agents/adr/0001-agent-neutral-skills.md`): no tool names from one agent, no install paths, no personal data.
- Each skill folder is self-contained, with its own `LICENSE`, scripts, tests and dependency files.

## Checks

After adding, moving or renaming a skill, or touching a manifest:

```bash
python3 scripts/validate.py          # must print 0 problem(s)
node scripts/sync-plugin-version.mjs --check
claude plugin validate .            # if Claude Code is installed; root CLAUDE.md and no-icon warnings are expected
```

A skill with scripts has tests in its `tests/` and a workflow `.github/workflows/<skill-name>.yml` filtered to its folder.

## Releases

Versioning uses changesets. For any user-facing change, add one with `npm run changeset` (patch for fixes, minor for new skills or behaviour). `npm run version` bumps `package.json`, writes `CHANGELOG.md` and syncs `.claude-plugin/plugin.json`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for YLynnLee/lynn-skills (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

`GLOSSARY.md` and `.agents/adr/` at the repo root.
