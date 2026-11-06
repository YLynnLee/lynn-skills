---
name: {{Style name}}
slug: {{slug}}
token-prefix: --{{slug}}-
---

# {{Style name}}

## 1. References

| Reference | File or link |
|---|---|
| {{Reference}} | {{references/file.png or URL}} |

<!-- Strength: quiet: <the 1–3 places it appears>, full: <where>, or strong: <what gets more room>. Every distinctive trait starts quiet. -->

| Take | Strength | Leave |
|---|---|---|
| {{Style trait}} | {{quiet: places, full or strong}} | {{What belongs to one reference}} |

<!-- Evidence: one row per crop measured with scripts/measure.py (measured.json). Copy the numbers from its output; never estimate them. -->

| Crop | Measured | Trait it shows | Becomes |
|---|---|---|---|
| {{crop name}} | {{Palette with shares, stroke, type, gap or contrast}} | {{Style trait from the Take column}} | {{Tokens or Components entry built from it}} |

## 2. Tokens

<!-- Source: crop:<name> when the value was measured in that crop (it must match what measure.py found),
     derived: <the rule that produced it from a measured token>, or chosen: <why>, for values no reference shows. -->

| Group | Token | Value | Source | Use |
|---|---|---|---|---|
| Colour | `--{{slug}}-colour-{{role}}` | {{value}} | {{crop:name, derived: rule or chosen: reason}} | {{use}} |
| Type | `--{{slug}}-type-{{role}}` | {{value}} | {{source}} | {{use}} |
| Spacing | `--{{slug}}-space-{{size}}` | {{value}} | {{source}} | {{use}} |
| Radius | `--{{slug}}-radius-{{size}}` | {{value}} | {{source}} | {{use}} |
| Line | `--{{slug}}-line-{{weight}}` | {{value}} | {{source}} | {{use}} |

## 3. Style rules

| Reference trait | Subject source | Rule |
|---|---|---|
| {{Trait}} | {{Source}} | {{Rule}} |

## 4. Components

<!-- One heading and table per component type. One row per property; one column per state the component has. Use a token wherever one exists, otherwise an exact value. Write "Same" where a state doesn't change the property. -->

### {{Component type}}

| Property | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|
| {{Property, such as background, border, padding, type}} | {{Token or value}} | {{Token, value or Same}} | {{Token, value or Same}} | {{Token, value or Same}} | {{Token, value or Same}} |

## 5. Small section

- **Section:** {{Name and location in the app or site}}
- **Why this one:** {{Component types it combines}}

## 6. Motion

| What moves | How | Duration and easing |
|---|---|---|
| {{Element}} | {{Behaviour}} | {{Values}} |

## 7. Subject list

| Real thing | Source |
|---|---|
| {{Object, material, process, measurement or place}} | {{Where it comes from}} |

## 8. Mapping to the project

<!-- What apply-everywhere rolls out. One row per existing token, class or variable, and one per component type, found when reading the project. Nothing in the project is left unmapped: write Keep or Drop with a reason where nothing new replaces it. -->

| Existing token, class, variable or component | Where it lives | Becomes | Note |
|---|---|---|---|
| {{`--old-token`, `.class`, Webflow variable or component type}} | {{File:line, framework or Webflow collection}} | {{`--{{slug}}-token`, Components entry, Keep or Drop}} | {{Reason for Keep or Drop, or Adapt detail}} |
