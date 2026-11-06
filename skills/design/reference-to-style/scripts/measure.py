#!/usr/bin/env python3
"""Measure regions of a reference, so the guide is built from numbers, not impressions.

Screenshot or image reference: name each region you'll take a trait from.
  python3 measure.py design/styles/<slug> references/ref-1.png --scale 2 \\
      --crop heading=40,120,900,90 --crop rule=40,230,600,24 --crop card=40,300,420,260

Live site: name each region by CSS selector. Computed styles are recorded too,
and they are exact, so they win over pixel readings.
  python3 measure.py design/styles/<slug> https://example.com \\
      --select heading="h1" --select button="a.btn-primary"

--scale is the reference's pixels per CSS pixel (2 for a retina screenshot, 1 for
most saved images). Each crop is saved to references/crops/<name>.png and its
measurements are merged into measured.json in the style folder:
palette (background first, each colour with its share), contrast, stroke
thickness, ink box and the blank gaps between ink rows and columns, all in CSS px.
Rerunning a name replaces it. Prints a short summary per crop.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pixels  # noqa: E402


def node():
    """The node executable, or a clear exit if there isn't one."""
    found = shutil.which("node")
    if not found:
        sys.exit("Node.js not found: live sites and board checks need it. Run scripts/doctor.py for install steps.")
    return found


def parse_pairs(values, what):
    out = []
    for v in values or []:
        if "=" not in v:
            sys.exit(f"--{what} needs name=value, got '{v}'")
        name, value = v.split("=", 1)
        out.append((name.strip(), value.strip()))
    return out


def summary(name, m):
    cols = ", ".join(f"{c['hex']} {round(c['share'] * 100)}%" + (f" (likely {c['likely']})" if c.get("likely") else "")
                     for c in m["palette"])
    bits = [f"{name}: {cols}"]
    if m.get("stroke"):
        bits.append(f"stroke {m['stroke']}px")
    if m.get("ink_box"):
        bits.append(f"ink {m['ink_box'][2]}×{m['ink_box'][3]}px")
    for r in m.get("rules") or []:
        bits.append(f"{r['hex']} rules every {r['rows'] or '—'}px down, {r['cols'] or '—'}px across")
    if m.get("row_gaps"):
        bits.append(f"gaps {m['row_gaps']}px")
    if m.get("contrast"):
        bits.append(f"contrast {m['contrast']}:1")
    if m.get("computed", {}).get("text"):
        t = m["computed"]["text"]
        bits.append(f"type {t['font-family'].split(',')[0]} {t['font-size']}/{t['line-height']} {t['font-weight']}")
    return " · ".join(bits)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", help="design/styles/<slug>")
    ap.add_argument("source", help="image path (relative to the folder or absolute) or https:// URL")
    ap.add_argument("--crop", action="append", help="name=x,y,w,h in the image's own pixels")
    ap.add_argument("--select", action="append", help="name=CSS selector (live sites)")
    ap.add_argument("--scale", type=float, default=1.0, help="reference pixels per CSS pixel")
    ap.add_argument("--width", type=int, default=1280, help="viewport width for live sites")
    args = ap.parse_args()

    folder = args.folder
    crops_dir = os.path.join(folder, "references", "crops")
    os.makedirs(crops_dir, exist_ok=True)
    out_path = os.path.join(folder, "measured.json")
    data = json.loads(Path(out_path).read_text(encoding="utf-8")) if os.path.exists(out_path) else {"crops": {}}

    results = {}
    if args.source.startswith(("http://", "https://")):
        specs = [{"name": n, "selector": s} for n, s in parse_pairs(args.select, "select")]
        if not specs:
            sys.exit("a live source needs --select name=selector")
        with tempfile.TemporaryDirectory() as tmp:
            spec_file = os.path.join(tmp, "specs.json")
            Path(spec_file).write_text(json.dumps(specs), encoding="utf-8")
            run = subprocess.run([node(), os.path.join(HERE, "render.js"), args.source, tmp, spec_file, str(args.width)],
                                 capture_output=True, text=True, encoding="utf-8")
            if run.returncode:
                sys.exit(f"render failed: {run.stderr.strip()}")
            shot = json.loads(run.stdout)
            for family in shot.get("unavailable", []):
                print(f'WARNING font "{family}" did not load; ink heights and gaps from it are a fallback\'s, use the computed styles')
            for name in shot["missing"]:
                print(f"MISSING {name}: selector matched nothing visible")
            for item in shot["items"]:
                img = Image.open(item["file"]).convert("RGB")
                rel = f"references/crops/{item['name']}.png"
                img.save(os.path.join(folder, rel))
                m = pixels.measure(img, shot["scale"])
                m.update(source=args.source, region=next(s["selector"] for s in specs if s["name"] == item["name"]),
                         file=rel, scale=shot["scale"], computed=item["computed"], exact=True)
                results[item["name"]] = m
    else:
        src = args.source if os.path.isabs(args.source) else os.path.join(folder, args.source)
        opened = Image.open(src)
        quality = pixels.jpeg_quality(opened)
        if quality:
            print(f"Lossy reference (JPEG quality ~{quality}): thin colours also get a 'likely' value; prefer a PNG if you have one.")
        image = opened.convert("RGB")
        pairs = parse_pairs(args.crop, "crop") or [("whole", f"0,0,{image.width},{image.height}")]
        for name, box in pairs:
            try:
                x, y, w, h = [int(float(v)) for v in box.split(",")]
            except ValueError:
                sys.exit(f"--crop {name}: use x,y,w,h, got '{box}'")
            if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > image.width or y + h > image.height:
                sys.exit(f"--crop {name}: {box} is outside the {image.width}×{image.height} image")
            crop = image.crop((x, y, x + w, y + h))
            rel = f"references/crops/{name}.png"
            crop.save(os.path.join(folder, rel))
            m = pixels.measure(crop, args.scale, quality)
            m.update(source=os.path.relpath(src, folder), region=[x, y, w, h], file=rel, scale=args.scale,
                     exact=False, jpeg_quality=quality)
            results[name] = m

    data["crops"].update(results)
    Path(out_path).write_text(json.dumps(data, indent=1), encoding="utf-8")
    for name, m in results.items():
        print(summary(name, m))
    print(f"\nSaved {len(results)} crop(s) to {out_path}")


if __name__ == "__main__":
    main()
