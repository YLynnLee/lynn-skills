# Invocation

Every skill is one of two kinds. Decide which before writing it.

| | User-invoked | Model-invoked |
|---|---|---|
| Who starts it | Only the user, by typing it (`/session-log`) | The user, or the agent on its own when the task fits |
| Job | Orchestrate a workflow the user chose to start | Hold a reusable discipline the agent should reach for |
| `SKILL.md` frontmatter | `disable-model-invocation: true` | nothing extra |
| `agents/openai.yaml` (Codex) | `policy:` / `allow_implicit_invocation: false` | no `policy` block |
| `description` | Human-facing: what it does, one sentence. No trigger lists. | What it does **and when to use it**, with the phrases that should trigger it |
| Listed in README under | **User-invoked** | **Model-invoked** |

A user-invoked skill may call model-invoked skills, never another user-invoked one.

`scripts/validate.py` checks that the frontmatter, `agents/openai.yaml` and the README agree.
