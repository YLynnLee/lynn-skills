# 2. Ship as one plugin, and through npx skills

Date: 2026-11-06 · Status: accepted

## Context

Claude Code, Codex and Copilot install plugins from a marketplace in a GitHub repo, and update them. Other agents install `SKILL.md` folders with `npx skills`, or by hand.

## Decision

The repo is its own marketplace (`.claude-plugin/marketplace.json`) with one plugin, `lynn-skills`, whose `skills` array lists every promoted skill. `npx skills` and Gemini CLI read the `skills/` folders directly.

## Consequences

- Adding a promoted skill means adding it to `plugin.json`, the README and its bucket README; `scripts/validate.py` checks all three.
- Skills in `in-progress/` are installable with `npx skills --skill <name>` but not shipped in the plugin.
- After touching either manifest, run `claude plugin validate .` if Claude Code is available. Two warnings are expected: `CLAUDE.md` at the root (it is for contributors, not plugin context) and no icon.
