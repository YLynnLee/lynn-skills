#!/usr/bin/env python3
"""Check that every skill in this repo is well-formed and listed everywhere it needs to be.

Usage: python3 scripts/validate.py

A skill is any folder skills/<category>/<name>/ holding a SKILL.md. For each one this checks:
  - SKILL.md starts with YAML frontmatter that has `name` and `description`
  - `name` equals the folder name, is lowercase-with-hyphens and at most 64 characters
  - `description` is at most 1024 characters
  - the skill is listed in .claude-plugin/plugin.json's "skills" array
  - the skill is linked from README.md
And that plugin.json lists nothing that doesn't exist.

Standard library only, so it runs anywhere Python 3.9+ does. Exits 1 on any problem.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def frontmatter(text):
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    fields = {}
    for line in text[4:end].splitlines():
        m = re.match(r"^([A-Za-z_-]+):\s*(.*)$", line)
        if m:
            fields[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return fields


def main():
    problems = []
    plugin = json.loads((ROOT / ".claude-plugin/plugin.json").read_text())
    listed = {(p[2:] if p.startswith("./") else p).rstrip("/") for p in plugin.get("skills", [])}
    readme = (ROOT / "README.md").read_text()

    found = set()
    for skill_md in sorted(ROOT.glob("skills/*/*/SKILL.md")):
        folder = skill_md.parent
        rel = folder.relative_to(ROOT).as_posix()
        found.add(rel)
        fm = frontmatter(skill_md.read_text())
        if fm is None:
            problems.append(f"{rel}: SKILL.md has no frontmatter")
            continue
        name, desc = fm.get("name", ""), fm.get("description", "")
        if not name:
            problems.append(f"{rel}: frontmatter has no name")
        elif name != folder.name:
            problems.append(f"{rel}: name '{name}' doesn't match folder '{folder.name}'")
        elif not NAME_RE.match(name) or len(name) > 64:
            problems.append(f"{rel}: name must be lowercase-with-hyphens, 64 chars max")
        if not desc:
            problems.append(f"{rel}: frontmatter has no description")
        elif len(desc) > 1024:
            problems.append(f"{rel}: description is {len(desc)} chars (max 1024)")
        if rel not in listed:
            problems.append(f"{rel}: not listed in .claude-plugin/plugin.json skills")
        if f"./{rel}" not in readme and f"{rel}/" not in readme:
            problems.append(f"{rel}: not linked from README.md")

    for rel in sorted(listed - found):
        problems.append(f"plugin.json lists {rel}, which has no SKILL.md")

    for p in problems:
        print(f"FAIL {p}")
    print(f"{len(found)} skill(s), {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
