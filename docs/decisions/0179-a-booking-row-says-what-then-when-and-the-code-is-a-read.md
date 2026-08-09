# 0179 — A booking row says **what**, then **when** — and the code is a read, not a row

**Status:** Accepted (2026-08-09) — **built** the same day; see the build log at the foot for the four places the build diverged from the drawing, and why
**Date:** 2026-08-09
**Session note:** [`planning/2026-08-09-session-237-the-booking-row-is-crowded.md`](../planning/2026-08-09-session-237-the-booking-row-is-crowded.md)
**Mockup:** [`mockups/booking-row-crowding-v1.html`](../../mockups/booking-row-crowding-v1.html)

**Extends:** [0178](0178-a-day-row-says-what-then-when.md) — the same decision on the third surface that draws a row, arrived at from the same measurement. 0178 is not amended: it scoped itself to the two **day** surfaces and this is the Index.
**Amends in place:** [0059](0059-booking-presentation-on-home-and-index.md) §3 — the row's shared booking grammar keeps the tinted badge and the lock, and loses the type chip and the confirmation code. [0163](0163-a-hire-is-not-a-journey.md)'s amendment — `typeChipAddsMeaning` gains a second term.
**Relates:** [0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §4 + §8 (the row's tap is a read, and the event row already deleted the code), [0152](0152-a-note-is-one-entity-with-an-optional-host.md) §6c (elements, not a joined string; `nowrap` before shrink), [0011](0011-hard-soft-event-model.md) (the lock), [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) (the transition verb this narrows), [0089](0089-past-booking-rows-drop-the-transition-verb.md) (the verb already drops in the past list), [0017](0017-mobile-first-device-targets.md) (360px is the design width), [0028](0028-plan-violet-color-budget-dark-ready.md) (amber is the clock's), [0096](0096-per-domain-claude-md-guides.md) (rule 8 — `ListRow` does not fork)

## Context

The owner, hours after 0178 shipped, with three screenshots of the Index bookings screen:

> Now I'm worried that the booking rows are too crowded as well. See screenshots. […] design and mockup the booking row. It should have a similar style and approach to the event row. Lets also try to think if all information is necessary to be on the card row itself instead of only being on the booking preview only

Two questions. The first is nearly answered before it is asked — this row has drawn two lines since it was built, so 0178's _shape_ is already here. The second is the real one, and the measurement is what forced it to a conclusion.

**The confirmation code is this row's `.bld-time`.** 0178's whole Context was one finding: a trailing element that is `flex: 0 0 auto` is sized by its own widest content, and the title gets the remainder. `.wp-listrow-right` is `flex: 0 0 auto` and the first thing in it is `.code`, an unbounded string. Measured off the rendered DOM at 360px, against the row the owner photographed:

|                                                          |                |
| -------------------------------------------------------- | -------------- |
| the row                                                  | 330px          |
| the code `#MEGAZIP-T141215488` (19 chars of 11.5px mono) | **133px**      |
| **left for the title**                                   | **43px · 13%** |

0178 reported 48px of 302 and called it the defect. This is 43px of 330, one screen over, from the same cause. Three further facts, none recoverable from the screenshots:

- **`ListRow` is not what is wrong.** It has three call sites. Documents pass a formatted byte size and a lock glyph; notes pass one link glyph; **bookings are the only host putting an unbounded string in that slot.** So nothing here forks the shared component — rule 8 in the easy direction.
- **The event row already deleted this exact fact, and wrote down why.** `.wp-event-m`'s comment reads _"GLYPHS ONLY […] no place name, no confirmation code"_ ([0174](0174-an-attachment-is-marked-and-opened-and-an-event-has-a-read.md) §8). "The code lives in the read, not on the row" is not a new position; it is the position the other row surface already holds, and this one did not get the memo.
- **The type chip is drawn four times.** `טיסה` beside a ✈️ badge, on an amber (=transport) tint, over a `המראה` that no other booking type can produce — under a filter chip reading `טיסה 4` which, while selected, _guarantees_ every row on screen is one.

And the detail sheet, checked rather than assumed, already carries **every** fact the row draws, most of them more precisely: both span edges as full day-times with their labels, duration, confirmation code, IATA codes, location with navigate/map, provider, room, wifi, journey leg, round-trip partner. Nothing this ADR removes is lost; it moves one tap away, and 0174 §4 made that tap a read.

## Decision

### 1. The row says one thing per line, and the trailing column becomes a constant

Line one is the **title**, alone. Line two is the **when**. The two lines already existed; what changes is what sits on them, and that after the code leaves, the trailing slot holds only `sync` (19px, reserved by [0091](0091-sync-badge-cloud-and-silent-when-synced.md)) and the `⋯`. **The title's width stops being a function of another row's data.**

Measured at 360px: the title goes **43px → 184px** (13% → 56%); at 390px, 73px → 214px. The worst row in the reported list goes from **9 text lines to 2**, and the five-row list from **593px to 304px** — the row gets calmer _and_ shorter, which is the objection this kind of change usually has to answer.

### 2. Four facts leave the row for the read

**a. The 🔗 link glyph.** Decoration on the "yes" branch: the schedule sentence _is_ the proof the booking is scheduled, and the other state says `לא משובץ` in words. It is also the only glyph on the row that cannot be acted on — the note and document marks stand for content that exists.

**b. The type chip.** Said by the badge glyph, the badge tint, the verb and the active filter chip. 0163's amendment already drops it when it repeats the **title**; this adds one term for when it repeats the **badge**. It survives exactly where the badge stops saying the type — `chosenIcon(event?.icon)` overrides the glyph, so a hotel wearing ⭐ keeps its chip. One more term in an existing predicate, not a new mechanism.

**c. The confirmation code.** Off the row. Put to the owner as an explicit fork with all three arms drawn (mockup §5) and **accepted**: (a) off, (b) demoted onto the when line, (c) kept trailing. The argument for (a) is precedent rather than taste — 0174 §8 — plus two facts: `searchTerms` already matches the code, so a booking is _findable_ by a code that is not _drawn_; and in the owner's own first screenshot the same `#8JHEI4` repeats on all four legs of a round trip ([0154](0154-transport-authoring-a-route-shape-a-round-trip-and-a-derived-pair.md)'s pair), so on that list the code discriminates between exactly nothing while buying the title's width. (b) is recorded as the live alternative should the Index ever need to be a counter-side surface: it stops pricing the title but costs ~90px of a line already in deficit.

