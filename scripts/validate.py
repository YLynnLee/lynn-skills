#!/usr/bin/env python3
"""Check that every skill is well-formed and listed everywhere it should be (and nowhere else).

Usage: python3 scripts/validate.py

A skill is any folder skills/<bucket>/<name>/ holding a SKILL.md. Rules (see CLAUDE.md):

Every skill
  - SKILL.md frontmatter has `name` (= folder name, lowercase-with-hyphens, <= 64 chars)
    and `description` (<= 1024 chars); `compatibility`, if present, <= 500 chars
  - has agents/openai.yaml and a LICENSE
  - is user-invoked in both places or neither: `disable-model-invocation: true` in SKILL.md
    <=> `allow_implicit_invocation: false` in agents/openai.yaml
  - is linked from its bucket's README.md
  - names no install path (~/.claude/skills, ~/.agents/skills) in SKILL.md

Promoted buckets (anything but in-progress, misc, deprecated)
  - listed in .claude-plugin/plugin.json `skills`, linked from README.md,
    under the right User-invoked / Model-invoked heading, with a docs page
    at docs/<bucket>/<name>.md

Other buckets
  - not in plugin.json, not in the top-level README's reference lists

Also: every bucket has a README.md, plugin.json lists nothing that doesn't exist,
and package.json and plugin.json versions match.

Standard library only. Exits 1 on any problem.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UNPROMOTED = {"in-progress", "misc", "deprecated"}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
INSTALL_PATHS = ("~/.claude/skills", "~/.agents/skills", ".claude/skills/")


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


def readme_kind(readme, rel):
    """Which invocation heading the link to `rel` sits under in README.md, or None if unlinked."""
    kind = None
    for line in readme.splitlines():
        heading = line.strip().strip("*#").strip().lower()
        if heading in ("user-invoked", "model-invoked"):
            kind = heading
        elif line.startswith("#"):
            kind = None
        if f"./{rel}/" in line or f"./{rel})" in line:
            return kind or "unsorted"
    return None


def main():
    problems = []
    plugin = json.loads((ROOT / ".claude-plugin/plugin.json").read_text())
    listed = {p[2:] if p.startswith("./") else p for p in plugin.get("skills", [])}
    listed = {p.rstrip("/") for p in listed}
    readme = (ROOT / "README.md").read_text()

    for bucket in sorted(p for p in (ROOT / "skills").iterdir() if p.is_dir()):
        if not (bucket / "README.md").exists():
            problems.append(f"skills/{bucket.name}: bucket has no README.md")

    found = set()
    for skill_md in sorted(ROOT.glob("skills/*/*/SKILL.md")):
        folder = skill_md.parent
        bucket = folder.parent.name
        rel = folder.relative_to(ROOT).as_posix()
        found.add(rel)
        text = skill_md.read_text()
        fm = frontmatter(text)
        if fm is None:
            problems.append(f"{rel}: SKILL.md has no frontmatter")
            continue

        name, desc = fm.get("name", ""), fm.get("description", "")
        if name != folder.name:
            problems.append(f"{rel}: name '{name}' doesn't match folder '{folder.name}'")
        elif not NAME_RE.match(name) or len(name) > 64:
            problems.append(f"{rel}: name must be lowercase-with-hyphens, 64 chars max")
        if not desc:
            problems.append(f"{rel}: frontmatter has no description")
        elif len(desc) > 1024:
            problems.append(f"{rel}: description is {len(desc)} chars (max 1024)")
        if len(fm.get("compatibility", "")) > 500:
            problems.append(f"{rel}: compatibility is over 500 chars")
        for path in INSTALL_PATHS:
            if path in text:
                problems.append(f"{rel}: SKILL.md names an install path ({path}); refer to <this skill> instead")

        if not (folder / "LICENSE").exists():
            problems.append(f"{rel}: no LICENSE")
        openai = folder / "agents" / "openai.yaml"
        user_invoked = fm.get("disable-model-invocation", "").lower() == "true"
        if not openai.exists():
            problems.append(f"{rel}: no agents/openai.yaml")
        else:
            implicit_off = re.search(r"allow_implicit_invocation:\s*false", openai.read_text()) is not None
            if user_invoked != implicit_off:
                problems.append(
                    f"{rel}: disable-model-invocation and agents/openai.yaml allow_implicit_invocation disagree"
                )

        bucket_readme = folder.parent / "README.md"
        if bucket_readme.exists() and f"./{folder.name}/" not in bucket_readme.read_text():
            problems.append(f"{rel}: not linked from skills/{bucket}/README.md")

        kind = readme_kind(readme, rel)
        if bucket in UNPROMOTED:
            if rel in listed:
                problems.append(f"{rel}: {bucket}/ skills must not be in plugin.json")
            if kind:
                problems.append(f"{rel}: {bucket}/ skills must not be listed in README.md")
            continue
        if rel not in listed:
            problems.append(f"{rel}: not listed in .claude-plugin/plugin.json skills")
        want = "user-invoked" if user_invoked else "model-invoked"
        if kind is None:
            problems.append(f"{rel}: not linked from README.md")
        elif kind != want:
            problems.append(f"{rel}: README.md lists it under '{kind}', expected '{want}'")
        if not (ROOT / "docs" / bucket / f"{folder.name}.md").exists():
            problems.append(f"{rel}: no docs page at docs/{bucket}/{folder.name}.md")

    for rel in sorted(listed - found):
        problems.append(f"plugin.json lists {rel}, which has no SKILL.md")

    pkg = ROOT / "package.json"
    if pkg.exists():
        pv = json.loads(pkg.read_text()).get("version")
        if pv != plugin.get("version"):
            problems.append(f"package.json is {pv} but plugin.json is {plugin.get('version')}")

    for p in problems:
        print(f"FAIL {p}")
    print(f"{len(found)} skill(s), {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
