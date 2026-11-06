---
name: Drafting sheet
slug: drafting
token-prefix: --drafting-
---

# Drafting sheet

## 1. References

| Reference | File or link |
|---|---|
| Engineering drawing sheet, side elevation (demo reference, JPEG ~88, 2× scale) | references/drawing-sheet.jpg |

| Take | Strength | Leave |
|---|---|---|
| Cream drafting paper ruled in a fine square grid | Paper: full. Grid: quiet: the sheet surface only | The sheet's border frame and its fixed 1200 × 760 layout |
| One navy ink for everything drawn or written | full: all text and linework | The drawing itself: the wheel, its spokes and its Ø 4200 dimensions |
| Red-orange reserved for revisions and dimensions | quiet: buttons and dimension lines | The "REV B · 14.03" stamp text |
| Bold condensed uppercase titles; small tracked monospace labels | Titles: full, on headings. Mono: quiet: labels, notes and spec data; paragraphs keep the body face | The title block's names (A. Okafor, R. Lind) and drawing number |
| Hairline rules dividing data into rows | quiet: spec tables | The sheet's general notes text |
| Square corners, no shadows, no fills except paper | full | |

<!-- Evidence: one row per crop measured with scripts/measure.py (measured.json). Copy the numbers from its output; never estimate them. -->

| Crop | Measured | Trait it shows | Becomes |
|---|---|---|---|
| heading | paper #f2ece0 77%, ink #212f48 23%; caps 26px tall; contrast 11.4:1 | Bold condensed uppercase titles in navy | `--drafting-colour-ink`, `--drafting-type-display`, `--drafting-size-display`; Components: Heading |
| label | ink #282c37 (likely #262f3f) 10%; caps 10.5px tall | Small tracked monospace labels | `--drafting-type-label`, `--drafting-size-label`; Components: Label |
| stamp | mark #b34d34 (likely #c64827) 11%; 1px border; contrast 4.4:1, under AA for text | Red-orange revision mark, boxed by a hairline | `--drafting-colour-mark`, `--drafting-colour-mark-text`; Components: Button |
| paper | paper #f2ece0 95%, grid #d6d0c0 (likely #d9d3be) 5%; rules every 24px both ways | Cream paper with a 24px square grid | `--drafting-colour-paper`, `--drafting-colour-grid`, `--drafting-space-grid`; Components: Sheet |
| linework | ink #252e3b (likely #213144) 8%; strokes 1–2px | Thin and heavy navy linework | `--drafting-line-hair`, `--drafting-line-heavy`; Components: Figure |
| dimension | mark #9e513e (likely #b04c38) 4%; 1px line with end ticks | Dimensions drawn in red-orange with end ticks | Components: Dimension |
| notes | ink #252936 (likely #242c3d) 8%; line gaps 9–9.5px, paragraph gaps 22px | Numbered notes, tight lines, open paragraphs | `--drafting-size-note`, `--drafting-leading-note`; Components: Note list |
| title-block | grid #d7d1c3 / ink #25313f (likely #213448); 1px hairlines; a rule every 31px; the sheet frame left out | Data in hairline-ruled rows, label left, value right | `--drafting-line-hair`; Components: Spec table |

## 2. Tokens

<!-- Source: crop:<name> when the value was measured in that crop (it must match what measure.py found),
     derived: <the rule that produced it from a measured token>, or chosen: <why>, for values no reference shows. -->

| Group | Token | Value | Source | Use |
|---|---|---|---|---|
| Colour | `--drafting-colour-paper` | #f2ece0 | crop:paper | Page and component background |
| Colour | `--drafting-colour-grid` | #d9d3be | crop:paper | Ruled grid and table rules |
| Colour | `--drafting-colour-ink` | #212f48 | crop:heading | All text and linework |
| Colour | `--drafting-colour-mark` | #c64827 | crop:stamp | Actions, dimensions, revisions |
| Colour | `--drafting-colour-ink-soft` | #4b5566 | derived: ink at 80% over paper | Secondary text; 6.4:1 on paper |
| Colour | `--drafting-colour-mark-text` | #ac3f22 | derived: mark darkened until 4.5:1 on paper and paper deep; the reference's own red reads 4.4:1 | Button and link text |
| Colour | `--drafting-colour-paper-deep` | #e6e0cf | derived: paper and grid mixed 50/50 | Hover and pressed backgrounds |
| Type | `--drafting-type-display` | "Barlow Condensed", "Arial Narrow", sans-serif | crop:heading | Titles, 700, uppercase |
| Type | `--drafting-type-label` | "IBM Plex Mono", ui-monospace, monospace | crop:label | Labels, buttons, notes, data |
| Type | `--drafting-type-body` | "IBM Plex Sans Condensed", "Arial Narrow", sans-serif | chosen: the sheet has no running text; a condensed sans keeps its narrow voice and reads better than mono at length | Paragraphs |
| Type | `--drafting-size-display` | 37px | crop:heading | Title size: 26px caps ÷ 0.70 cap height |
| Type | `--drafting-size-label` | 14px | crop:label | Label size: 10.5px caps measured; set by verify |
| Type | `--drafting-size-note` | 13px | crop:notes | Notes and data |
| Type | `--drafting-leading-note` | 20px | crop:notes | Line pitch: 9.5px gap + 10.5px caps |
| Spacing | `--drafting-space-grid` | 24px | crop:paper | The grid; section and block spacing |
| Spacing | `--drafting-space-s` | 8px | derived: a third of the grid | Row padding, small gaps |
| Spacing | `--drafting-space-m` | 12px | derived: half the grid; the notes' paragraph gap | Paragraph gap, control padding |
| Spacing | `--drafting-space-l` | 48px | derived: two grid squares | Between sections |
| Radius | `--drafting-radius-none` | 0 | crop:stamp | Every corner is square |
| Line | `--drafting-line-hair` | 1px | crop:title-block | Rules, borders, thin linework |
| Line | `--drafting-line-heavy` | 2px | crop:linework | Outlines, focus ring |

