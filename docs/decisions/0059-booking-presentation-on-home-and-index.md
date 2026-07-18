# 0059 — Booking presentation across the Trip-mode Home & Index (hero transition windows, an "inside a booking" treatment, and a shared appearance pass)

**Status:** Proposed
**Date:** 2026-07-18
**Refines:** [0063](0063-category-time-behaviour-profile.md) (this ADR applies its `bracketed` profile to the Home & Index — see the rebase note below), [0045](0045-trip-home-real-data-only.md) (the hero was declared "unchanged" there; it now gains booking-aware presentation), [0054](0054-ambient-span-events-off-the-day-schedule.md) (ambient hotels are backdrop on the day schedule — this decides how they surface on the hero and as an in-progress treatment), [0053](0053-index-booking-detail-view-and-merged-edit-reach.md) (the booking detail view whose appearance this improves), [0049](0049-index-tab-mode-and-lifecycle.md) (the Index booking row), [0011](0011-hard-soft-event-model.md) (a booking backs a hard event), [0004](0004-integrations-are-pipes.md) (bookings feed existing surfaces, never their own screen), [0047](0047-booking-event-linkage-and-notes.md)/[0048](0048-index-build-data-model-refinements.md) (the Booking↔Event model + `Booking.details` the presentation reads)

## Rebased on ADR-0063 (2026-07-18)

After this ADR was first written, Assaf raised the underlying architecture: don't special-case hotels/flights on each screen — make "shows at start & end, passive in the middle" a **first-class, configurable concept**. That became [ADR-0063](0063-category-time-behaviour-profile.md) (a derived per-`category` time-behaviour profile: `bracketed` + `ambientWhenMultiDay`). **This ADR is now the _application_ of that profile to the Home & Index**, not hotel/flight-specific logic:

- §1's "hotel around check-in/out, transport at departure/arrival" = **render a `bracketed` event by its profile's `transitions` + padding windows.** Hotel and transport are simply the two seeded bracketed categories (`lodging`, `transport`); the hero branches on `isBracketed(event)`, not on type.
- §2's "inside a booking now" treatment = **a `bracketed` event whose span currently contains the clock.**
- §3's shared appearance grammar reads the profile (transition labels, bracketed vs point) so hero/row/detail stay consistent and any future bracketed category is handled for free.

The decisions below stand; read "hotel/flight" as "the `lodging`/`transport` profiles." The exact padding-window values are still this ADR's mockup to settle.

## Context

Assaf's on-the-ground review (2026-07-18) grouped four complaints under "התנהגות הזמנות במסך הבית" — how bookings behave on the Home. Three are about **presentation** and are settled here (the fourth, the day-at-a-glance count, is [ADR-0054](0054-ambient-span-events-off-the-day-schedule.md)'s domain and is refined there):

1. **The hero shows the wrong bookings at the wrong time.** "מלונות רק לפני צ'ק אין (ואולי קצת אחרי) ולפני צ'ק אאוט מוצגים, וכל שאר סוגי ההתחלה סוף (המראה נחיתה וכו')." Today the board hero (`Home.tsx:118-258`) touches bookings only through `nextCode` — the next event's linked confirmation code (`Home.tsx:56-61,227-231`). There is **no hotel/flight/check-in/check-out logic and no `endDate` handling in the hero at all** (ambient stays are handled only below, in the glance backdrop — `Home.tsx:301-312`). So a multi-day hotel either never surfaces meaningfully on Now/Next, or (once span-aware) would sit there for days with nothing to act on. The [backlog](../backlog.md)'s "board hero booking presentation" item flagged exactly this richer hotel/transport hero as unstarted.

2. **No distinct "we're inside a booking now" treatment.** "לחשוב על עיצוב חדש שמסמן בעצם שאנחנו תוך כדי הזמנה כלשהי (המלון שאנחנו בו, הטיסה, וכו') כרגע העיצוב מאוד סתמי." When you're currently staying at the hotel or in the air on the flight, the app has no legible state saying so — the hotel is just a passive "night N of M" chip (`Home.tsx:301-312`), and a flight in progress reads like any generic block.

3. **The booking preview appearance is bland across surfaces.** "מראה התצוגה מקדימה של הזמנות" — clarified (Assaf, 2026-07-18) as **all three** surfaces: the board hero, the Index list row (`BookingLi`, `Index.tsx:139-201`), and the read-only detail view (`BookingDetail.tsx:33-116`).

The through-line: bookings are the trip's hard spine (ADR-0011), but the app presents them thinly and, for hotels, at the wrong moments. A hotel matters when you're **arriving or leaving**, not at 14:00 on day 3.

## Decision

**A booking surfaces on the hero at its transition moments, gets a distinct in-progress treatment while you're inside it, and reads through one consistent presentation grammar wherever it appears.**

**1. The hero surfaces a booking at its transitions, not across its whole span.**

