#!/usr/bin/env python3
"""Check the board against the references it was built from, by measuring both.

Usage: python3 verify.py design/styles/<slug> [--limit-de 5]

Renders board.html in headless Chromium, screenshots every element that has a
data-crop="<name>" attribute, measures it exactly as measure.py measured the
reference crop of the same name, and compares:

  colour    every colour in the crop (>= 2% of it) has a match in the sample
            within --limit-de CIEDE2000 (3 for live references, whose values are exact).
            A JPEG reference is compared with the board saved at the same JPEG quality,
            so compression shifts both sides alike
  stroke    line thickness within 0.5px or 15%
  type      live references: same family, size within 1px, same weight,
            line height within 2px. Image references: text height within 10%
            (one line, the same kind of letters: capitals, descenders)
  gap       each kind of blank gap between ink rows (line gaps, paragraph gaps)
            has a match on the board within 2px or 15%
  rules     spacing of full-width rules (grids, table rows) within 1px or 5%
  contrast  ink on background at least 4.5:1 for text, 3:1 otherwise

A difference made on purpose (for contrast, say) is recorded on the sample with
data-accept="<check> [<reference hex>]: <reason>"; with a hex, it covers only that colour. It's reported in verify.md as "on purpose" with the
reason, and doesn't fail the run. Use it only for a reason the guide also states.

Pick checks per sample with data-check="colour stroke type gap rules contrast"
(default: colour stroke contrast). Every measured crop must have a sample on the
board, and every data-crop must name a measured crop.

Leaves the board untouched. Writes verify.md (one row per crop, for people) and
verify.json (every check, for check.py) in the style folder. Exits 1 if anything fails: fix the largest
difference in the guide first, rebuild that part of the board, and rerun.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pixels  # noqa: E402

DEFAULT_CHECKS = ["colour", "stroke", "contrast"]


def node():
    """The node executable, or a clear exit if there isn't one."""
    found = shutil.which("node")
    if not found:
        sys.exit("Node.js not found: live sites and board checks need it. Run scripts/doctor.py for install steps.")
    return found


def px(value):
    m = re.match(r"([\d.]+)px", value or "")
    return float(m.group(1)) if m else None


def first_family(value):
    return (value or "").split(",")[0].strip().strip("'\"").lower()


def compare(name, ref, sample, checks, limit_de, sample_info):
    rows = []

    def row(check, ref_v, board_v, diff, ok, note=""):
        rows.append({"crop": name, "check": check, "reference": ref_v, "board": board_v,
                     "difference": diff, "pass": bool(ok), "note": note})

    exact = ref.get("exact")
    if "colour" in checks:
        limit = 3.0 if exact else limit_de
        slabs = [(c, pixels.rgb_to_lab(pixels.rgb_of(c["hex"]))) for c in sample["palette"]]
        for c in ref["palette"]:
            if c["share"] < 0.02:
                continue
            lab = pixels.rgb_to_lab(pixels.rgb_of(c["hex"]))
            best, de = min(((s, float(pixels.delta_e(lab, slab))) for s, slab in slabs), key=lambda t: t[1])
            row("colour", f"{c['hex']} ({c['role']}, {round(c['share'] * 100)}%)", best["hex"],
                f"ΔE {de:.1f}", de <= limit, f"limit {limit:g}")

    if "stroke" in checks and ref.get("stroke"):
        r, b = ref["stroke"], sample.get("stroke")
        if b is None:
            row("stroke", f"{r}px", "none", "—", False, "the sample has no thin lines")
        else:
            d = abs(r - b)
            row("stroke", f"{r}px", f"{b}px", f"{d:.2f}px", d <= max(0.5, 0.15 * r))

    if "type" in checks:
        rt = (ref.get("computed") or {}).get("text")
        bt = (sample_info.get("computed") or {}).get("text")
        if exact and rt and bt:
            fam_ok = first_family(rt["font-family"]) == first_family(bt["font-family"])
            row("type family", first_family(rt["font-family"]), first_family(bt["font-family"]), "—", fam_ok)
            for prop, tol in (("font-size", 1.0), ("line-height", 2.0)):
                a, b = px(rt[prop]), px(bt[prop])
                if a is not None and b is not None:
                    row(f"type {prop}", rt[prop], bt[prop], f"{abs(a - b):.1f}px", abs(a - b) <= tol)
            row("type weight", rt["font-weight"], bt["font-weight"], "—", rt["font-weight"] == bt["font-weight"])
        elif ref.get("ink_box") and sample.get("ink_box"):
            a, b = ref["ink_box"][3], sample["ink_box"][3]
            d = abs(a - b) / max(a, 1)
            row("type height", f"{a}px", f"{b}px", f"{d * 100:.0f}%", d <= 0.10, "one line, same kind of letters in both")

    if "gap" in checks and ref.get("row_gaps"):
        # compare each kind of gap (between lines, between paragraphs) on its own: how many of each
        # a sample has depends on where its copy wraps, so a median over all of them would too
        board_levels = gap_levels(sample.get("row_gaps") or [])
        for a in gap_levels(ref["row_gaps"]):
            if not board_levels:
                row("gap", f"{a:g}px", "none", "—", False)
                continue
            b = min(board_levels, key=lambda v: abs(v - a))
            d = abs(a - b)
            row("gap", f"{a:g}px", f"{b:g}px", f"{d:.1f}px", d <= max(2.0, 0.15 * a))

    if "rules" in checks:
        for rule in ref.get("rules") or []:
            lab = pixels.rgb_to_lab(pixels.rgb_of(rule["hex"]))
            match = min(sample.get("rules") or [], default=None,
                        key=lambda r: float(pixels.delta_e(lab, pixels.rgb_to_lab(pixels.rgb_of(r["hex"])))))
            for key, label in (("rows", "rules down"), ("cols", "rules across")):
                a = rule.get(key)
                if not a:
                    continue
                b = match.get(key) if match else None
                ok = b is not None and abs(a - b) <= max(1.0, 0.05 * a)
                row(f"{label} {rule['hex']}", f"every {a:g}px", f"every {b:g}px" if b else "none",
                    f"{abs(a - b):.1f}px" if b else "—", ok)

    if "contrast" in checks and sample.get("contrast"):
        has_text = bool((sample_info.get("computed") or {}).get("text"))
        need = 4.5 if has_text else 3.0
        row("contrast", f"{ref.get('contrast', '—')}:1", f"{sample['contrast']}:1", "—",
            sample["contrast"] >= need, f"needs {need}:1")
    return rows


