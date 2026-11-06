# Contributing

This is a personal collection, so new skills come from me. Bug reports and fixes to existing skills are welcome: open an issue with what you ran, what you expected and what happened.

## Adding a skill (checklist)

1. **Folder.** Create `skills/<category>/<skill-name>/`. Reuse a category if one fits (`design/`, …); otherwise add a new one.
2. **`SKILL.md`.** Start with frontmatter:

   ```markdown
   ---
   name: <skill-name>          # same as the folder
   description: <what it does>. Use when <the situations that should trigger it>.
   license: MIT
   ---
   ```

   Then the instructions. Long detail goes in `references/`, templates in `assets/`, helper code in `scripts/`.
3. **`README.md`** in the skill folder, for humans: what it does, dependencies and how to check them, troubleshooting.
4. **Register it.** Add `"./skills/<category>/<skill-name>"` to the `skills` array in `.claude-plugin/plugin.json`, and bump its `version`.
5. **List it** in the root `README.md` under its category (add the `--path skills/<category>` Gemini line if the category is new).
6. **Tests (if it has scripts).** Put them in the skill's `tests/` and add `.github/workflows/<skill-name>.yml`, filtered to `skills/<category>/<skill-name>/**`. Copy `reference-to-style.yml` as a start.
7. **Validate.**

   ```bash
   python3 scripts/validate.py
   ```