**d. The transition verb, except on a span's closing edge.** The narrowest call here, and the owner's. On a **start** edge the map from type to verb is 1:1, so `המראה` beside ✈️ says the type twice. On a **closing** edge it is the only thing on the row that can say _which_ end: a stay past its check-in day shows check-out, and `11:00` alone cannot tell you which of the two it is. `scheduleLabel` already computes that branch (`multiDay && today > event.date`), so this is a condition on a fact the function has. [0089](0089-past-booking-rows-drop-the-transition-verb.md) already drops the verb in the past list and is untouched.

### 3. The when line is a sentence with a clock for a subject

`🔒 עוד 33 ימים · 12:30 · 3:45 שע׳` — the same object as `.wp-event-time` one surface over, at this row's density rather than the card's. The clock is mono and full-ink; the day is muted; the duration is a quiet annotation, the demotion `.wp-event-dur` already makes.

**This requires `scheduleLabel` to return parts rather than a joined string.** Flex cannot style, protect or re-order half of a text node — the identical wall 0152 §6c hit on the event card ("the text is ELEMENTS rather than a joined string"). Without it there is no clock-as-anchor and no protected day, and the line reverts to a flat grey run.

**The lock moves here**, from a title line where it sat between the route and a chip. 0011's commitment is a commitment about a **time**, which is exactly 0178 §4's reasoning; this row now draws it once, beside the fact it is about.

### 4. What the line protects when it cannot fit, stated rather than left to source order

Three rules, each written after a render disproved the version before it:

