# Writing skills

Skills here are used by Claude Code, Codex, Copilot, Gemini CLI, Cursor and others, so they follow the open Agent Skills format and stay agent-neutral.

## Folder

```
skills/<bucket>/<skill-name>/
  SKILL.md              required: frontmatter + instructions
  agents/openai.yaml    required: Codex display name and invocation policy
  LICENSE               MIT, so a copied folder keeps its license
  references/           optional: long detail SKILL.md points to from the step that needs it
  assets/               optional: templates the skill copies
  scripts/              optional: helper code
  examples/             optional: a finished run
  tests/                required when there are scripts
  requirements.txt / package.json   when scripts need packages
```

The folder is self-contained: nothing in it reaches outside with relative paths, and nothing outside it is needed to run it. Human docs live in `docs/<bucket>/<skill-name>.md`, not in the skill folder, so they don't cost the agent context.

## Frontmatter

```yaml
---
name: <skill-name>        # equals the folder name; lowercase-with-hyphens, 64 chars max
description: ...          # 1024 chars max; see invocation.md for how to word it
license: MIT
compatibility: ...       # optional, 500 chars max: runtimes and packages the scripts need
disable-model-invocation: true   # user-invoked skills only
---
```

## Body

- Keep `SKILL.md` lean. Move detail into `references/` and point to it from the step that needs it.
- Describe actions, not one vendor's tools: "open the file", "ask the user", not "use the Read tool" or "call AskUserQuestion".
- Refer to the skill's own files as `<this skill>/scripts/x.py`, never by an install path such as `~/.claude/skills/...`.
- Scripts: Python 3.9+ (standard library where possible) or Node 18+. Each skill with dependencies ships a `scripts/doctor.py` (or similar) that checks them and prints the exact install command for anything missing, and `SKILL.md` runs it first.
- Find files relative to the script (`os.path.dirname(__file__)`), never the working directory.
- No personal data, private paths, secrets, or references you may not redistribute.

## Docs page

`docs/<bucket>/<skill-name>.md`, with these sections in order: **What it does**, **When to reach for it**, **Setup** (only if it has dependencies), **Common questions**, **It's working if**, then **Tests** if it has any.
