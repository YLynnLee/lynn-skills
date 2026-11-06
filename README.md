# lynn-skills

Skills I build for AI agents, and write about, starting with design: turn screenshots, live sites and moodboards into a measured style guide and design tokens. Each one is a folder with a `SKILL.md`, in the open [Agent Skills](https://agentskills.io) format, so it works in Claude Code, Codex, GitHub Copilot, Gemini CLI, Cursor and any other agent that reads `SKILL.md` skills.

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
npx skills@latest add YLynnLee/lynn-skills -a <agent>   # omit -a to choose
npx skills@latest add YLynnLee/lynn-skills --skill reference-to-style   # one skill only
```

Update with `npx skills@latest update`; re-run `add` to pick up new skills.

</details>

Some skills ship scripts with their own dependencies; each skill's docs page lists them.

## Getting started

After installing, there's no command to learn. Describe the task, and the agent picks up the skill that fits. You can also name the skill to be sure, such as "use reference-to-style".

Taking [reference-to-style](./docs/design/reference-to-style.md) as the example:

1. **Check you have what it needs.**

   | What | Needed for |
   |---|---|
   | Python 3.9+ with Pillow and numpy | Everything: it measures colours, sizes and spacing with these |
   | Node 18+ with Playwright and Chromium | Live websites as references, and checking the finished board. Without them, screenshots still work and the board is marked unverified |

   You don't have to set these up first. On every run the skill checks them and prints the exact install command for anything missing. It never installs anything itself: it shows you the commands and waits for you. If Python isn't installed at all, it tells you to install Python 3.9 or later and waits.

2. **Give it references and ask.** Screenshots, website links, Figma frames or a moodboard all work. For example:

   > Make a style for my site inspired by these two screenshots.

   > This page looks too generic. Get inspired by https://example.com instead.

3. **Review the board.** The agent makes the early choices itself and stops once, when the board is ready. Open `board.html` in a browser, then ask for changes such as "more of the grid" or "less red", or say it's fine.

4. **Use the style.** It's saved in `design/styles/<name>/`: a visual board (`board.html`), a written guide with every measured value (`style.md`), and an accuracy report (`verify.md`). Your app or site doesn't change. When you want the style used, say so, such as "apply `<name>` everywhere".

To see a finished run before trying it, open the [drafting-sheet example](./docs/design/reference-to-style.md#what-it-does). Each skill's docs page has the full details, setup fixes and common questions.

## Reference

Skills split on one axis: who can start them. **User-invoked** skills run only when you type them (e.g. `/session-log`); their job is to orchestrate a workflow. **Model-invoked** skills can be started by you _or_ picked up by the agent on its own when the task fits; they hold a reusable discipline.

### Design

Design and front-end style work. [Bucket README](./skills/design/README.md)

**Model-invoked**

- **[reference-to-style](./skills/design/reference-to-style/SKILL.md)**: Turn design references (screenshots, live sites, Figma frames, moodboards) into a measured style, shown on a visual board and backed by a written guide, then applies it to your site when you ask. [Docs](./docs/design/reference-to-style.md)

### Not in the plugin

- [`in-progress/`](./skills/in-progress/README.md): beta skills, installable one at a time with `npx skills@latest add YLynnLee/lynn-skills --skill <name>`.
- [`misc/`](./skills/misc/README.md) and [`deprecated/`](./skills/deprecated/README.md): kept for reference.

## Contributing

Issues welcome: see [CONTRIBUTING.md](./CONTRIBUTING.md) and [SCOPE.md](./SCOPE.md). Repo layout and rules for adding skills: [CLAUDE.md](./CLAUDE.md).

## License

MIT. See [LICENSE](./LICENSE).
