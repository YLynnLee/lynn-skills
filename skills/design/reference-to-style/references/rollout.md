# Applying a saved style

Read this when the user names a saved style to use, such as "apply `<slug>` everywhere" or "use `<slug>` on the pricing page". This is the only part of the skill that changes the app or site, and only when the user asks for it.

The guide is the source of truth. Build every change from `style.md` alone, never from the references or the board, and put anything the guide lacks into the guide first.

## 1. Load the style

- Read `design/styles/index.md` and open `design/styles/<slug>/style.md`. If the user named no style and there are several, ask which one. If there is none, define one first (steps 1–5).
- Run `python3 <this skill>/scripts/check.py design/styles/<slug>`. If it fails, the style isn't finished: fix what it names, as in step 5, before changing anything else.
- Scope: "everywhere" or "the site" means every page. Otherwise apply it to the pages or components the user named, and nothing else.

## 2. Bring the Mapping up to date

The Mapping (section 8) was written when the style was defined; the project may have changed since. Read the project again, as in step 2, and add a row for every token, class, variable or component type in scope that it doesn't list yet. Then run `check.py` again. Every row in scope now says what it becomes.

## 3. Add the tokens

Add every token from section 2 in one place, with its exact value and its `--<slug>-` prefix:

| Project uses | Put the tokens in |
|---|---|
| Plain CSS or a CSS framework | `:root` in the global stylesheet |
| Tailwind | the theme config, pointing at the CSS custom properties |
| CSS-in-JS or a theme object | the theme object, with the same names and values |
| Webflow | variables in a collection named after the style |

Load the fonts the same way the board does, through one font link or the project's font setup.

## 4. Work through the Mapping

Go row by row, in this order: tokens, then components, then anything else.

| Becomes | Do |
|---|---|
| A token | Replace every use of the old token with the new one. If the old one is used in many places or by code you can't change, point it at the new one instead: `--old: var(--<slug>-colour-ink);` |
| A Components entry | Restyle that component from its property table, every state included. Keep its content, markup structure and behaviour. |
| `Keep` | Leave it as it is. |
| `Drop` | Remove it, but only once nothing in scope uses it. |

- **Strength:** a `quiet` trait appears only in the places its Strength names, even where it would fit elsewhere. A component outside those places uses the style's plainer tokens.
- **Nothing invented:** a value the guide doesn't give (a new state, an edge case, a component the Mapping missed) goes into the guide first, with a `chosen:` source, then into the code.
- **Small steps:** apply one row, or one component type, at a time, so each change is easy to review and undo.

## 5. Check it

- Run the project's own build, lint and tests.
- Open each changed page and compare it with the board: the same colours, type and components. Check every state you restyled (hover, focus, active, disabled), keyboard focus included.
- Every text colour you set keeps 4.5:1 contrast against its background (3:1 for large text). The guide's derived text colours already do; a new pairing needs checking.
- Search the code in scope for values left behind: hex colours, font names and sizes the Mapping replaced.

## 6. Record and report

- Set the style's "Where it applies" in `design/styles/index.md`.
- Tell the user, in a few lines: what was applied and where, every Mapping row left undone with the reason, and anything you added to the guide. Don't repeat the guide's tables.
