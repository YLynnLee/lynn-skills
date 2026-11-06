# lynn-skills

Skills I build for AI agents, and write about. Each one is a folder with a `SKILL.md`, in the open [Agent Skills](https://agentskills.io) format, so it works in Claude Code, Codex, GitHub Copilot, Gemini CLI, Cursor and any other agent that reads `SKILL.md` skills.

## Install

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
```

Re-run to update.

</details>

<details>
<summary><b>Any other agent</b>, or editable files (Cursor, OpenCode, Windsurf, Amp, …)</summary>

```bash
npx skills@latest add YLynnLee/lynn-skills            # choose agent and skills interactively
npx skills@latest add YLynnLee/lynn-skills -a cursor  # or name the agent
npx skills@latest add YLynnLee/lynn-skills --skill reference-to-style  # one skill only
```

Update with `npx skills@latest update`.

</details>

<details>
<summary><b>By hand</b></summary>

Clone the repo and link (or copy) a skill folder into your agent's skills directory:

```bash
git clone https://github.com/YLynnLee/lynn-skills ~/lynn-skills
ln -s ~/lynn-skills/skills/design/reference-to-style ~/.claude/skills/reference-to-style
```

Swap `~/.claude/skills` for your agent's skills folder.

</details>

Some skills ship scripts with their own dependencies. Each skill's README lists them and how to check them.

## Skills

### Design

- **[reference-to-style](./skills/design/reference-to-style/)**: turns design references (screenshots, live sites, Figma frames, drawings, moodboards) into a measured style for your site, shown on a visual board and backed by a written style guide. Colours, sizes and spacing are measured from the references by scripts, not eyeballed, and the board is checked against them until it matches. Never changes your app. [Read more](./skills/design/reference-to-style/README.md).

## Layout

```
skills/
  <category>/
    <skill-name>/
      SKILL.md        the skill: frontmatter (name, description) + instructions
      README.md       for humans: what it does, install, dependencies
      scripts/        optional helper scripts
      references/     optional docs the skill reads on demand
      assets/         optional templates
.claude-plugin/       plugin + marketplace manifests (Claude Code, Codex, Copilot)
scripts/validate.py   checks every skill is well-formed and listed
```

Adding a skill: see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
