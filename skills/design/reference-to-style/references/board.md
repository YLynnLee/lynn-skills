# Building and verifying the board

Read this at step 5. Copy `assets/board.html` from this skill to `design/styles/<slug>/board.html` as a file copy (a shell command such as `cp`, or your copy tool), never by reading it and writing it back out. Then fill it in from the guide alone by editing the copy in place. Change only the font link, the marked CSS block and the placeholders in the body, and keep every section, in order. Never rewrite the whole file: the shell is the same on every board, and writing it out again costs thousands of tokens. The layout stays the same on every board; the tokens give each board its look.

The board runs from the whole style to its parts (references, styles, components, small section, motion, then style rules), so its order differs from the guide's. Sections share names: map user feedback by name, not number. Keep every section and the layout; the board needs no polish beyond what verify checks.

## Build rules

- One file with inline CSS and no JS or frameworks. Its only images are the reference screenshots. Load fonts through the font link: embedded fonts make the file too large to read and edit.
- One sample of every component type, with states, using real copy and values, built from its Components table. The board shows the samples only, not the table. Hold hover, focus and active in place with `.is-hover`, `.is-focus` and `.is-active`, written alongside the real `:hover`, `:focus-visible` and `:active` rules.
- A Styles section with the colour, type and scale from the guide's Tokens: a swatch per colour with its role, value and use; a type specimen with real copy, largest first, tagged with role and font; and spacing, radius and border tokens as shapes, smallest first, labelled with size and value. Leave token names to the guide.
- One very small real section of the app or site, recreated by hand in the style with its real copy, so the components can be judged together. Pick the smallest section that uses several component types.
- Follow each trait's strength from the guide: a quiet trait appears only in its named places, in the samples and the small section alike, so the board looks as quiet as the rollout will be. The Styles section still shows every token.
- Motion that matters as a small CSS animation, or one line of description if CSS can't show it.
- Prefix every class in the samples with `<slug>-`, such as `.<slug>-button`. Unprefixed names like `.label` or `.group` collide with the board shell.

## Tag what each crop built

Put `data-crop="<name>"` on the element built from that crop, in Components, Styles or the small section, and pick its checks with `data-check` (`colour stroke type gap rules contrast`). Choose an element on the same kind of background as its crop, so the two are measured alike: the small section is often the best place, since it shows parts in real use. A sample checked for `type` is one line with the same kind of letters as its crop: capitals if the crop is capitals, and descenders only if the crop has them, or the heights differ for a reason size can't fix. Pick real copy that fits. The tags are invisible: the board shows no measurements and gains no sections.

## Verify, then check

Fix every failure yourself; this loop is what makes the board accurate, not the user's eye.

```
python3 <this skill>/scripts/verify.py design/styles/<slug>
python3 <this skill>/scripts/check.py design/styles/<slug>
```

`verify.py` renders the board in headless Chromium, measures every `data-crop` sample exactly as its crop was measured (a JPEG reference is compared with the board saved at the same quality), and writes `verify.md` beside the board, one row per crop. It doesn't change the board.

For each failure, fix the cause in the guide first, rebuild that part of the board and rerun:

- A colour is off: copy the measured or `likely` value.
- A type height is off: first make sure the sample has the same kind of letters as its crop, then change the size by the ratio.
- A crop colour is missing from the sample: the sample sits on the wrong background, or the crop caught something it shouldn't.
- A font did not load: fix the font link or the network and rerun. Never change sizes to match a fallback font.

Stop after three rounds and report what still fails, with numbers, in the review's Accuracy line. When a difference is right on purpose, such as darkening a colour for contrast, state it in the guide and mark the sample `data-accept="<check> <reference hex>: <reason>"`. The hex limits it to that one colour, so it can't hide another failure; `verify.md` shows it as on purpose.

## Feedback rounds

After the first review, apply each round of feedback to the guide and the board, then run verify and check once and fix what they report, for at most three rounds, before reopening it and asking again. `check.py` refuses a board that changed since verify last ran, so the saved board is always the one measured, whenever the user stops. There is no approval step.

A change the user asks for is on purpose, even when it moves a sample away from its crop. Give the token `chosen: user feedback` instead of `crop:<name>` (a `crop:` colour must still match its crop) and mark the sample `data-accept="<check> <reference hex>: user feedback"`. Never undo the change to make verify pass.

`check.py` confirms the board is built from the guide alone and the guide is complete enough to roll out. It prints one line per problem, so fix what it names. Neither script can judge the Leave column: reread the board for reference copy, logos and layouts yourself.

## Show it

Open the file in the user's browser and give both paths (`board.html`, `verify.md`). This costs fewer tokens than reading a screenshot back, and it keeps the motion. Send a screenshot only if the file can't be opened.
