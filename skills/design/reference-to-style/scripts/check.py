#!/usr/bin/env python3
"""Check a style folder (design/styles/<slug>) before showing its board.

Usage: python3 check.py design/styles/<slug> [--unverified]

--unverified skips the verify.py gate, for machines where the browser can't run.
It prints a warning instead, and the board must then be reported as unverified.

Confirms that board.html is built from style.md alone and that the guide is
complete enough to roll out. Prints one line per problem and exits 1 if any
error is found. It can't judge the Leave column: reread the board for that.
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(")
COMMENT_HTML = re.compile(r"<!--.*?-->", re.S)
COMMENT_CSS = re.compile(r"/\*.*?\*/", re.S)
EMPTY = {"", "-", "—", "tbd", "todo"}
STATE_CLASSES = {"is-hover", "is-focus", "is-active"}  # hold a state in place on the board

errors = []
UNVERIFIED = "--unverified" in sys.argv


def error(where, message):
    errors.append(f"{where}: {message}")


def norm(value):
    return re.sub(r"\s+", " ", value.strip().strip("`").strip()).lower()


# ---------- style.md ----------

def sections(text):
    """Split markdown into {heading: body} on '## ' headings."""
    out, name = {}, None
    for line in text.splitlines():
        m = re.match(r"^## (.+)$", line)
        if m:
            name = m.group(1).strip()
            out[name] = []
        elif name:
            out[name].append(line)
    return {k: "\n".join(v) for k, v in out.items()}


def find_section(secs, number):
    for name, body in secs.items():
        if name.startswith(f"{number}."):
            return name, body
    return None, None


def tables(body):
    """Return each table as a list of rows (lists of cells), header removed."""
    result, current = [], []
    for line in body.splitlines() + [""]:
        if line.strip().startswith("|"):
            current.append([c.strip() for c in line.strip().strip("|").split("|")])
        else:
            if len(current) > 2:
                result.append(current[2:])
            elif current:
                result.append([])
            current = []
    return result


def is_none(body):
    return re.sub(r"\s", "", body).lower() in ("none", "none.")


def load_measured(folder):
    path = os.path.join(folder, "measured.json")
    if not os.path.isfile(path):
        return None
    return json.loads(Path(path).read_text(encoding="utf-8")).get("crops", {})


def nearest_de(value, crop):
    import pixels  # needs Pillow and numpy; only loaded when there is something to compare
    m = re.search(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", value)
    if not m:
        return None
    lab = pixels.rgb_to_lab(pixels.rgb_of(m.group(0)))
    values = [c["hex"] for c in crop["palette"]] + [c["likely"] for c in crop["palette"] if c.get("likely")]
    return min(float(pixels.delta_e(lab, pixels.rgb_to_lab(pixels.rgb_of(v)))) for v in values)


def check_guide(path, measured):
    text = COMMENT_HTML.sub("", Path(path).read_text(encoding="utf-8"))
    where = "style.md"

    m = re.search(r"^slug:\s*(\S+)", text, re.M)
    if not m:
        error(where, "no 'slug:' in the front matter")
        return None, {}
    slug = m.group(1)

    for line_no, line in enumerate(text.splitlines(), 1):
        if "{{" in line:
            error(f"{where}:{line_no}", f"placeholder left: {line.strip()[:80]}")

    secs = sections(text)
    for number in range(1, 9):
        name, _ = find_section(secs, number)
        if name is None:
            error(where, f"section {number} is missing; keep every heading from the template")

    # Evidence (section 1): every measured crop is in the table, every row filled
    _, body = find_section(secs, 1)
    evidence = []
    for table in tables(body or ""):
        for row in table:
            if len(row) >= 4 and re.fullmatch(r"[\w-]+", row[0].strip("`")) and row[0].lower() not in ("take",):
                evidence.append(row)
    if measured is None:
        error(where, "no measured.json: measure the references with scripts/measure.py before writing the guide")
    else:
        named = {r[0].strip("`") for r in evidence}
        for name in sorted(set(measured) - named):
            error(where, f"Evidence has no row for measured crop '{name}'")
        for row in evidence:
            name = row[0].strip("`")
            if name not in measured:
                error(where, f"Evidence names crop '{name}', which measured.json doesn't have")
            for label, cell in zip(("Measured", "Trait it shows", "Becomes"), row[1:4]):
                if norm(cell) in EMPTY:
                    error(where, f"Evidence '{name}' has no {label}")

    # Tokens (section 2): token -> value
    tokens = {}
    _, body = find_section(secs, 2)
    for table in tables(body or ""):
        for row in table:
            if len(row) < 3:
                continue
            tm = re.search(rf"--{re.escape(slug)}-[\w-]+", row[1])
            if not tm:
                error(where, f"Token '{row[1]}' doesn't start with --{slug}-")
                continue
            if norm(row[2]) in EMPTY:
                error(where, f"Token {tm.group(0)} has no value")
            tokens[tm.group(0)] = row[2]
            source = norm(row[3]) if len(row) >= 5 else ""
            sm = re.match(r"(crop|derived|chosen)\s*:\s*(\S.*)", source)
            if not sm:
                error(where, f"Token {tm.group(0)} has no source; write crop:<name>, derived: <rule> or chosen: <reason>")
            elif sm.group(1) == "crop" and measured is not None:
                name = sm.group(2).strip()
                if name not in measured:
                    error(where, f"Token {tm.group(0)} cites crop '{name}', which measured.json doesn't have")
                elif row[0].lower().startswith("colour"):
                    de = nearest_de(row[2], measured[name])
                    limit = 3.0 if measured[name].get("exact") else 5.0
                    if de is None:
                        error(where, f"Colour {tm.group(0)} cites a crop, so write its value as a hex")
                    elif de > limit:
                        error(where, f"Colour {tm.group(0)} is {row[2]}, ΔE {de:.1f} from every colour measured in '{name}'; copy the measured (or likely) value")
    if not tokens:
        error(where, "Tokens: defines no tokens")

    # Style rules (section 3): every rule needs a subject source
    _, body = find_section(secs, 3)
    if body is not None and not is_none(body):
        for table in tables(body):
            for row in table:
                if len(row) < 3:
                    continue
                if norm(row[1]) in EMPTY or norm(row[1]) == "none":
                    error(where, f"Style rules: rule '{row[2][:60]}' has no subject source")
                if norm(row[2]) in EMPTY:
                    error(where, f"Style rules: trait '{row[0][:60]}' has no rule")

    # Components (section 4): every cell filled
    _, body = find_section(secs, 4)
    if body is not None and not is_none(body):
        if not re.search(r"^### ", body, re.M):
            error(where, "Components: has no component types")
        for table in tables(body):
            if not table:
                error(where, "Components: has a component table with no rows")
            for row in table:
                for cell in row[1:]:
                    if norm(cell) in EMPTY:
                        error(where, f"Components: property '{row[0]}' has an empty state; write a token, a value or Same")
                        break

    # Mapping (section 8): every row says what it becomes
    _, body = find_section(secs, 8)
    if body is not None and not is_none(body):
        rows = [r for t in tables(body) for r in t if len(r) >= 3]
        if not rows:
            error(where, "Mapping: maps nothing; map every existing token and component type")
        for row in rows:
            becomes = norm(row[2])
            note = norm(row[3]) if len(row) > 3 else ""
            if becomes in EMPTY:
                error(where, f"Mapping: '{row[0]}' has no 'Becomes'")
            elif becomes.split()[0] in ("keep", "drop") and note in EMPTY:
                error(where, f"Mapping: '{row[0]}' is Keep or Drop with no reason")
            for used in re.findall(rf"--{re.escape(slug)}-[\w-]+", row[2]):
                if used not in tokens:
                    error(where, f"Mapping: maps to {used}, which Tokens doesn't define")

    return slug, tokens


# ---------- board.html ----------

def css_rules(css):
    """Yield (selector, declarations) for every rule, flattening @media."""
    css = COMMENT_CSS.sub("", css)
    depth, start, selector_start = 0, 0, 0
    stack = []
    i = 0
    while i < len(css):
        ch = css[i]
        if ch == "{":
            stack.append((css[selector_start:i].strip(), i + 1))
            selector_start = i + 1
        elif ch == "}":
            if stack:
                selector, body_start = stack.pop()
                body = css[body_start:i]
                if "{" not in body:
                    yield selector, body
            selector_start = i + 1
        elif ch == ";" and not stack:
            selector_start = i + 1
        i += 1


def declarations(body):
    for decl in body.split(";"):
        if ":" in decl:
            prop, value = decl.split(":", 1)
            yield prop.strip(), value.strip()


def check_board(path, folder, slug, tokens, measured):
    html = Path(path).read_text(encoding="utf-8")
    where = "board.html"
    prefix = f"--{slug}-"

    uncommented = COMMENT_CSS.sub(lambda m: "\n" * m.group(0).count("\n"), COMMENT_HTML.sub(lambda m: "\n" * m.group(0).count("\n"), html))
    for line_no, line in enumerate(uncommented.splitlines(), 1):
        if "{{" in line:
            error(f"{where}:{line_no}", f"placeholder left: {line.strip()[:80]}")

    m = re.search(r"<style>(.*?)</style>", html, re.S)
    if not m:
        error(where, "no <style> block")
        return
    style = m.group(1)
    marker = style.find("/* Style under review")
    if marker < 0:
        error(where, "the 'Style under review' marker comment is missing; start from the template")
        return
    shell, review = style[:marker], style[marker:]

    shell_classes = set()
    for selector, _ in css_rules(shell):
        shell_classes.update(re.findall(r"\.([A-Za-z_][\w-]*)", selector))

    defined = {}
    for selector, body in css_rules(review):
        if not selector.startswith("@"):
            classes = re.findall(r"\.([A-Za-z_][\w-]*)", selector)
            for cls in classes:
                if not cls.startswith(f"{slug}-") and cls not in STATE_CLASSES:
                    error(where, f"sample class .{cls} doesn't start with {slug}-")
        for prop, value in declarations(body):
            if prop.startswith(prefix):
                defined[prop] = value
                if prop not in tokens:
                    error(where, f"{prop} is defined on the board but not in style.md Tokens")
                elif norm(value) != norm(tokens[prop]):
                    error(where, f"{prop} is '{value}' on the board but '{tokens[prop]}' in style.md")
            elif prop.startswith("--board-"):
                if "var(" not in value and COLOUR.search(value):
                    error(where, f"{prop} uses a raw colour; point it at a {prefix} token")
            elif prop.startswith("--"):
                error(where, f"{prop} isn't a {prefix} or --board- token")
            else:
                if COLOUR.search(value):
                    error(where, f"'{selector[:40]}' sets {prop} to a raw colour ({value}); use a {prefix} token")
                if prop in ("font", "font-family") and "var(" not in value and value not in ("inherit", "initial", "unset"):
                    error(where, f"'{selector[:40]}' sets {prop} without a token ({value})")

    for used in sorted(set(re.findall(rf"var\(\s*({re.escape(prefix)}[\w-]+)", html))):
        if used not in defined:
            error(where, f"uses {used}, which the board's :root doesn't define")
    for token in sorted(set(tokens) - set(defined)):
        error(where, f"{token} is in style.md Tokens but not defined on the board")

    body_html = COMMENT_HTML.sub("", html[html.find("<body"):])
    for attr in re.findall(r'\sstyle="([^"]*)"', body_html):
        if COLOUR.search(attr):
            error(where, f"inline style uses a raw colour: {attr[:60]}")
    for attr in re.findall(r'\sclass="([^"]*)"', body_html):
        for cls in attr.split():
            if cls not in shell_classes and cls not in STATE_CLASSES and not cls.startswith(f"{slug}-"):
                error(where, f"class '{cls}' is neither a board shell class nor starts with {slug}-")
    for src in re.findall(r'<img[^>]*\ssrc="([^"]*)"', body_html):
        if not src.startswith("references/"):
            error(where, f"image '{src}' isn't from references/")
        elif not os.path.isfile(os.path.join(folder, src)):
            error(where, f"image '{src}' doesn't exist")
    for name in sorted(set(re.findall(r'\sdata-crop="([^"]+)"', body_html))):
        if measured is not None and name not in measured:
            error(where, f'data-crop="{name}" names no crop in measured.json')
    for name in sorted(set(measured or {}) - set(re.findall(r'\sdata-crop="([^"]+)"', body_html))):
        error(where, f"crop '{name}' has no sample with data-crop=\"{name}\" on the board")
    if measured is not None and UNVERIFIED:
        print("WARNING verify.py was skipped (--unverified): the board's accuracy is not proven; tell the user")
    elif measured is not None:
        vpath = os.path.join(folder, "verify.json")
        if not os.path.isfile(vpath):
            error(where, "not verified yet: run scripts/verify.py")
        else:
            v = json.loads(Path(vpath).read_text(encoding="utf-8"))
            if v.get("board_sha256") != hashlib.sha256(Path(path).read_bytes()).hexdigest():
                error(where, "board.html changed since verify.py last ran: run it again")
            elif v.get("problems") or any(not r["pass"] and not r.get("accepted") for r in v.get("rows", [])):
                error(where, "verify.py reported failures: fix them and rerun it (see verify.md)")
    if re.search(r"<script\b", html, re.I):
        error(where, "the board has a <script>; it should be CSS only")


def main():
    args = [a for a in sys.argv[1:] if a != "--unverified"]
    if len(args) != 1:
        print(__doc__.strip())
        sys.exit(2)
    folder = args[0]
    guide = os.path.join(folder, "style.md")
    board = os.path.join(folder, "board.html")
    for path in (guide, board):
        if not os.path.isfile(path):
            print(f"missing: {path}")
            sys.exit(2)

    measured = load_measured(folder)
    slug, tokens = check_guide(guide, measured)
    if slug:
        check_board(board, folder, slug, tokens, measured)

    if errors:
        for line in errors:
            print(f"ERROR {line}")
        print(f"\n{len(errors)} problem(s). Fix the guide first, then the board, and rerun.")
        sys.exit(1)
    print(f"OK: {folder} — board matches the guide ({len(tokens)} tokens). Now reread the board for anything from the Leave column.")


if __name__ == "__main__":
    main()