def gap_levels(gaps):
    """The distinct kinds of gap, such as line gaps and paragraph gaps: the median of each cluster."""
    levels, group = [], []
    for g in sorted(gaps):
        if group and g - group[-1] > max(2.0, 0.25 * group[-1]):
            levels.append(float(np.median(group)))
            group = []
        group.append(g)
    if group:
        levels.append(float(np.median(group)))
    return levels


def size(difference):
    m = re.search(r"[\d.]+", str(difference))
    return float(m.group(0)) if m else 0.0


def report(rows, problems):
    """verify.md: one row per crop, each check with its worst difference, then the verdict."""
    fails = [r for r in rows if not r["pass"] and not r.get("accepted")]
    kept = [r for r in rows if r.get("accepted")]
    matched = len(rows) - len(fails) - len(kept)
    cell = lambda v: str(v).replace("|", "\\|")
    lines = ["# Measured match", "",
             "Written by verify.py: the board's samples measured against the reference crops they were built from.", "",
             f"**{matched} of {len(rows)} measurements match**"
             + (f" · {len(kept)} {'differs' if len(kept) == 1 else 'differ'} on purpose" if kept else "")
             + (f" · {len(problems)} setup problem(s)" if problems else ""), "",
             "| Crop | Checks, worst difference | Result |", "|---|---|---|"]
    for p in problems:
        lines.append(f"| Setup | {cell(p)} | Fix |")
    by_crop = {}
    for r in rows:
        by_crop.setdefault(r["crop"], []).append(r)
    for crop, group in by_crop.items():
        worst = {}
        for r in group:
            key = r["check"].split(" #")[0]
            if key not in worst or (not r["pass"] and worst[key]["pass"]) or (
                    r["pass"] == worst[key]["pass"] and size(r["difference"]) > size(worst[key]["difference"])):
                worst[key] = r
        parts = [f"{key} {r['board'] if key == 'contrast' else r['difference']}" for key, r in worst.items()]
        bad = [r for r in group if not r["pass"] and not r.get("accepted")]
        odd = [r for r in group if r.get("accepted")]
        if bad:
            verdict = "Fix: " + "; ".join(f"{r['check']} {r['reference']} → {r['board']}" for r in bad)
        elif odd:
            verdict = "Match, except on purpose: " + "; ".join(dict.fromkeys(r["accepted"] for r in odd))
        else:
            verdict = "Match"
        lines.append(f"| {cell(crop)} | {cell(' · '.join(parts))} | {cell(verdict)} |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--limit-de", type=float, default=5.0, help="colour limit for image references (CIEDE2000)")
    args = ap.parse_args()

    folder = args.folder
    board = os.path.join(folder, "board.html")
    measured_path = os.path.join(folder, "measured.json")
    for p in (board, measured_path):
        if not os.path.isfile(p):
            sys.exit(f"missing: {p} (run measure.py first)")
    crops = json.loads(Path(measured_path).read_text(encoding="utf-8"))["crops"]

    with tempfile.TemporaryDirectory() as tmp:
        spec = os.path.join(tmp, "spec.json")
        Path(spec).write_text(json.dumps([{"attr": "data-crop"}]), encoding="utf-8")
        run = subprocess.run([node(), os.path.join(HERE, "render.js"), board, tmp, spec, "1280"],
                             capture_output=True, text=True, encoding="utf-8")
        if run.returncode:
            sys.exit(f"render failed: {run.stderr.strip()}")
        shot = json.loads(run.stdout)
        # comments aren't rendered, so a tag inside one would shift every later sample's checks
        board_html = re.sub(r"<!--.*?-->", "", Path(board).read_text(encoding="utf-8"), flags=re.S)
        checks_by_name, accepted = {}, {}
        for m in re.finditer(r'<[^>]*\sdata-crop="([^"]+)"[^>]*>', board_html):
            cm = re.search(r'\sdata-check="([^"]+)"', m.group(0))
            checks_by_name.setdefault(m.group(1), []).append(cm.group(1).split() if cm else DEFAULT_CHECKS)
            am = re.search(r'\sdata-accept="([^"]+)"', m.group(0))
            if am:  # data-accept="colour #b34d34: why the board differs on purpose"
                key, _, why = am.group(1).partition(":")
                accepted.setdefault(m.group(1), []).append((key.split(), why.strip()))

        rows, problems, seen = [], [], set()
        for item in shot["items"]:
            base = item["name"].split("~")[0]
            seen.add(base)
            if base not in crops:
                problems.append(f'data-crop="{base}" names no crop in measured.json')
                continue
            idx = int(item["name"].split("~")[1]) - 1 if "~" in item["name"] else 0
            checks = checks_by_name.get(base, [DEFAULT_CHECKS])[min(idx, len(checks_by_name.get(base, [1])) - 1)]
            img = Image.open(item["file"]).convert("RGB")
            if crops[base].get("jpeg_quality"):
                # compare like with like: put the board through the same compression as the reference
                img = pixels.jpeg(img, crops[base]["jpeg_quality"])
            sample = pixels.measure(img, shot["scale"])
            label = base if idx == 0 else item["name"]
            for r in compare(label, crops[base], sample, checks, args.limit_de, item):
                for key, why in accepted.get(base, []):
                    # the check's name, and the reference colour if one is given, must both match
                    if r["pass"] or key[0] != r["check"].split()[0] or any(k not in r["reference"] for k in key[1:]):
                        continue
                    if not why:
                        problems.append(f"data-accept on '{base}' needs a reason after the colon")
                    r["accepted"] = why
                rows.append(r)
        for name in shot["missing"]:
            problems.append(f'data-crop="{name}" has no visible size on the board')
        for family in shot.get("unavailable", []):
            problems.append(f'font "{family}" did not load, so the board drew a fallback and its type '
                            "measurements are wrong; fix the font link or the network, not the sizes")
        for name in sorted(set(crops) - seen):
            problems.append(f"crop '{name}' is measured but no board sample has data-crop=\"{name}\"")

    board_hash = hashlib.sha256(Path(board).read_bytes()).hexdigest()
    Path(folder, "verify.json").write_text(json.dumps({"board_sha256": board_hash, "rows": rows, "problems": problems}, indent=1),
                                           encoding="utf-8")
    Path(folder, "verify.md").write_text(report(rows, problems), encoding="utf-8")

    fails = [r for r in rows if not r["pass"] and not r.get("accepted")]
    for r in rows:
        if r.get("accepted"):
            print(f"KEPT  {r['crop']} · {r['check']}: {r['difference']}, on purpose: {r['accepted']}")
    for p in problems:
        print(f"ERROR {p}")
    for r in sorted(fails, key=lambda r: r["check"]):
        print(f"FIX   {r['crop']} · {r['check']}: reference {r['reference']}, board {r['board']} ({r['difference']}) {r['note']}")
    kept = [r for r in rows if r.get("accepted")]
    print(f"\n{len(rows) - len(fails) - len(kept)}/{len(rows)} measurements match"
          + (f", {len(kept)} {'differs' if len(kept) == 1 else 'differ'} on purpose" if kept else "")
          + (f", {len(problems)} setup problem(s)" if problems else ""))
    sys.exit(1 if fails or problems else 0)


if __name__ == "__main__":
    main()
