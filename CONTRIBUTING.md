# Contributing

Every issue is judged against [SCOPE.md](./SCOPE.md). Read it first.

| You have | Go to |
|---|---|
| A bug in a skill | [Bug report](https://github.com/YLynnLee/lynn-skills/issues/new?template=bug.yml) |
| A change to an existing skill | [Idea or feedback](https://github.com/YLynnLee/lynn-skills/issues/new?template=idea.yml) |
| A question, or an idea for a new skill | [Discussions](https://github.com/YLynnLee/lynn-skills/discussions) |

Pull requests are open to collaborators only, so describe the fix in an issue instead.

## Issues written with AI

- One problem per issue.
- Short. If it doesn't fit on one screen, cut it.
- Repro first: what you ran, which agent, what you expected, what happened.
- No pasted specs or rewritten `SKILL.md` files.

## Adding a skill (maintainers)

1. **Bucket.** Pick one (see the table in `CLAUDE.md`). New skills that need real-world use first go in `skills/in-progress/`. A new promoted bucket needs a `README.md`, a section in the top-level README, and a Gemini `--path` line in `.agents/install-block.md` and the README.
2. **Folder.** `skills/<bucket>/<skill-name>/` with `SKILL.md`, `agents/openai.yaml` and `LICENSE`, following `.agents/writing-skills.md`. Decide user-invoked or model-invoked first: `.agents/invocation.md`.
3. **Scripts and tests**, if any: `tests/` in the folder, a `doctor` check for dependencies, and `.github/workflows/<skill-name>.yml` filtered to the folder (copy `reference-to-style.yml`).
4. **Register** a promoted skill: `.claude-plugin/plugin.json` `skills` array, the top-level README, the bucket README, and a docs page at `docs/<bucket>/<skill-name>.md`.
5. **Changeset:** `npm run changeset`, minor.
6. **Check:** `python3 scripts/validate.py` prints `0 problem(s)`.

Moving a skill between buckets (graduating from `in-progress/`, retiring to `deprecated/`) is the same: move the folder, update the lists, add a changeset, validate.
