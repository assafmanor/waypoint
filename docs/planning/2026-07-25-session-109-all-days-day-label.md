# Session 109 — All-days rows name their day, and why day headers lost

**Date:** 2026-07-25
**Kind:** Behaviour fix (follow-up to session 108) + one helper generalized.
**ADRs:** [0109](../decisions/0109-map-tab-design.md) **session-109 amendment**, [0085](../decisions/0085-relative-day-phrasing.md) (the relative-day vocabulary reused verbatim).

## Why

Session 108 gave every Map row its time. Reported straight after: in **all-days** scope a bare `09:00` on a place three days out reads as today. §1's `<time>` was written for a day-scoped list and never covered the scope that spans the trip.

Two things were already in the house before this session started, which is what made it small:

- **`relativeDay(delta)`** (`lib/time.ts`) already produces the exact vocabulary asked for — היום / מחר / מחרתיים / אתמול / שלשום / עוד N ימים / לפני N ימים.
- **The Index bookings row already solved this shape**: `scheduleLabel` composes `join(label, day, time)` → `נחיתה · מחר · 11:00`.

So this was picking the house pattern, not making a new decision.

## Change

**When the list spans several days, the day leads the same tag** — `מחר · 09:00`. Day-scoped, nothing changes: the strip and the scope hint already name the day, so `היום ·` on every row would be noise. An untimed event now also gains its day, which it previously had no way to state at all.

**`relativeDayLabel(date, today)` was generalized** out of `lib/index-bookings.ts` — where it was a private one-off — into `lib/time.ts` beside `relativeDay`, and the Index now calls the shared one. Rule 8: generalize the existing single call site rather than adding a second copy beside it.

## The crowding question, which was the actual ask

The user's worry, and it was the right one to raise. Three things keep it in bounds:

- The day shares the **existing** amber tag rather than adding a chip, so the meta line grows in width but not element count, and `.map-m` already wraps.
- The clock stays a `dir="ltr"` island **inside** the tag, not the whole tag, since the day word is Hebrew.
- Rough check: `מחר · 09:00 · המראה` is ~19 chars at 12px ≈ 110px, inside ~200px of row width on a 360px phone.

**Day group headers lost, despite looking better.** The all-days list is already day-ordered, `.map-grouphead` already exists (near-me and `כבר היינו` use it), and a header costs zero row width — so it should have won on crowding. It doesn't, because of completeness: a place appears **once**, under its earliest day (union semantics, §4). A hotel spanning days 1–4 would sit only in day 1's group, so a "day 3" header would promise "these are day 3's places" and silently omit the bed you're sleeping in. A per-row label makes no such claim — it says when _this place's_ first moment is. Recorded in the amendment so the option isn't re-proposed as an obvious win; revisit only if the list ever moves to one row per place-day.

## Verification

- `screens/Map.test.tsx` (+3): all-days scope reads `היום · 18:00` / `מחר · 10:00` from one tag; day scope reads bare `18:00`; an untimed event in all-days reads `מחרתיים` with no clock.
- The Index's own `scheduleLabel` tests still pass unchanged, which is what confirms the generalized helper behaves identically at its original call site.
- `typecheck` + `lint` (0 errors) + `build` + `format:check` green; frontend suite **902** passes (899 → +3).

## Next

Epic status unchanged: every ADR-0109 deferred follow-up is done except **(d) `מפה`/view → in-app map focus**, which needs Phase 6's rendered map. **Phase 5** (Plan-mode research) is unblocked; **Phase 6** waits on the Google Cloud slice.
