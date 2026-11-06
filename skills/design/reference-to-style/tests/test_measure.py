"""Calibration: measure.py's readings against renders whose true values are known.

Run: python3 -m unittest discover -s skills/design/reference-to-style/tests

Each case renders a fixture page with known CSS in headless Chromium (2x), optionally
saves it as JPEG, measures it, and checks the error against the truth. When a change
to pixels.py makes a number here worse, the change made measuring less accurate.
Needs Pillow, numpy, node and Playwright; skips if node or Playwright is missing.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
EXAMPLE = os.path.join(HERE, "..", "examples", "drafting-sheet")
sys.path.insert(0, SCRIPTS)
import pixels  # noqa: E402

FIXTURE = """<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#f3efe4;font-family:Georgia,serif}
#heading{padding:20px;width:500px}
#heading h1{margin:0;font-size:40px;line-height:48px;color:#1d3557;font-weight:400}
#rules{margin:20px;width:400px;height:60px;border-top:1px solid #1d3557;border-bottom:2px solid #c2410c}
#dark{margin:20px;width:300px;padding:12px;background:#1d3557;color:#f3efe4;font:16px/24px sans-serif}
#bars{margin:20px;width:300px;padding:10px}#bars p{margin:0 0 16px;height:12px;background:#6b705c}
#grid{margin:20px;width:240px;height:120px;background-color:#f3efe4;
  background-image:linear-gradient(#d9d2bf 1px,transparent 1px),linear-gradient(90deg,#d9d2bf 1px,transparent 1px);background-size:24px 24px}
#grid span{display:inline-block;margin:30px;padding:4px 8px;border:1px solid #c8472b;color:#c8472b;font:12px monospace}
#fade{margin:20px;width:200px;padding:10px}#fade b{display:block;height:40px;background:#c8472b;animation:fade-in 3s forwards}
@keyframes fade-in{from{opacity:0}}
</style>
<div id=heading><h1>Growing wheel</h1></div><div id=rules></div><div id=dark>Rig dimensions 5.5 m</div>
<div id=bars><p></p><p></p><p></p></div><div id=grid><span>REV B</span></div><div id=fade><b></b></div>
"""
TRUTH = {
    "heading": {"colours": ["#f3efe4", "#1d3557"]},
    "rules": {"colours": ["#f3efe4", "#c2410c", "#1d3557"], "stroke": 1.0},
    "dark": {"colours": ["#1d3557", "#f3efe4"]},
    "bars": {"colours": ["#f3efe4", "#6b705c"], "gap": 16.0},
    "grid": {"colours": ["#f3efe4", "#d9d2bf", "#c8472b"], "rules": 24.0},
    # a 3s fade-in, captured before it ends: must read at its end state, not half-transparent
    "fade": {"colours": ["#f3efe4", "#c8472b"]},
}


def have_browser():
    if not shutil.which("node"):
        return False
    return subprocess.run(["node", os.path.join(SCRIPTS, "render.js"), "--check"], capture_output=True).returncode == 0


def nearest(hex_value, measured):
    lab = pixels.rgb_to_lab(pixels.rgb_of(hex_value))
    return min(float(pixels.delta_e(lab, pixels.rgb_to_lab(pixels.rgb_of(v)))) for v in measured)


@unittest.skipUnless(have_browser(), "needs node and Playwright")
class Calibration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        page = os.path.join(cls.tmp, "fixture.html")
        with open(page, "w", encoding="utf-8") as f:
            f.write(FIXTURE)
        specs = os.path.join(cls.tmp, "specs.json")
        with open(specs, "w", encoding="utf-8") as f:
            json.dump([{"name": n, "selector": f"#{n}"} for n in TRUTH], f)
        run = subprocess.run(["node", os.path.join(SCRIPTS, "render.js"), page, cls.tmp, specs],
                             capture_output=True, text=True, check=True)
        cls.shots = {i["name"]: i["file"] for i in json.loads(run.stdout)["items"]}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def measure(self, name, quality=None):
        img = pixels.load(self.shots[name])
        if quality:
            img = pixels.jpeg(img, quality)
        return pixels.measure(img, 2, quality)

    def test_lossless_colours_are_exact(self):
        for name, truth in TRUTH.items():
            m = self.measure(name)
            got = [c["hex"] for c in m["palette"]]
            for hex_value in truth["colours"]:
                self.assertLess(nearest(hex_value, got), 1.0, f"{name}: {hex_value} not found in {got}")

    def test_jpeg_colours_stay_close(self):
        # at quality 88, every true colour is within 5 of a reading or its likely value
        for name, truth in TRUTH.items():
            m = self.measure(name, 88)
            got = [c["hex"] for c in m["palette"]] + [c["likely"] for c in m["palette"] if c.get("likely")]
            for hex_value in truth["colours"]:
                self.assertLess(nearest(hex_value, got), 5.0, f"{name} q88: {hex_value} vs {got}")

    def test_no_phantom_colours(self):
        # antialiasing and compression must not invent colours that cover 2% or more
        for quality in (None, 88):
            for name, truth in TRUTH.items():
                m = self.measure(name, quality)
                for c in m["palette"]:
                    if c["share"] >= 0.02:
                        values = [c["hex"]] + ([c["likely"]] if c.get("likely") else [])
                        best = min(nearest(v, truth["colours"]) for v in values)
                        self.assertLess(best, 8.0, f"{name} q{quality}: phantom {c}")

    def test_geometry(self):
        self.assertEqual(self.measure("rules")["stroke"], TRUTH["rules"]["stroke"])
        self.assertEqual(self.measure("bars")["row_gaps"], [TRUTH["bars"]["gap"]] * 2)
        grid = self.measure("grid")
        rule = next(r for r in grid["rules"] if nearest("#d9d2bf", [r["hex"]]) < 3)
        self.assertEqual((rule["rows"], rule["cols"]), (TRUTH["grid"]["rules"], TRUTH["grid"]["rules"]))


@unittest.skipUnless(have_browser(), "needs node and Playwright")
class Example(unittest.TestCase):
    def test_example_board_verifies_and_checks(self):
        tmp = tempfile.mkdtemp()
        try:
            folder = os.path.join(tmp, "drafting-sheet")
            shutil.copytree(EXAMPLE, folder)
            verify = subprocess.run([sys.executable, os.path.join(SCRIPTS, "verify.py"), folder], capture_output=True, text=True)
            self.assertEqual(verify.returncode, 0, verify.stdout + verify.stderr)
            check = subprocess.run([sys.executable, os.path.join(SCRIPTS, "check.py"), folder], capture_output=True, text=True)
            self.assertEqual(check.returncode, 0, check.stdout + check.stderr)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