- **Hotel (ambient span, `endDate` set).** It appears as a hero Now/Next item only in transition windows: **approaching check-in** (before, plus a short grace _after_ so "you just checked in" still reads — Assaf's "אולי קצת אחרי"), and **approaching check-out** (before check-out). Through the **settled middle** of the stay it is **not** the hero item — it recedes to the ambient backdrop (ADR-0054) and the in-progress treatment (§2).
- **Transport (flight/train/bus — a point or short span with real start/end).** It surfaces at its transitions: **departure** (המראה) approaching/now and **arrival** (נחיתה) approaching, with route / code / (where modeled) gate presentation — the richer transport hero the backlog flagged.
- **Generalize:** the hero keys on a booking's **transition points** (the start/end of its event), not on its raw presence in the day. Hotels' transitions are check-in/check-out; transport's are departure/arrival. This is the same "transitions matter, the middle doesn't" principle ADR-0054 §amendment applies to the glance markers.
- The **exact window durations** (how long before check-in, how much grace after, the departure lead time) are a tuning detail for the mockup; the decision is _which moments_, not the minutes.

**2. A distinct "you're inside a booking now" treatment.** When the clock is within a booking-backed event's span, Home shows a clear in-progress state instead of the generic chip/block:

- **Hotel:** the ambient backdrop is upgraded from the passive "night N of M" chip to a legible "אתם ב<hotel> · לילה N מתוך M · צ׳ק-אאוט <day>" treatment.
- **Transport:** an "in transit" treatment ("בטיסה ל<dest> · נחיתה <time>").
- Grammar to be set in the mockup; colors stay on-budget (ADR-0028) — amber only for the live/time aspect, no decorative reuse.

**3. One booking-presentation grammar, applied to all three surfaces** (Assaf: "all of the above"):

- **Board hero** — per §1/§2.
- **Index row** (`BookingLi`, `Index.tsx:139-201`) — a clearer type / timing / code hierarchy so a booking reads at a glance in the list.
- **Read-only detail view** (`BookingDetail.tsx:33-116`) — a richer layout for the full record (code, provider, route, room, WiFi, notes, timing) so the Index's durable-reference value (ADR-0049 §1) actually _looks_ like a record worth keeping after the trip.
- The three share one grammar (type badge, timing label by type — המראה/נחיתה, צ׳ק-אין/צ׳ק-אאוט per ADR-0053 — code treatment) so a booking is recognisable wherever it appears.

## Consequences

- **Frontend + derivation only; no data-model or backend change.** Every field exists (`bookingId`, `endDate`, `Booking.details`, `Place`, ADR-0047/0048/0051); the hero derivation reuses `buildSpanSeed` / the ambient helpers (`glance.ts:62-64`).
- The hero block (`Home.tsx` `deriveNow` region, lines 47/56-61/118-258) gains a small pure helper — "is now in a check-in / check-out window, or in-transit, or mid-stay?" — driving both §1 (which booking is the hero item) and §2 (the in-progress treatment). Unit-testable like `glance.ts` / `readiness.ts`.
- **Subsumes the backlog's "board hero booking presentation" item** (§1 is that work).
- **Cross-refs:** §2's in-progress hotel treatment builds on ADR-0054's ambient backdrop; §3's detail view is ADR-0053's component; the glance transition markers are ADR-0054 §amendment (2026-07-18). Together these three ADRs make bookings coherent across Home + Index.
- **Design record first.** This ADR + the companion mockup `mockups/booking-presentation-v1.html` (built session 32, 2026-07-18) land before implementation; the mockup demonstrates the profile-driven states (pre-check-in / mid-stay / pre-check-out / pre-departure / in-transit) across the hero, the Index row, and the detail view. It flips to Accepted on Assaf's sign-off.
- Copy additions go in `he.ts` (in-transit / check-in-out / "you're staying at" strings), no em dashes (use `·`).

## Settled in the mockup (2026-07-18, `mockups/booking-presentation-v1.html`) — for sign-off

- **The "inside a booking" treatment uses teal (location), not amber.** It is a _"where you are"_ statement — at the hotel, in the air — so on the ADR-0028 budget it is a **location** cue (teal), which deliberately sets it apart from the amber time-critical hero. This is the concrete answer to Assaf's "העיצוב מאוד סתמי": the in-progress state now has its own principled colour identity instead of reading like a generic block.
- **One grammar, two placements** (resolves open question 3): a single teal "inside a booking" grammar, placed differently by whether the event is ambient. An **ambient hotel mid-stay** shows a teal **backdrop band above the hero** (you're staying there but _doing_ something else, which the hero still shows); a **bracketed point in progress** (a flight in the air) **fills the hero's NOW slot** (the flight _is_ the current activity), with amber only on the time-to-landing progress. Not two components — one visual grammar, two positions driven by `isAmbient`.
- Still open for sign-off: the exact window durations (below), and whether transport gate/terminal data exists to show.

## Open questions (for the mockup pass)

- The exact pre-check-in / post-check-in-grace / pre-check-out / departure-lead durations.
- Whether transport gate/terminal is available to show — today `Booking.details` carries code/provider/route but gate may not be modeled; the mockup shows only fields we actually have (real-data-only, ADR-0045).
- ~~Whether the in-transit treatment needs a distinct visual from the hotel in-progress treatment or shares one component.~~ **Proposed in the mockup: one teal grammar, two placements** (see "Settled in the mockup" above) — pending sign-off.

## Alternatives considered

- **Keep the hotel on the hero across the whole stay** (the naive "make hotels span-aware on the hero"). Rejected: it dominates Now/Next for days with nothing actionable — the exact always-there blandness Assaf flagged.
- **Fix only the hero; skip the row/detail polish.** Rejected: Assaf named all three surfaces, and a shared grammar is cheaper to design once than to retrofit three times.
- **A stored `transition`/`inProgress` flag on the event.** Rejected: derive it from the span + clock, consistent with "phases/now are derived, never stored" (ADR-0018/0054).
- **Give hotels/flights their own hero variant screen.** Rejected: integrations/bookings feed existing surfaces, never their own screen (ADR-0004).
