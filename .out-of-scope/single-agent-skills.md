# Skills that only work in one agent

Skills here must work in any agent that reads `SKILL.md` skills (see `.agents/adr/0001-agent-neutral-skills.md`). A skill that depends on one agent's tools, settings or hooks, and can't describe its steps without them, belongs in that agent's own plugin or config instead.

Agent-specific metadata is fine as long as other agents can ignore it (`disable-model-invocation`, `agents/openai.yaml`).
