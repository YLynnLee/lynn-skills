# lynn-skills

## 0.2.0

### Minor Changes

- b537a59: Add flowmap: map how a codebase, system, process or decision flows, as a diagram where every box and arrow is traced to its source, guesses are drawn dashed for you to confirm, and a path that breaks a rule you set is drawn red. It writes one HTML page that shows the source of whatever you click. Needs an agent that can run shell commands, and Node 20+. The Pele renderer ships with the skill, so there is nothing to install; `scripts/doctor.mjs` checks.
- e838206: New skill `interview-me` in the new `productivity` bucket, shipped in the plugin: interviews you about an idea, notes or a transcript, one question at a time, until it's solid enough to write from, then writes up the result in your own words.
- 8f83301: reference-to-style can now apply a saved style to the app or site when you name it ("apply `<slug>` everywhere"), working from the guide's Mapping, so no separate rollout skill is needed. `measure.py` now explains a missing or unreadable reference image instead of crashing.

### Patch Changes

- 4849d1a: Gemini CLI install instructions now cover every plugin bucket (`design` and `productivity`), not just `design`.
- 9ef9335: `reference-to-style`: when Python isn't installed at all, the skill now tells the user to install it and waits, instead of leaving it to the agent. The README explains that the skill never installs dependencies itself.
- 3743df3: reference-to-style's description now says what it produces (a style guide with palette, typography, spacing and design tokens) and covers more everyday requests, such as "make it look like this" or "extract the colours and fonts", so agents pick it up more reliably.

## 0.1.0

### Minor Changes

- `reference-to-style`: the first skill. Turns design references into a measured style, shown on a visual board and backed by a written guide.
- Repo layout: bucket folders, one plugin for Claude Code, Codex and Copilot, `npx skills` and Gemini CLI installs, docs pages, and a validator.
