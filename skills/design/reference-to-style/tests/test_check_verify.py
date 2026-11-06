"""check.py and verify.py against the finished example, and against copies broken on purpose.

Run: python3 -m unittest discover -s skills/design/reference-to-style/tests

Each case copies examples/drafting-sheet to a temp folder, optionally breaks one thing,
and checks the exit code and the message. verify.py cases need node and Playwright and
skip without them.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
EXAMPLE = os.path.join(HERE, "..", "examples", "drafting-sheet")


def run(script, folder):
    p = subprocess.run([sys.executable, "-I", os.path.join(SCRIPTS, script), folder],
                       capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def has_playwright():
    return shutil.which("node") and subprocess.run(
        ["node", os.path.join(SCRIPTS, "render.js"), "--check"], capture_output=True).returncode == 0


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.folder = os.path.join(self.tmp, "drafting-sheet")
        shutil.copytree(EXAMPLE, self.folder)
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def edit(self, name, old, new):
        path = os.path.join(self.folder, name)
        with open(path, encoding="utf-8") as f:
            text = f.read()
        self.assertIn(old, text)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text.replace(old, new, 1))


class CheckTests(Base):
    def test_example_passes(self):
        code, out = run("check.py", self.folder)
        self.assertEqual(code, 0, out)

    def test_token_without_source_fails(self):
        self.edit("style.md", "chosen: the sheet has no running text", "")
        code, out = run("check.py", self.folder)
        self.assertEqual(code, 1)
        self.assertIn("has no source", out)

    def test_colour_not_measured_fails(self):
        self.edit("style.md", "`--drafting-colour-paper` | #f2ece0", "`--drafting-colour-paper` | #123456")
        code, out = run("check.py", self.folder)
        self.assertEqual(code, 1)
        self.assertIn("copy the measured", out)

    def test_placeholder_left_fails(self):
        self.edit("style.md", "## 6. Motion\n\nNone", "## 6. Motion\n\n{{Element}}")
        code, out = run("check.py", self.folder)
        self.assertEqual(code, 1)
        self.assertIn("placeholder left", out)

    def test_board_change_needs_new_verify(self):
        self.edit("board.html", "<body", "<body data-x=\"1\"")
        code, out = run("check.py", self.folder)
        self.assertEqual(code, 1)
        self.assertIn("changed since verify.py last ran", out)

    def test_unverified_skips_the_verify_gate_with_a_warning(self):
        os.remove(os.path.join(self.folder, "verify.json"))
        code, out = run("check.py", self.folder)
        self.assertEqual(code, 1)
        self.assertIn("not verified yet", out)
        p = subprocess.run([sys.executable, "-I", os.path.join(SCRIPTS, "check.py"), self.folder, "--unverified"],
                           capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, p.stdout)
        self.assertIn("accuracy is not proven", p.stdout)

    def test_missing_files_exit_2(self):
        os.remove(os.path.join(self.folder, "board.html"))
        code, _ = run("check.py", self.folder)
        self.assertEqual(code, 2)


class DoctorTests(unittest.TestCase):
    def test_reports_each_dependency(self):
        p = subprocess.run([sys.executable, os.path.join(SCRIPTS, "doctor.py")], capture_output=True, text=True)
        self.assertIn(p.returncode, (0, 2), p.stdout)  # Python packages are present, or this test couldn't run
        for name in ("Python", "pillow", "numpy"):
            self.assertIn(name, p.stdout)



class GapTests(unittest.TestCase):
    """The gap check must not depend on where a sample's copy wraps."""

    def gap_rows(self, ref_gaps, board_gaps):
        sys.path.insert(0, SCRIPTS)
        import verify
        return verify.compare("notes", {"row_gaps": ref_gaps, "palette": []}, {"row_gaps": board_gaps, "palette": []},
                              ["gap"], 5.0, {})

    def test_an_extra_wrapped_line_still_matches(self):
        # the reference has two paragraphs of two lines; the board's copy wraps onto a third line
        rows = self.gap_rows([22.0, 9.5, 22.0, 9.0], [9.0, 9.5, 22.0, 9.0, 9.5])
        self.assertEqual([(r["reference"], r["pass"]) for r in rows], [("9.25px", True), ("22px", True)])

    def test_a_missing_paragraph_gap_fails(self):
        rows = self.gap_rows([22.0, 9.5, 22.0, 9.0], [9.0, 9.5, 9.0])
        self.assertEqual([r["pass"] for r in rows], [True, False])

@unittest.skipUnless(has_playwright(), "needs node and Playwright")
class VerifyTests(Base):
    def test_example_matches(self):
        code, out = run("verify.py", self.folder)
        self.assertEqual(code, 0, out)
        self.assertIn("measurements match", out)
        self.assertTrue(os.path.isfile(os.path.join(self.folder, "verify.md")))

    def test_wrong_colour_is_reported(self):
        self.edit("board.html", "--drafting-colour-paper: #f2ece0", "--drafting-colour-paper: #2040a0")
        code, out = run("verify.py", self.folder)
        self.assertEqual(code, 1)
        self.assertRegex(out, r"FIX\s")

    def test_unmeasured_crop_tag_is_a_setup_problem(self):
        self.edit("board.html", 'data-crop="paper"', 'data-crop="nonesuch"')
        code, out = run("verify.py", self.folder)
        self.assertEqual(code, 1)
        self.assertIn("names no crop in measured.json", out)

    def test_commented_out_tags_are_ignored(self):
        # a commented-out sample before the real one must not hand it its checks
        self.edit("board.html", "<body>", '<body>\n<!-- <p data-crop="heading" data-check="gap">Old heading</p> -->')
        code, out = run("verify.py", self.folder)
        self.assertEqual(code, 0, out)
        with open(os.path.join(self.folder, "verify.json"), encoding="utf-8") as f:
            checks = {r["check"] for r in json.load(f)["rows"] if r["crop"] == "heading"}
        self.assertIn("type height", checks)

    def test_font_that_did_not_load_is_a_setup_problem(self):
        self.edit("board.html", '--drafting-type-display: "Barlow Condensed"', '--drafting-type-display: "Nonesuch Grotesk Zz"')
        code, out = run("verify.py", self.folder)
        self.assertEqual(code, 1)
        self.assertIn('font "Nonesuch Grotesk Zz" did not load', out)


if __name__ == "__main__":
    unittest.main()