## 3. Style rules

| Reference trait | Subject source | Rule |
|---|---|---|
| Red-orange only for revisions and dimensions | Rig dimensions from the engineering drawings | Red-orange marks only measured values and actions; everything else is navy |
| Dimension lines with end ticks | The 5.5 m wheel diameter | Figures carry their real measurement as a red dimension line under them |
| Hairline-ruled title block rows | The rig's specification | Specs read as ruled rows: label left in mono, value right |
| Numbered general notes | Growing conditions per bay | Facts about the rig are numbered notes, not bullet points |
| 24px square grid | The drawing scale | Layout snaps to the 24px grid; the grid shows only on the sheet surface |

## 4. Components

### Heading

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Font | 700 `--drafting-size-display`/1.1 `--drafting-type-display` | Same | Same | Same | Same |
| Case and tracking | Uppercase, 0.04em | Same | Same | Same | Same |
| Colour | `--drafting-colour-ink` | Same | Same | Same | Same |

### Label

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Font | 400 `--drafting-size-label`/1.4 `--drafting-type-label` | Same | Same | Same | Same |
| Case and tracking | Uppercase, 0.12em | Same | Same | Same | Same |
| Colour | `--drafting-colour-ink` | Same | Same | Same | `--drafting-colour-ink-soft` |

### Button

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Font | 500 13px/1.4 `--drafting-type-label`, uppercase, 0.1em | Same | Same | Same | Same |
| Colour | `--drafting-colour-mark-text` | Same | Same | `--drafting-colour-paper` | `--drafting-colour-ink-soft` |
| Background | `--drafting-colour-paper` | `--drafting-colour-paper-deep` | Same | `--drafting-colour-mark` | Same |
| Border | `--drafting-line-hair` solid `--drafting-colour-mark` | Same | Same | Same | `--drafting-line-hair` dashed `--drafting-colour-ink-soft` |
| Outline | None | None | `--drafting-line-heavy` solid `--drafting-colour-ink`, offset 2px | None | None |
| Padding and radius | `--drafting-space-s` `--drafting-space-m`; `--drafting-radius-none` | Same | Same | Same | Same |

### Sheet

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Background | `--drafting-colour-paper` with `--drafting-line-hair` `--drafting-colour-grid` rules every `--drafting-space-grid` | Same | Same | Same | Same |
| Padding | `--drafting-space-grid` | Same | Same | Same | Same |

### Figure

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Outline stroke | `--drafting-line-heavy` `--drafting-colour-ink` | Same | Same | Same | Same |
| Detail stroke | `--drafting-line-hair` `--drafting-colour-ink` | Same | Same | Same | Same |
| Fill | None | Same | Same | Same | Same |

### Dimension

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Line | `--drafting-line-hair` `--drafting-colour-mark`, 10px end ticks | Same | Same | Same | Same |
| Value | 400 `--drafting-size-note` `--drafting-type-label`, `--drafting-colour-mark`, centred above the line | Same | Same | Same | Same |

### Note list

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Font | 400 `--drafting-size-note`/`--drafting-leading-note` `--drafting-type-label`, uppercase | Same | Same | Same | Same |
| Colour | `--drafting-colour-ink` | Same | Same | Same | Same |
| Gap between notes | `--drafting-space-m` | Same | Same | Same | Same |
| Numbering | "1." in the text, no list marker | Same | Same | Same | Same |

### Spec table

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| Row | Label left, value right; padding `--drafting-space-s` `--drafting-space-m` | Background `--drafting-colour-paper-deep` | Same | Same | Same |
| Rule | `--drafting-line-hair` solid `--drafting-colour-ink` between rows and on the left | Same | Same | Same | Same |
| Font | 400 `--drafting-size-note`/14px `--drafting-type-label`, uppercase | Same | Same | Same | Same |

## 5. Small section

- **Section:** The rig (demo page, below the hero)
- **Why this one:** Heading, Label, Figure, Dimension, Spec table, Note list and Button on one Sheet

## 6. Motion

None

## 7. Subject list

| Real thing | Source |
|---|---|
| 5.5 m growing wheel | Demo only: stands in for the site owner's own project brief |
| Rig dimensions on the engineering drawings | Demo only: stands in for the site owner's real rig drawings |

## 8. Mapping to the project

| Existing token, class, variable or component | Where it lives | Becomes | Note |
|---|---|---|---|
| Page headings (`h1`, `h2`) | Demo page | Components: Heading | Adapt: uppercase with tracking |
| Primary call to action | Demo page | Components: Button | Adapt: outline in mark colour |
| Spec list | Demo page | Components: Spec table | Adapt: ruled rows |
| Body text colour | Demo page | `--drafting-colour-ink` | Adapt |
