# 0149 — The in-trip top bar is two rows, and the exit is lateral

**Status:** Accepted — **built 2026-08-03 (session 199)**; see [`planning/2026-08-03-session-199-the-top-bar-is-built.md`](../planning/2026-08-03-session-199-the-top-bar-is-built.md)
**Date:** 2026-08-02
**Design exploration:** [`mockups/top-bar-v1.html`](../../mockups/top-bar-v1.html) — renders the shipped `App.css` / `day-strip.css` / `avatar.css` / `modal.css`, so its "before" frame is the real header and every number below was measured from it, not estimated.
**Amends:** [0043](0043-day-view-now-line-phases-and-archive-chrome.md) §4 (the day-scope context ribbon) and §6 (the account/settings cluster), [0033](0033-all-trips-home.md) §3 (how you reach all-trips from inside a trip), [0080](0080-per-entity-sync-status.md) (where the failed-sync affordance lives), [0133](0133-the-user-is-a-surface-identity-ramp-and-a-reachable-roster.md) §9 (the roster's entry point)
**Builds on:** [0028](0028-plan-violet-color-budget-dark-ready.md) (mode identity, colour budget), [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (the toggle exists only in the live window), [0132](0132-search-reclaims-the-chrome-and-a-google-result-is-a-ring.md) (the chrome reclaim), [0140](0140-motion-foundations-overlays-arrive-taps-answer-routes-have-a-direction.md) (overlay arrival, press feedback, route direction)
**Spec updated:** `architecture/app-shell.md` §5/§6

## Context

The in-trip header stacks **five rows**, one per concern: a centred mode bar, an identity row (trip pill + sub-line + member cluster + account avatar + gear), a status region, the day strip, and a day-scope context ribbon. Measured at 390×844 with a 44px top inset: **250px at rest, 321px on a non-today day** — 30–38% of the viewport before the body starts, and with the tab bar, 37–46% of the screen is chrome.

Three further complaints came with the height, and they turned out to be the same problem:

1. **Nobody guesses the trip name is the way out.** ADR-0033 §3 made the pill navigate to `/trips`, but nothing about a title says "tap me to leave".
2. **Three adjacent circles do three different things** — member cluster (roster), your avatar (account), gear (trip settings) — two of them nearly identical.
3. **Two chrome states push the body when they appear.** The context ribbon is 42px in flow; the offline/pending/failed badges are ~30px in flow. Both reflow the header, which is most of what read as "clanky".

## Decision

### 1. Two rows, and every row answers a question rather than hosting a control

- **Row 1 — identity.** Trip chip (glyph + name + switch mark) · trip-settings gear · people stack. 44px, which is the touch floor met by geometry.
- **Row 2 — the day axis.** A fixed-width anchor slot · the day strip · the mode control.
- Header padding drops from 14/16 to 10/10 (it was sized for a five-row stack).

Measured result: **250px → 160px** at rest, **321px → 160px** off-today (the ribbon and badges no longer add height at all). Body grows 523px → 613px at 390×844.

### 2. The exit is a deck, not a title and not a back arrow

Two rejected answers are recorded because each is the obvious one:

- **A menu** (the chip opens a sheet whose first row is `כל הטיולים`) improves comprehension _after_ the tap and does nothing for a user who never taps. **Discovery cannot be fixed by something you must tap to discover.**
- **A back arrow at the leading edge** fixes discovery but **asserts a hierarchy that is false**: ADR-0033's landing rule opens a live trip _directly_, so you never came from `/trips`, and trip Home is the main screen most of the time. The action is also **lateral** — move between trips — not _up_. It is additionally too prominent for its frequency and costs 36px the name needs.

**So:** one card edge peeking behind the trip's glyph (the deck metaphor: "there are others like this one") plus a `swap` mark in place of the caret. Visible without a tap, quiet, claims no parent, adds no control to the row. The chip **navigates directly to `/trips`** — one tap, no menu detour — keeping ADR-0033 §3's single-surface rule intact.

**And it is absent when you have one trip**, which is the common case: no deck, no `swap`, nothing in the chrome suggesting anywhere else to be. This is ADR-0045 / ADR-0109 §6's "no source, no control" applied to an affordance rather than a tile.

### 3. Mode moves to the day row, icons only

The toggle keeps its segmented shape but sits at the trailing end of **row 2**, both sides icon-only. Two reasons, and only the second is about space:

- **It survives the collapse (§7) and therefore works on the Map**, which opens condensed. A mode switch unreachable on a whole tab is a defect, not a density choice.
- It returns ~103px to row 1, which is what lets an 18-character trip name render at 17px instead of 13px (§8).

Mode identity still rides three channels — chrome hue, drafting grid, and the fill's position in the pill — where design-language requires two. **Icons-only buys no day pills**: it is 88px against 103px, and a day pill is 48px, so the visible-day count is identical either way (measured: 3 at 390, 3 at 430, in both). It is chosen for visual weight, not width.

### 4. One people stack, and the gear stays

The member cluster and the account avatar collapse into **one stack you lead with your ring**, opening one people sheet (you at the top → account; then the group). Trip settings keeps its gear in row 1, since the chip now navigates rather than opening a menu.

With mode gone from row 1 the stack is no longer capped for a control that left: it shows **up to four circles** (three at ≤370px), and `useShrinkToFit` re-fits the name as the cluster grows — a negotiation its own comment already anticipated, rather than a frozen constant.

### 5. Nothing in the chrome reflows

- **The day-scope ribbon becomes an anchor slot** at the strip's leading edge: fixed width, two states cross-faded in place — `יום 2/10` on today, a `היום` button off it. Same box, no height change. This **replaces** ADR-0043 §4's context ribbon; the rule it encoded (amber anchors today, selection is neutral/violet) is untouched.
- **Offline and pending become a passive badge** positioned on the trip glyph — an exception indicator, silent when synced (ADR-0092), settling once on arrival and never looping (ADR-0140 §6). The `aria-live` region and its strings are unchanged; only what is painted moves.
- **`failed` is different, and gets a real control.** It is the one sync state a person can act on, and ADR-0080 requires a persistent path to the dead-letter sheet that never clears on a timer. Since the chip now navigates away, the badge cannot be that path — so a failed write **adds a `--miss` button to row 1**, absent in every other state. A control arriving when a write is rejected is the behaviour, not a cost.

### 6. The day strip loses its label row

The month label stops being a row above the pills (~22px, empty across most of its width) and becomes an **in-line divider between months** — a hairline and a caption — which also chunks a long trip visually. Pills become exactly 44×44 (weekday letter over the number). Every other rule of the strip is unchanged: amber anchors today, neutral selection for history, violet for future, the Plan-mode empty-day marker, the drag drop-ring.

### 7. Scrolling condenses row 1, and a surface may ask for that as its resting state

Scrolling the body lifts row 1 out; the trip glyph slides into the day row's leading edge, carrying the status badge with it, so identity never leaves the chrome. **160px → 108px.**

Two guards are part of the decision, because the first build oscillated visibly:

- **Hysteresis** — condense at 48px, release at 12px. One threshold flips the state on the pixel it is read at, and collapsing frees 52px of body, which removes the very overflow that triggered it.
- **A slack test** — never condense when the page barely scrolls; the room it buys is room the content did not need.

**And a surface may declare the condensed chrome as its resting state, with no gesture involved.** The Map must: its body is `is-fullbleed` and therefore **never scrolls**, so the scroll trigger is structurally unavailable on the one surface whose scarce axis is height (ADR-0121 §5 / ADR-0126). This is a third `AppShell` modifier beside `BODY_FULLBLEED` and `CHROME_RECLAIMED`, and it keeps that layer's rule: the surface says what layout it wants, never what it is doing (the "search-mode flag" ADR-0101 refused). The Map's chrome becomes **108px at rest**, and the reclaim (ADR-0132) still takes it to 0 when the query field opens — three states, where there were two.

### 8. What this costs, stated

- **The day strip narrows from 358px to 182px**, so the resting window drops from **7 visible days to 3** (measured with the selected day centred, which is the strip's resting position — measuring at scroll 0 counts whatever sits beside the trip's first month divider and reports a number nobody sees). The strip still scrolls and still centres the selection. This is the single largest regression and it is bought deliberately: it is what pays for the name, for mode surviving the collapse, and for the anchor slot.
- **A max-length trip name is tight but no longer clipped.** At 390 with 18 characters `useShrinkToFit` settles at **17px, uncut** — against the shipped header, which hits its 15px floor and **still truncates**. See §9.

### 9. Two shipped defects this measurement found, neither introduced here

- **`MAX_TRIP_NAME_LENGTH = 18` no longer buys what it was set to buy.** Its comment says it exists "to keep the header switcher pill to one line (app-shell.md §5)", but at 390 with four avatars and the gear in the row, the shipped pill shrinks to its 15px floor and clips anyway. The new layout fixes the symptom; the constant's justification should be re-derived or its comment corrected.
- **`useShrinkToFit`'s fit test compares integers.** `scrollWidth`/`clientWidth` are rounded, so text overflowing its box by 1.8px reports 94 against 93 — the loop can stop a step early while the browser draws an ellipsis. Measure the text with a `Range` over its contents for the sub-pixel width the renderer actually used. The mockup hit exactly this and printed "fits" over a frame showing `…`.

Both are fixable independently of this ADR and shipped on their own branch first (PR #388).

## Amendment, 2026-08-03 (the build) — what the condense costs the failed-sync control

§5 puts the `--miss` control in row 1 and §7 lifts row 1 out. Both are right and they
collide in one state: while the chrome is condensed — scrolled, or at rest on the Map —
**the control ADR-0080 wants persistent is not on screen.**

It is not silent, which is the part that matters: the status badge follows identity into
the condensed row, so a rejected write still reads as one there, and the control returns
the moment row 1 does (a scroll up, or any other tab). The alternatives were both worse
than the state they fix: a second copy of the control in row 2 is the duplication this
repo has filed four times, and refusing to condense while a write has failed makes the
Map's resting chrome depend on the sync state, which is exactly the "surface says what it
is doing" that §7 exists to prevent. Recorded as a stated cost rather than smoothed over.

## Consequences

- **Frontend only, no data-model change.** `App.tsx`'s `Header` is restructured; `ui/domain/DayStrip` gains the 44×44 pill and the inline month divider; `AppShell` gains the third chrome modifier; `constants.ts` gains the collapse thresholds; `i18n/he.ts` gains the anchor slot's copy and loses the two ribbon strings.
- **ADR-0043 §4's context ribbon is superseded** by the anchor slot. Its colour rules survive unchanged.
- **ADR-0043 §6 is superseded**: the "ring you, drop the gear's circle" cluster becomes one stack plus the gear.
- **ADR-0133 §9's roster entry point moves** from a dedicated cluster button to the merged stack; the sheet itself is unchanged.
- **ADR-0080's failed-sync affordance moves** from an in-flow chrome chip to a row-1 control. It stays persistent and never auto-clears; only its position and its trigger change.
- **ADR-0033 §3 is honoured, not reopened**: `/trips` remains the one presentation of the trip list. The chip still navigates there directly.
- **The trip handoff (ADR-0140 §7) still lands on the chip**, which is smaller — so the landing rect must be **measured**, never written as a constant. That anti-pattern has been filed three times in this repo already.
- **Colour budget unchanged**: amber stays on today and the anchor's return, `--plan` on the mode fill in Plan, `--miss` on the failed-sync control (a status asking for action, not chrome). Nothing decorative takes a semantic hue.
- **Dark mode**: every new surface reads tokens, so it remaps with the rest.

## Alternatives considered

- **One row (`64px`)** — the trip name leaves the chrome entirely. Rejected: in an app you are invited into by link, the trip's name is exactly what you need on arrival, and mode has nowhere to go.
- **"The bar comes apart"** — the day strip returns to `DAY_SCOPED_TABS` only (sticky first row on the Day view, canvas furniture on the Map), mode moves out of the chrome, and the identity line rides the body as a page title that scrolls away. Measured **Home 44 · Day 102 · Index 44 · Map 0**, and it is the only shape that renders a max-length name at 20px uncut. **Rejected by the owner** in favour of a change that leaves the navigation model alone: it makes day-jumping from Home a two-tap action, and makes chrome height differ per tab (44/102/44/0), which may read as instability rather than as character. Recorded because the measurements favour it and a future pass may revisit; it is drawn in the mockup under ⟨הסרגל מתפרק⟩.
- **Mode in row 1** — keeps the day strip at 286px and 5 visible days, but leaves an 18-character name at 13px (below the type ramp's secondary step) and makes mode unreachable while collapsed and on the Map.
- **The chip opens a menu** — see §2.
