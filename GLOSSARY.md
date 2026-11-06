# Glossary

Terms used across this repo and its skills.

**Skill**: a folder with a `SKILL.md` (frontmatter plus instructions) and optional scripts, references and assets. Agents load it when it's invoked.

**Bucket**: the folder under `skills/` a skill lives in. **Promoted** buckets (`design/`, …) ship in the plugin and README; `in-progress/`, `misc/` and `deprecated/` don't.

**User-invoked**: a skill only the user can start, by typing its name. **Model-invoked**: a skill the agent may also reach for on its own when the task fits. See `.agents/invocation.md`.

**Plugin**: the one installable bundle, `lynn-skills`, that Claude Code, Codex and Copilot install from this repo's marketplace.

## Design skills

**Reference**: a screenshot, live site, Figma frame, drawing or moodboard a style is taken from.

**Style**: a named, measured look saved in `design/styles/<slug>/`: a guide (`style.md`) and a board (`board.html`). Made by `reference-to-style`.

**Trait**: one distinctive part of a style (a palette, a type character, a texture, a motif). Each has a **strength**: `quiet`, `full` or `strong`.

**Mapping**: the guide section that lists every token and component in a project and what each becomes. What a rollout skill such as `apply-everywhere` works from.