- **One line, always** (`flex-wrap: nowrap`). Drawn first as `wrap`, on the reading that 0178 §3 lets the day card's when line wrap. It did not wrap, it **stacked**: flex distributes negative free space only _within_ a line, so a container permitted to wrap never asks its shrinkable child to shrink. The two rows carrying marks reached **four bands** at 360px. The difference from 0178 is real and not a contradiction: what wraps there is a **zone pill**, a fixed badge with nowhere to shrink to; what overflows here is text, which has an ellipsis.
- **The day never shrinks; the verb does.** With `verb · day` as one shrinkable span the ellipsis ate the **tail**, and the tail is the day: the check-out row rendered `צ׳ק-אאוט …` and lost `מחר` — the one fact distinguishing it from every other row — to keep a word the badge half-says already. Two items make the priority an assertion.
- **One annotation, not two.** Verb and duration together still overflowed by 23px, and the verb gave way to `צ׳ק-...`, which no longer distinguishes check-out from check-in on the single row it was kept for. So the slot holds one: the verb where it disambiguates, the duration everywhere else. On a closing edge this is also a **correction**, not only a width concession — `formatBookingDuration` returns the _whole_ stay's length, so `11:00 · 5 לילות` on a check-out row invites precisely the wrong parse.

Measured across ten rows in both themes at both widths: **the ellipsis never fires**, every row is exactly two bands, and the two-dimensional collision sweep is clean.

### 5. The marks move to the title line

The note and document marks (0174 §1) are ~21px each and rightly unshrinkable — a half-drawn glyph says nothing. On the meta line they took that width from a when line already in deficit, and the measured result was four rows ellipsising their day. The title line has the slack: a booking title is short on the overwhelming majority of rows, and the marks are siblings of the clamped title, so a long title folds behind them rather than pushing them off.

This also returns the row to agreement with the day card, where the marks have **never** competed with the when line — `.wp-event-m` is a third line of its own. This row has two lines to spend, not three, so the marks join the title rather than get one.

## Consequences

**`ListRow` does not change shape, and the other two hosts are unaffected** — drawn in mockup §6 rather than promised. The one shared change is the meta line becoming a flex container; documents put a lone mark there and notes put nothing.

**A fact leaves a surface, and that is the part to watch.** The confirmation code has been on this row since the Index was built. The claim is that a booking is _found_ by code (search) and _read_ by code (detail) but need not be _scanned_ by code — and if that is wrong, the symptom will be people opening rows to check codes, which is worth listening for. Mockup §5b is the drawn fallback.

**`scheduleLabel`'s signature changes** (string → parts), which touches its callers. It has one today.

**Not seen on a device** ([0017](0017-mobile-first-device-targets.md)). Two questions belong to that pass and not to this document: whether the muted day beside a full-ink clock reads as hierarchy or as something switched off, and whether losing the verb on start edges is felt on a screen full of ✈️ rows where it never disambiguated anything.

**Deliberately not decided here:** whether `עוד 33 ימים` is the right fact for an index at all, or whether a date (`ו׳ · 12 בספט׳`, [0176](0176-a-date-reads-day-first-wherever-you-open-it.md)) reads better when the question is "when is my flight". A countdown is Home's language; an index is a reference. That is a change to the fact rather than to the crowding, and it is the next thing worth measuring.

**Rejected, each drawn or measured so the rejection is checkable:** shortening the code (`#8JHEI…` — a confirmation code you cannot use, still buying the same width); a `max-width` on `ListRow`'s trailing slot (fixes the symptom in three places, leaves the cause in one, and turns every long code into an unreadable `…` inside a shared component); hiding the code only when it is long (a rule two adjacent rows resolve differently for no visible reason — the family 0178 rejected with `ROUTE_INLINE_MAX_CHARS`); a third line (past two, a row stops being scannable, and the bookings list is one you scan); and deleting the type chip unconditionally (the badge glyph is overridable, so the chip earns its place exactly there).

**One instrument correction that should travel.** 0178's build log made a two-dimensional collision sweep mandatory for any row-layout mockup. That version reads `getBoundingClientRect`, and a **wrapped inline element's** bounding box is the union of its fragments — it claims the ragged space beside each line, where the element paints nothing. Run here it reported `9×10 · .bk-dur ↔ .icon` on the **shipped** row: a false positive, and precisely the "passes beneath" vs "collides with" distinction the sweep was added to make. It never met the case because it swept the direct children of a grid, all block-level. This file's version reads `getClientRects()` — one rect per fragment, the bounding box for a block — and that is the shape worth carrying to the next row mockup.

