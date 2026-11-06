#!/usr/bin/env python3
"""Check that this skill's tools can run on this machine, and say how to fix what can't.

Usage: python3 doctor.py

Exit 0: everything works.
Exit 1: Python packages are missing; nothing can be measured until they're installed.
Exit 2: Python works but the browser doesn't. Image references can still be measured,
        but live sites can't, and the board can't be verified.
"""
import os
import platform
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
PY = "py -3" if os.name == "nt" else "python3"


def say(status, what, fix=None):
    print(f"{status:<8}{what}")
    if fix:
        for line in fix:
            print(f"{'':<8}{line}")


def main():
    python_ok = sys.version_info >= (3, 9)
    say("OK" if python_ok else "MISSING", f"Python {platform.python_version()} (needs 3.9 or later)",
        None if python_ok else ["Install Python 3.9+ from python.org or your package manager."])

    missing = []
    for module, package in (("PIL", "pillow"), ("numpy", "numpy")):
        try:
            __import__(module)
            say("OK", f"{package}")
        except ImportError:
            missing.append(package)
    if missing:
        say("MISSING", ", ".join(missing), [
            f"{PY} -m pip install -r {os.path.join(SKILL, 'requirements.txt')}",
            "If pip refuses with 'externally-managed-environment', make a virtual environment first:",
            f"  {PY} -m venv .venv, activate it, then rerun the line above and run the scripts with its python.",
        ])

    browser_ok = False
    node = shutil.which("node")
    if not node:
        say("MISSING", "Node.js (needed for live sites and verifying the board)",
            ["Install Node 18+ from nodejs.org or your package manager, then rerun this check."])
    else:
        run = subprocess.run([node, os.path.join(HERE, "render.js"), "--check"], capture_output=True, text=True)
        if run.returncode == 0:
            browser_ok = True
            say("OK", f"Playwright and Chromium ({run.stdout.strip()})")
        else:
            say("MISSING", "Playwright or its Chromium", [line for line in run.stderr.strip().splitlines() if line] + [
                f"Easiest: cd {SKILL} && npm install && npx playwright install chromium"])

    if missing or not python_ok:
        print("\nNot ready: install the Python packages above, then rerun.")
        sys.exit(1)
    if not browser_ok:
        print("\nPartly ready: image references can be measured, but live sites can't, and verify.py can't "
              "check the board. Install the browser above, or carry on and tell the user the board is unverified.")
        sys.exit(2)
    print("\nReady.")


if __name__ == "__main__":
    main()
