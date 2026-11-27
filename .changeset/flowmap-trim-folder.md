---
"lynn-skills": patch
---

flowmap: the skill folder now holds only what the skill runs on. The example runs moved into `tests/fixtures/` (graph and Mermaid only), the checkout picture moved to the docs page, and the PNGs, reports and HTML outputs are gone. `FLOWMAP_UPDATE=1 npm test` replaces `npm run examples`.