## Build log — 2026-08-09, same day

**The mockup's numbers held.** Predicted title width 184px at 360px / 214px at 390px; measured off the **real components** under the app's real stylesheets, with `.body`'s `padding: 16px 16px 92px` applied: **182px / 212px**. The 2px is the mockup's 14px frame against the shell's 16px. No collisions, no ellipsis, every row two bands, and a uniform 5px trailing gap on every row — so removing the code's slot left no dead space (flex `gap` is not charged for a child that does not render, which is the opposite of the `column-gap` trap ADR-0178 §4's build log hit on a grid).

Four divergences, each recorded because each is something a reader would otherwise rediscover.

**1. Rule 8 caught a third copy before it was written, and collected the two that already existed.** §3 was drafted as a fresh set of Index-scoped rules for the lock, the duration and the separator. But `.wp-event-timelock` and `.bld-timelock` were **byte-identical** — both added by ADR-0178 the same day, in two files — and this would have been the third, plus a third copy of `aria-label={t.event.hard} title={t.event.hard}` around a third `<Icon name="lock" />`. That is ADR-0139's shape exactly: three settle affordances drifted on four axes before `SettleControl` collected them, and every axis was the **vocabulary**, not the geometry the copies were made for. So the mark became one object — `HardLock` + `.hard-lock` in `ui/when-line.css` — with three consumers, and `.when-dur` collected the duration's family/weight/hue while each host keeps only its own size. The whole when **line** deliberately stays per-host: Plan's is a `button` carrying ADR-0161 §7's chip and ADR-0177's `ValueToken`, the day card's is a readout with a zone pill and a next-day superscript, this one is a sentence with a verb. Collecting those would be a restructure, not an extraction — flagged here rather than silently taken on, per `frontend/CLAUDE.md`.

**2. The separator became a `::before`, and that is what the mockup got wrong.** The drawing rendered `<span class="bk-sep">·</span>` — real elements, and therefore real entries in the accessibility tree, where the row reads _"check-out dot tomorrow dot eleven o'clock"_. Both day rows already draw theirs as a pseudo-element (`.bld-timemeta::before`), so the build followed them. **Changing the mechanism after the measurement invalidated the measurement**, and nothing re-rendered the mockup to notice — which is how the next item shipped as far as a screenshot.

**3. `dir="auto"` on the clock put the separator on the wrong side of it.** With the dot as a `::before`, `.bk-clock` carrying `dir="auto"` resolves to **LTR** — its content opens with digits — so the pseudo rendered at the box's _left_ edge: after the clock instead of before it, leaving a trailing `·` at the end of every row and no separator between the day and the time. `frontend/CLAUDE.md` already states the rule this breaks: the attribute goes on the element holding **the value and nothing else**, and this one also held a generated dot. The isolate moved inward to a `<bdi>`, which is what `RouteLabel` does for a place name. **Only a render could see this** — the DOM, the CSS and all 3200 tests were correct and agreed with each other.

**4. The first verification harness was a reproduction, and it drifted from the component inside ten minutes.** The markup was hand-built to mirror `BookingLi`, and when the fix in (3) landed in the real file the harness still carried `dir="auto"` — so the re-render reproduced the _old_ defect and read as "the fix did not work". ADR-0178's build log already says to dump the actual markup out of the component under test; this build did it the other way first and paid for it. The dump now comes from `IndexBookingsView` itself through its own test harness.

**Tests.** 17 added, 3200 green. The row's contract had **no** guard at all before this: the entire suite stayed green while the confirmation code, the type chip and the 🔗 glyph came off the row, which is precisely why each is now pinned by an assertion. `scheduleParts` is tested on the edge it reports (`start` before and on the opening day, `end` after) and on ADR-0089's unchanged verb suppression; `typeChipAddsMeaning` on both terms independently; the row on the code's absence, the chip's and the glyph's absence, exactly one lock and its position in the when line, the verb's presence per edge, the duration yielding to it, and the marks riding the title line. Six existing lock assertions were repointed from the two per-surface class names to the shared one — the assertions' meaning is unchanged.

`typecheck`, `build` and the full suite clean.
