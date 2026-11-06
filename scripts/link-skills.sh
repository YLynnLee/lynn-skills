#!/usr/bin/env bash
# For working on this repo: symlink every skill (except misc/ and deprecated/)
# into ~/.claude/skills and ~/.agents/skills, so edits here are live.
# Not a supported installer: users install with the plugin or npx skills (see README).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
for dest in "$HOME/.claude/skills" "$HOME/.agents/skills"; do
  mkdir -p "$dest"
  find "$root/skills" -name SKILL.md -not -path '*/misc/*' -not -path '*/deprecated/*' -not -path '*/node_modules/*' |
  while read -r skill_md; do
    dir="$(dirname "$skill_md")"; name="$(basename "$dir")"
    if [ -e "$dest/$name" ] && [ ! -L "$dest/$name" ]; then
      echo "skip $dest/$name: a real folder is there"; continue
    fi
    ln -sfn "$dir" "$dest/$name" && echo "linked $dest/$name"
  done
done
