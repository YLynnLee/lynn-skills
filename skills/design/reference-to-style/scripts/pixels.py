"""Pixel measurements shared by measure.py and verify.py.

Everything here works on an RGB image (Pillow) and returns plain numbers, so a
reference crop and a rendered board sample are measured the same way and can be
compared directly.
"""
import numpy as np
from PIL import Image

# ---------- colour ----------

def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def rgb_to_lab(rgb):
    """rgb: (..., 3) array of 0-255 values -> CIE Lab (D65)."""
    lin = srgb_to_linear(np.asarray(rgb, dtype=float))
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def delta_e(lab1, lab2):
    """CIEDE2000 difference. Under ~2 is hard to see; over ~5 is clearly different."""
    L1, a1, b1 = np.moveaxis(np.asarray(lab1, float), -1, 0)
    L2, a2, b2 = np.moveaxis(np.asarray(lab2, float), -1, 0)
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = h2p - h1p
    dh = np.where(C1p * C2p == 0, 0, np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh)))
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh / 2))
    Lpm, Cpm = (L1 + L2) / 2, (C1p + C2p) / 2
    hs = h1p + h2p
    hpm = np.where(C1p * C2p == 0, hs, np.where(np.abs(h1p - h2p) > 180, np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2), hs / 2))
    T = (1 - 0.17 * np.cos(np.radians(hpm - 30)) + 0.24 * np.cos(np.radians(2 * hpm))
         + 0.32 * np.cos(np.radians(3 * hpm + 6)) - 0.20 * np.cos(np.radians(4 * hpm - 63)))
    dTheta = 30 * np.exp(-(((hpm - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lpm - 50) ** 2 / np.sqrt(20 + (Lpm - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cpm, 1 + 0.015 * Cpm * T
    Rt = -np.sin(np.radians(2 * dTheta)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def hex_of(rgb):
    return "#" + "".join(f"{int(round(v)):02x}" for v in rgb)


def rgb_of(hex_str):
    h = hex_str.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def luminance(rgb):
    r, g, b = srgb_to_linear(np.asarray(rgb, float))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(rgb1, rgb2):
    l1, l2 = sorted([luminance(rgb1), luminance(rgb2)], reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


# ---------- palette ----------

def load(path_or_image):
    img = path_or_image if isinstance(path_or_image, Image.Image) else Image.open(path_or_image)
    return img.convert("RGB")


def palette(img, max_colours=8, merge_de=6.0, min_share=0.008):
    """Colours in the image with their share of pixels, background first.

    Antialiased edges blend ink into the background, so each ink colour is taken
    from the 25% of its pixels that are furthest from the background: that is the
    colour the designer set, not the blend the rasteriser made.
    """
    img = load(img)
    small = img if img.width * img.height <= 400_000 else img.resize(
        (max(1, img.width // 2), max(1, img.height // 2)), Image.NEAREST)
    px = np.asarray(small, float).reshape(-1, 3)
    q = small.quantize(colors=max_colours * 2, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    idx = np.asarray(q).reshape(-1)
    centres = np.array(q.getpalette()[: 3 * (idx.max() + 1)], float).reshape(-1, 3)

    clusters = []
    for i in range(len(centres)):
        mask = idx == i
        if mask.any():
            clusters.append({"pixels": px[mask], "share": mask.mean(), "mask": mask})
    clusters.sort(key=lambda c: -c["share"])

    # merge clusters that are the same colour to the eye
    merged = []
    for c in clusters:
        lab = rgb_to_lab(c["pixels"].mean(0))
        for m in merged:
            if delta_e(lab, m["lab"]) < merge_de:
                m["pixels"] = np.vstack([m["pixels"], c["pixels"]])
                m["share"] += c["share"]
                m["mask"] = m["mask"] | c["mask"]
                break
        else:
            merged.append({"pixels": c["pixels"], "share": c["share"], "lab": lab, "mask": c["mask"]})
    merged.sort(key=lambda c: -c["share"])

    # the background is the colour that owns the crop's edge, not the one with the most area
    # (a crop of close-set bars can have more bar than gap)
    arr = np.asarray(small, float)
    edge = np.vstack([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    edge_lab = rgb_to_lab(edge)
    owners = [int((delta_e(edge_lab, m["lab"]) < merge_de * 1.5).sum()) for m in merged]
    best = int(np.argmax(owners))
    if owners[best] > 0 and merged[best]["share"] >= 0.25:  # a thin border on the edge isn't a background
        merged.insert(0, merged.pop(best))

    bg_rgb = np.median(merged[0]["pixels"], 0)
    bg_lab = rgb_to_lab(bg_rgb)
    shape = (small.height, small.width)
    out = [{"hex": hex_of(bg_rgb), "share": round(float(merged[0]["share"]), 4), "role": "background",
            "_mask": merged[0]["mask"].reshape(shape)}]
    for m in merged[1:]:
        p = m["pixels"]
        d = delta_e(rgb_to_lab(p), bg_lab)
        if np.median(d) < 8 and m["share"] < 0.03:  # compression ringing; a faint grid covers more than this
            out[0]["share"] = round(out[0]["share"] + float(m["share"]), 4)
            continue
        # thin ink (lines, small text) is mostly edge, so keep only its strongest pixels
        core = p[d >= np.quantile(d, 0.9 if m["share"] < 0.05 else 0.75)]
        out.append({"hex": hex_of(np.median(core, 0)), "share": round(float(m["share"]), 4), "role": "ink",
                    "_mask": m["mask"].reshape(shape)})
    # fold antialias blends: an ink that lies between the background and a stronger ink is not a colour
    final = [out[0]]
    # strongest inks first, so each blend ring folds into an ink that already holds the rings inside it
    out[1:] = sorted(out[1:], key=lambda c: -float(delta_e(rgb_to_lab(rgb_of(c["hex"])), bg_lab)))
    for c in out[1:]:
        lab = rgb_to_lab(rgb_of(c["hex"]))
        blend = False
        # chroma bleed: lossy compression smears an ink's hue into the background around it,
        # giving a colour as light as the background but tinted like the ink
        if abs(lab[0] - bg_lab[0]) < 4:
            off = lab[1:] - bg_lab[1:]
            for s in out[1:]:
                if s is c:
                    continue
                soff = rgb_to_lab(rgb_of(s["hex"]))[1:] - bg_lab[1:]
                cos = np.dot(off, soff) / max(np.linalg.norm(off) * np.linalg.norm(soff), 1e-9)
                if cos > 0.85 and np.linalg.norm(soff) > np.linalg.norm(off):
                    out[0]["share"] = round(out[0]["share"] + c["share"], 4)
                    blend = True
                    break
        if blend:
            continue
        # edge blend: the pixels of c that sit next to a stronger ink and lie between it and the
        # background in colour fold into that ink; the rest of c (a faint grid, say) stays a colour
        for s in final[1:]:
            slab = rgb_to_lab(rgb_of(s["hex"]))
            if delta_e(slab, bg_lab) <= delta_e(lab, bg_lab):
                continue
            near = c["_mask"] & grow(s["_mask"], 2)
            if not near.any():
                continue
            nlab = rgb_to_lab(np.median(arr[near], 0))
            seg = slab - bg_lab
            t = np.clip(np.dot(nlab - bg_lab, seg) / max(np.dot(seg, seg), 1e-9), 0, 1)
            if not (0.03 < t < 0.97 and delta_e(nlab, bg_lab + t * seg) < 6.0):
                continue
            moved = near.sum() / near.size
            s["share"] = round(s["share"] + float(moved), 4)
            s["_mask"] = s["_mask"] | near
            c["_mask"] = c["_mask"] & ~near
            c["share"] = round(float(c["_mask"].mean()), 4)
            if c["share"] < min_share:
                out[0]["share"] = round(out[0]["share"] + c["share"], 4)
                blend = True
                break
            rest = arr[c["_mask"]]
            d = delta_e(rgb_to_lab(rest), bg_lab)
            c["hex"] = hex_of(np.median(rest[d >= np.quantile(d, 0.5)], 0))
            lab = rgb_to_lab(rgb_of(c["hex"]))
        if not blend:
            final.append(c)
    # small inks are judged after their edge blends are folded back in: a thin red stamp can be
    # under 1% of the crop as solid pixels and well over it with its edges
    for c in final[1:]:
        if c["share"] < min_share:
            final[0]["share"] = round(final[0]["share"] + c["share"], 4)
    final[1:] = sorted((c for c in final[1:] if c["share"] >= min_share), key=lambda c: -c["share"])
    for c in final:
        c.pop("_mask", None)
    return final[: max_colours]


def grow(mask, reach=1):
    """The mask widened by `reach` px in every direction (2 px spans a ring of edge blend)."""
    out = mask.copy()
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            if dy or dx:
                out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


# ---------- lossy references ----------

def jpeg_quality(img):
    """Estimate a JPEG's quality (1-100) from its luminance table; None if it isn't a JPEG."""
    tables = getattr(img, "quantization", None)
    if not tables:
        return None
    std = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
           14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
           49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99]
    scale = 100.0 * sum(tables[0]) / sum(std)
    q = (200 - scale) / 2 if scale <= 100 else 5000 / scale
    return int(max(1, min(100, round(q))))


def jpeg(img, quality):
    import io
    buf = io.BytesIO()
    load(img).save(buf, "JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def _lattice(bg, ink, width):
    from PIL import ImageDraw
    im = Image.new("RGB", (240, 120), tuple(int(v) for v in bg))
    d = ImageDraw.Draw(im)
    for y in range(10, 110, 24):
        d.rectangle([10, y, 230, y + width - 1], fill=tuple(int(v) for v in ink))
    for x in range(20, 230, 30):
        d.rectangle([x, 10, x + width - 1, 110], fill=tuple(int(v) for v in ink))
    return im


def recover(bg_hex, seen_hex, width, quality, rounds=8):
    """The ink colour that, drawn as lines `width` device px thick and saved at this JPEG
    quality, reads as `seen_hex`. Compression greys out thin coloured lines; this undoes it."""
    target = np.array(rgb_of(seen_hex), float)
    guess = target.copy()
    bg = rgb_of(bg_hex)
    for _ in range(rounds):
        inks = [c for c in palette(jpeg(_lattice(bg, guess, width), quality)) if c["role"] == "ink"]
        if not inks:
            break
        got = np.array(rgb_of(max(inks, key=lambda c: c["share"])["hex"]), float)
        guess = np.clip(guess + (target - got), 0, 255)
    return hex_of(guess)


# ---------- geometry ----------

def ink_mask(img, bg_hex=None, threshold_de=12.0):
    img = load(img)
    px = np.asarray(img, float)
    bg = np.array(rgb_of(bg_hex)) if bg_hex else np.median(px.reshape(-1, 3), 0)
    return delta_e(rgb_to_lab(px), rgb_to_lab(bg)) > threshold_de


def runs(line):
    """Lengths of consecutive True runs in a 1-D bool array."""
    padded = np.concatenate([[False], line, [False]]).astype(int)
    d = np.diff(padded)
    return np.flatnonzero(d == -1) - np.flatnonzero(d == 1)


def stroke_width(mask):
    """Most common thickness of thin ink, in pixels (None if there is no thin ink).

    Takes horizontal and vertical runs; a line's thickness is the short run across it.
    """
    lengths = [r for row in mask for r in runs(row)] + [r for col in mask.T for r in runs(col)]
    lengths = [r for r in lengths if r <= 12]
    if not lengths:
        return None
    values, counts = np.unique(lengths, return_counts=True)
    return int(values[counts.argmax()])


def ink_box(mask):
    """Bounding box of the ink: (x, y, width, height), or None."""
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]


def gaps(mask, axis=0, min_gap=2):
    """Blank bands between ink along an axis (0 = rows, gaps run horizontally): their lengths in px."""
    profile = mask.any(axis=1 - axis)
    blank = ~profile
    ink = np.flatnonzero(profile)
    if not len(ink):
        return []
    inner = blank[ink.min(): ink.max() + 1]
    return [int(r) for r in runs(inner) if r >= min_gap]


def rule_spacing(mask, axis=0, fill=0.6):
    """Distance between full-width rules (grid lines, table rows) along an axis, in px; None if < 2 rules.

    axis 0: horizontal rules (rows mostly ink); axis 1: vertical rules (columns mostly ink).
    """
    profile = mask.mean(axis=1 - axis) >= fill
    starts = np.flatnonzero(np.diff(np.concatenate([[0], profile.astype(int)])) == 1)
    if len(starts) < 2:
        return None
    return float(np.median(np.diff(starts)))


def measure(img, ref_scale=1.0, quality=None):
    """Everything we compare, in CSS pixels.

    quality: the JPEG quality the reference was saved at, if it's lossy. Thin inks then also get
    a "likely" hex (the colour before compression) and every colour gets a confidence.
    """
    img = load(img)
    pal = palette(img)
    inks = [c for c in pal if c["role"] == "ink"]
    # set the ink threshold from the strongest ink, so a faint grid is measured when it's all there is
    # but doesn't get mixed into text or linework drawn over it
    bg_lab = rgb_to_lab(rgb_of(pal[0]["hex"]))
    distances = [float(delta_e(rgb_to_lab(rgb_of(c["hex"])), bg_lab)) for c in inks] or [24.0]
    mask = ink_mask(img, pal[0]["hex"], float(np.clip(max(distances) / 2, 3, 12)))
    # rules (grids, table lines) per ink colour, so a grid and the table drawn over it stay apart
    lab_img = rgb_to_lab(np.asarray(img, float))
    rules = []
    for c, dist in zip(inks, distances):
        own = delta_e(lab_img, rgb_to_lab(rgb_of(c["hex"]))) < max(4.0, dist / 2.5)
        rows_, cols_ = rule_spacing(own, 0), rule_spacing(own, 1)
        if rows_ or cols_:
            rules.append({"hex": c["hex"], "rows": round(rows_ / ref_scale, 1) if rows_ else None,
                          "cols": round(cols_ / ref_scale, 1) if cols_ else None})
    sw = stroke_width(mask)
    for c in pal:
        c["confidence"] = "high"
        if quality and c["role"] == "ink" and (sw or 99) <= 4:  # thin lines and small text lose colour
            c["likely"] = recover(pal[0]["hex"], c["hex"], max(1, sw or 2), quality)
            c["confidence"] = "medium"
    box = ink_box(mask)
    s = float(ref_scale)
    out = {
        "size": [round(img.width / s, 1), round(img.height / s, 1)],
        "palette": pal,
        "stroke": round(sw / s, 2) if sw else None,
        "ink_box": [round(v / s, 1) for v in box] if box else None,
        "row_gaps": [round(g / s, 1) for g in gaps(mask, 0)],
        "rules": rules,
    }
    inks = [c for c in pal if c["role"] == "ink"]
    if inks:
        bg = rgb_of(pal[0]["hex"])
        out["contrast"] = round(max(contrast(bg, rgb_of(c["hex"])) for c in inks), 2)
    return out
