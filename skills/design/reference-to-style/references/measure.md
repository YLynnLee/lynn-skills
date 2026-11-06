# Measuring references

Read this at step 1, once each reference is saved in `references/`.

## Crop, then measure

Crop one region per trait you might take (a heading, a button, a rule, a patch of background), and measure them all in one run:

```
python3 <this skill>/scripts/measure.py design/styles/<slug> references/ref-1.png --scale 2 \
    --crop heading=40,120,900,90 --crop button=40,300,240,64 --crop paper=600,40,200,120
python3 <this skill>/scripts/measure.py design/styles/<slug> https://example.com --select heading="h1"
```

- Coordinates are `x,y,width,height` in the image's own pixels.
- `--scale` is the image's pixels per CSS pixel: 2 for a retina screenshot, 1 for most saved images.
- Leave a margin of background round each crop.
- For type, crop one line of capitals with no descenders. Ink height runs from the top of the tallest letter to the bottom of the lowest, so ascenders (b, d, h) and descenders (g, p, y) change it. If the reference has no such line, crop the cleanest line and note which letters it holds.
- Keep one trait per crop. A crop that catches the sheet's frame or a neighbouring element measures that too.
- Live sites take `--select name="css selector"` instead. They also record computed styles, which are exact, so they win over pixel readings.
- Rerunning a name replaces that crop.

## What it gives you

`measured.json` and `references/crops/<name>.png` in the style folder. For each crop: its palette (background first, each colour with its share), contrast, stroke thickness, ink height, the gaps between ink rows and columns, and rule spacing, all in CSS px.

A lossy reference such as a JPEG also gets a `likely` value per thin colour. This is the colour before compression, found by re-rendering and re-compressing candidates until they read the same. Prefer it over the raw reading for thin lines and small text.

When a colour shows in several crops, take it from the crop where it covers the most area.

