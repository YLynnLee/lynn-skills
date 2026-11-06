# 1. Skills are agent-neutral

Date: 2026-11-06 · Status: accepted

## Context

The skills are shared publicly and written about. Readers use different agents: Claude Code, Codex, Copilot, Gemini CLI, Cursor and others.

## Decision

Every skill uses the open Agent Skills format (`SKILL.md` with `name` and `description` frontmatter) and avoids instructions tied to one agent's tools or install paths. Agent-specific metadata goes in side files (`agents/openai.yaml` for Codex) or optional frontmatter that other agents ignore (`disable-model-invocation`).

## Consequences

- Skills say "ask the user" or "open the file", not a tool name.
- A skill that only makes sense in one agent doesn't belong here (see `.out-of-scope/single-agent-skills.md`).
