<!-- The canonical install commands. README.md's "Install" section copies these verbatim. Edit here first. -->

Pick **one** way per agent. A plugin updates itself; `npx skills` copies editable files you update by hand. Installing both gives you every skill twice.

<details>
<summary><b>Claude Code</b> (plugin, updates itself)</summary>

```bash
claude plugin marketplace add YLynnLee/lynn-skills
claude plugin install lynn-skills@ylynnlee
```

Or inside a session: `/plugin marketplace add YLynnLee/lynn-skills`, then `/plugin install lynn-skills@ylynnlee`.

</details>

<details>
<summary><b>Codex</b> (plugin)</summary>

```bash
codex plugin marketplace add YLynnLee/lynn-skills
codex plugin add lynn-skills@ylynnlee
```

</details>

<details>
<summary><b>GitHub Copilot</b> (CLI and VS Code)</summary>

```bash
copilot plugin marketplace add YLynnLee/lynn-skills
copilot plugin install lynn-skills@ylynnlee
```

In VS Code: run **Chat: Install Plugin From Source** and enter `https://github.com/YLynnLee/lynn-skills`.

</details>

<details>
<summary><b>Gemini CLI</b> (manual updates)</summary>

```bash
gemini skills install https://github.com/YLynnLee/lynn-skills.git --path skills/design
gemini skills install https://github.com/YLynnLee/lynn-skills.git --path skills/productivity
```

One command per bucket. Re-run them to update.

</details>

<details>
<summary><b>Any other agent</b>, or editable files (Cursor, OpenCode, Windsurf, Amp, …)</summary>

```bash
npx skills@latest add YLynnLee/lynn-skills -a <agent>   # omit -a to choose
npx skills@latest add YLynnLee/lynn-skills --skill reference-to-style   # one skill only
```

Update with `npx skills@latest update`; re-run `add` to pick up new skills.

</details>

Some skills ship scripts with their own dependencies; each skill's docs page lists them.
