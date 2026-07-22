# Session 67 — Loading states designed (ADR-0105): boot power-on, content-shaped skeleton, determinate upload

Designed the app's three loading moments as one loading language and captured it in [`mockups/loading-states-v1.html`](../../mockups/loading-states-v1.html) + [ADR-0105](../decisions/0105-loading-states-design.md). Design + docs only — **no app code changed**; the build is a backlog item. This note records the exploration path, because most of the value was in what got tried and rejected.

## What shipped (this session)

- `mockups/loading-states-v1.html` — the three tiers (boot / snapshot / upload), phone-framed, in the real Waypoint tokens, with live motion and a light/dark boot pair.
- ADR-0105 (Accepted, build pending) + this note; catalog entry in `design/mockups.md`; a backlog line under the UI/UX follow-ups; wired into `decisions/README.md` + `INDEX.md`.
- A shareable review artifact (claude.ai) kept in sync with the mockup during the session.

## The three decisions

- **Boot** = the loud "board power-on" (dormant board warming up; the glow _ramps_ as a warm-up, never the reserved live pulse; mono numerals, `טוען…` in the heading face). Theme-aware but **not** mode-aware. Light = cool-paper (`--screen`) day ground + ink numerals + a small amber halo; dark = the night board, amber lit, **designed not built** (rides the future `data-theme='dark'` toggle).
- **Snapshot** = a content-shaped skeleton that pre-draws Home — the one tier needing a per-mode variant (Trip dark-board / Plan violet-prep + checklist).
- **Upload** = a determinate `NN%` + mini-bar in the pending doc row, replacing the indeterminate `מעלה…` spinner; offline stays `ממתין להעלאה`.

Full rationale in the ADR; this note is the path, not the conclusions.

## Exploration path (what got tried and rejected)

The boot screen took the most iteration, and the detours are the point:

1. **Board power-on vs. a calm brand mark.** Two first-pass directions (loud dark board warming up vs. a quiet Waypoint marker on paper). The loud board won — it's the one place the board is allowed and the strongest brand moment we have.
2. **Light/dark "looked almost the same".** First dark pass was a token-only remap of the board. But the board is dark in _both_ themes, so remapping its hex barely moved it — the two frames read near-identical. Real fix: change **how much dark is on screen**, not the board's shade (the design-language dark-mode rule).
3. **"The background is still dark."** Next pass floated the dark board as a hero card on paper — but the card still filled most of the frame, so it read dark. Shrinking it to a medallion helped but felt like a card-on-a-background, not one surface.
4. **"The background should be uniform… more amber?"** Tried a full warm **amber field** (daylight) with dark glow + dark numerals, as an inversion of the dark board. **Rejected** as off-palette: amber = time, used sparingly (ADR-0028); a whole amber ground spends the budget.
5. **In-palette candidates.** Presented indigo (loud but still dark), cool paper (`--screen`), and warm paper (`--paper`) as uniform grounds with amber kept to the clock + halo. Cool paper chosen: genuinely light/day, and the neutral the whole app already sits on. (Briefly landed on warm paper, then switched to cool.)
6. **Upload row.** Confirmed it's an inline row status (ADR-0092), not a screen. Chose the determinate `NN%` + mini-bar over the indeterminate spinner — an upload has a known size.

Along the way, a couple of RTL/rendering bugs in the mockup were found by rendering it headless: the raw `☁︎` variation-selector cloud rendered as tofu (replaced with an inline cloud-up SVG matching `EntitySyncBadge`), and the trailing status cluster was tidied to mirror the real `ListRow`.

## Deferred / gated

- **Dark boot** — designed, not built; ships only with the `data-theme='dark'` toggle (ADR-0082 / U-08).
- **Determinate upload progress** — needs upload-progress reporting from the upload call; rides ADR-0056's outbox upload. Until then the row can fall back to the offline `ממתין להעלאה` grammar.
- **The build itself** (light boot + content-shaped skeleton) — a backlog item, not done here.

## Lesson worth keeping

CI pins **prettier 3.9.5** (lockfile); formatting a new file locally with a different prettier (`npx prettier@3.3.3`) passed locally but failed CI's `format:check` — 3.9.5 formats multi-value CSS `background` differently. When there's no local `node_modules`, match the lockfile-pinned prettier version, not just any `npx prettier`.
