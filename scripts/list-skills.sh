#!/usr/bin/env bash
# Print every SKILL.md in the repo.
cd "$(dirname "$0")/.." && find skills -name SKILL.md -not -path '*/node_modules/*' | sort
