# 0043 — Day view: the now-line, derived-phase presentation, phase-scoped verbs, and the archive chrome

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0011](0011-hard-soft-event-model.md) (hard/soft), [0025](0025-trip-mode-edit-capability-tiers.md) (edit tiers), [0027](0027-soft-item-lifecycle-shelf-slip.md) (derived phases, Do-it-now, shelf), [0028](0028-plan-violet-color-budget-dark-ready.md) (color budget, mode identity), [0029](0029-trip-mode-day-scope-gating.md) (past/future day gating), [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (finished-trip archive)
**Builds on:** [0018](0018-timeline-data-model-shape.md) / [0026](0026-real-clock-and-dev-time-travel.md) (state is `planned | done | skipped`; "now" is derived from the clock, never stored)

## Context

The Trip-mode day view (`frontend/src/screens/DayView.tsx`) is the on-the-ground core, but it presents the day almost timelessly. The only clock-derived cue in the list is an amber ring on the single in-progress "now" event; a `done` event dims to 50% and keeps its slot. Three gaps follow:

1. **No sense of where we are in the day, or what already happened.** A 2 pm soft plan still sitting there at 4 pm looks identical to an upcoming one. ADR-0027 already _decided_ a clock-derived lifecycle phase model (Upcoming / Now / Passed / Slipped / Unresolved / Done / Skipped) and marked it implemented, but the ADR-0041 concurrency rewrite of `DayView` did not carry the phase treatment forward — so it exists on paper, not on screen.
2. **The "סיימנו" (Done) button no longer pulls its weight where it sits.** It bundled two jobs — _hygiene_ (advance the board past a thing) and _record_ (we actually did this). Once passed-phase presentation exists, the clock does the hygiene job for free, leaving only the record — but the button is still a loud primary verb on every soft row up front, where nobody taps "done" after every meal.
3. **Past days don't feel like the past.** ADR-0029 locks editing on a past day in Trip mode and says "the day view itself carries a visual signal (not just the day-strip pill)," but no such signal was built. The day-strip also spends amber on the _selected_ pill rather than on _today_, so while browsing history the live anchor is invisible and amber (a time/now color, ADR-0028) is attached to a day that isn't now.

Design exploration and two review rounds are recorded in `mockups/trip-mode-day-view-v1.html`.

## Decision

Everything here is **derived from the real clock (ADR-0026), never stored** — no schema change. Status is still only ever set by a human tap (ADR-0018/0027).

### 1. A now-line, and passed events recede (Trip mode)

- Insert a **now-line** into today's timeline at the current moment: a **soft amber hairline** with a flat mono time label. It splits the day into _behind_ (passed) and _ahead_ (upcoming) and travels down the list as time moves.
- The now-line is a **quiet time reference**, deliberately below the live event in the visual hierarchy. The amber **ring on the in-progress event stays the one accent**; the line drops the dark chip, glow, and pulse of the first exploration (that made it a second loud element). Its movement is its liveness — no pulse. On the day tab there is no board, so this is the tab's single live cue ("pulse means live," design-language) even without a pulse.
- **Passed** events (behind the line) render **receded** — quieter, desaturated, still legible reference. This is the ADR-0027 phase model finally made visible; the now-line is the new piece.
- The now-line renders **only on today**, and only inside the live window (ADR-0040). A day with no "now" shows none.
- **The view lands on now.** Opening today's day view **auto-scrolls to the now-line once on open**, leaving a passed event or two visible above for context — so "what now / what next" is on screen immediately instead of below a long morning. It fires only on today (a past/future day has no "now" and opens at the top), does not fight a subsequent manual scroll, is a no-op when the day already fits, and is smooth by default / instant under `prefers-reduced-motion`.

### 2. Done presentation + the "סיימנו" reframe

- **Done reframed from hygiene to record.** With passed-phase doing hygiene, `done` is an **optional, affirmative "we did this"** — the positive twin of Skip (ADR-0027). Its color is **`--ok` green (a status), never amber** — a record is not a clock event (ADR-0028).
- **Demoted, not removed.** On an upcoming/now soft event the forward verbs lead (Navigate, Skip, nudge) and `done` is present but last. Its natural home is **behind the line**: a passed-but-unmarked soft event surfaces a light inline **settle strip — "✓ היינו / דלג"** — the honest "still on?" moment, made one tap, exactly where you glance back.
- **Done settles.** A completed event becomes a calm green-checked, receded row rather than a fat 50%-opacity ghost holding its full slot. Reversible via the row's existing `שחזר`.
- **Never auto-written** (ADR-0027 holds): a passed event stays "unresolved" until a human optionally settles it.

### 3. Verbs are scoped by phase and day (extends ADR-0029)

- **Phase-adaptive nudge.** The ±30 stepper offers only moves that are possible: **both** directions for an upcoming event; **+30 only** for a now event (pulling it earlier would move it into the past, which the `MOVE_INTO_PAST` guard rejects anyway — ADR-0027 §3); **neither** once passed, and none at all on a past day (retiming history is locked, ADR-0029).
- **"אירוע חדש" is right-sized to Tier-1.** Adding on the ground is a real need, but today's button opens the full builder (any day, hard/soft, bookings) — that is Tier-2/3 _building_ (ADR-0025). Replace it with a **quick-add scoped to a soft event, today, at the next open slot**; hard events, exact scheduling, bookings, and other days route to Plan (the ⋯ sheet or the mode escape). On a **past day the add affordance is hidden entirely** — create is locked (ADR-0029) and the archive is read-only.

### 4. The archive chrome — day view + top bar

- **Past-day list (Trip mode):** a calm, slightly desaturated **archive wash** led by a read-only banner. No now-line (there is no "now" on a day that's over), no amber. Editing is gated to Plan (ADR-0029), but **Done / Skip / Navigate stay** — an unresolved item can still be settled, which is precisely the reframed Done's retrospective job.
- **The day-strip is anchored to _today_, not to the selection.** Amber marks **today** (the trip's live anchor) wherever you browse; **selecting a non-today day is a neutral highlight**, a **future day is violet** (plan-ahead, ADR-0028). A **context ribbon** under the strip names the state ("יום שהיה · היסטוריה" / "יום עתידי") and offers one-tap **back-to-today**. This keeps amber on the thing that is actually "now" and makes "where's today?" always answerable from the chrome.
- **One archive language.** The past-day treatment is the same visual language a **finished trip** uses (ADR-0040, a Plan-mode read-only archive) — past-day and past-trip look like one system, not two.

### 5. Plan mode gets a now-_reference_, nothing else

The now-line, phases, Done, and the settle strip are **Trip-only** live/on-the-ground grammar — Plan mode is never "live" (design-language), and ADR-0029 gives Plan no past/future distinction (rebuilding any day is the point). The **one** cross-mode element is a **static "now" reference** in the Plan day builder, shown **only when the day on screen is today** and the trip is live — useful for "what's still ahead to build." It is kept firmly in Plan's grammar so it can never read as a live signal: **violet, dashed line, hollow marker, no pulse, no glow** — the deliberate opposite of the Trip now-line. Past/future builder days show no reference.

### 6. Account / settings cluster (minor)

Two small moves in the header-actions cluster:

- **Ring "you".** app-shell.md §6 already intends the account avatar to be "ringed, distinct from the plain member cluster," but the shipped ring (a faint `rgba(255,255,255,0.55)` border, `.account-btn`) is too subtle to read — your own avatar looks like any member's. Strengthen it into a **clear outer ring** so "you" is unmistakable.
- **Drop the gear's circle.** Settings today sits in a circle (`.gear-btn`: translucent-bordered in Trip, violet-tinted in Plan) — a third circle in the identity row, so a UI control reads as part of the identity cluster. Make it a **borderless ghost icon** ("emoji are content, icons are UI," design-language), mode-following: cool blue-grey in Trip, violet-tinted in Plan.

Together: identity is round chips (member cluster + your clearly-ringed avatar); settings is a flat control beside them. Lightest-weight item in this ADR.

## Consequences

- **Frontend only, no data-model change.** `DayView.tsx` computes each event's phase from the clock (a `deriveNow`-adjacent helper) and renders the now-line, receded/settled rows, and the settle strip; on mount for today it scrolls the now-line into view (guarded so it runs once and yields to manual scroll); the ±30 stepper and the header add-button read phase/day-scope; `App.tsx`'s day-strip switches amber from the selected pill to today's pill and adds the context ribbon; `PlanDay.tsx` renders the static now-reference when `activeDate === todayInTz(...)` within the live window. New Hebrew copy lands in `i18n/he.ts`.
- **Reuses existing rules, doesn't add mechanism:** the phase model is ADR-0027; day-scope gating is ADR-0029; the archive posture is ADR-0040; the color assignments are ADR-0028. This ADR makes them visible in the day view and resolves the presentation questions they left open.
- **Color budget stays honest:** amber = now/today, `--ok` = the "we did this" record, `--plan` = the Plan reference and future-day selection, neutral = history. Nothing borrows a hue it doesn't mean.
- **Dark mode:** all new surfaces read through tokens, so they remap with the rest (ADR-0028); the amber now-line and violet reference already have dark variants.
- Supersedes the loud first-pass now-line explored in the mockup (dark chip + glow + pulse) in favor of the quiet hairline.

## Alternatives considered

- **Remove "סיימנו" entirely, rely on passed-phase.** Rejected — a plan you _did_ becomes indistinguishable from one you _skipped_ (both read "passed"), which erases the record and forecloses the "trip wrapped" retrospective ADR-0040 anticipates.
- **Keep Done as a loud primary verb (status quo).** Rejected — duplicates hygiene the clock now does and asks for a tap nobody makes up front; the value is in looking back, so that is where the verb belongs.
- **A vivid, pulsing, board-styled now-line.** Rejected after review — two loud amber elements on one tab; the live event should stay the accent and the line should whisper.
- **Give Plan mode the full now-line and phase treatment.** Rejected — Plan is never live and has no past/future distinction; a live marker there blurs mode identity. Only a static, violet, non-live _reference_ is warranted.
- **A live now-marker in the Plan builder too (amber, pulsing).** Rejected for the same reason — it would import the board's grammar into the drafting table.
- **Keep amber on the selected day-strip pill.** Rejected — it spends the "now" color on whatever day you're browsing and leaves today invisible in history; anchoring amber to today restores the color's meaning.
