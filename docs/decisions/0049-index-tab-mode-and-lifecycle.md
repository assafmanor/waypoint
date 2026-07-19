# 0049 — The Index tab across mode and lifecycle: chrome-only mode difference, a past/upcoming split, a read-only archive

**Status:** Accepted
**Date:** 2026-07-16
**Refines:** [0016](0016-plan-trip-modes-one-surface.md) (Plan/Trip is one surface; mode derived from dates), [0040](0040-trip-mode-access-window-and-past-trip-archive.md) (a finished trip is a read-only archive), [0044](0044-settling-a-finished-trip.md) (the structural archive), [0028](0028-plan-violet-color-budget-dark-ready.md) (mode identity is chrome), [0047](0047-booking-event-linkage-and-notes.md) (the Index content this presents)

## Context

The Index tab (`mockups/trip-index-v1.html`) has to render in Plan mode and Trip mode, before / during / after the trip. That is two independent axes, and conflating them produces either duplicated designs or wrong states (e.g. a finished trip still showing "add booking"). This ADR fixes how the Index behaves across both.

The key property: the Index is a **durable reference surface** (ADR-0004 — integrations feed it; it is the lasting list of bookings/documents). Unlike Home (a live board) or Day (a now-line with phase verbs), almost nothing on it is time-relative. That is what lets the two axes stay clean.

## Decision

**1. Mode changes chrome only; Index content and capability are identical in Plan and Trip.** Trip renders the night chrome (dark indigo, amber, 🧭); Plan renders the drafting-table reskin (light paper, `--plan` violet, drafting grid, ✏️) — the same reskin as `mockups/plan-mode-v1.html`. The bookings, documents, and every capability on the tab are the same in both, because **nothing on the Index is Tier-3-gated**: add-booking, link, edit/delete, and document upload are all Tier 2 (ADR-0025), available in Trip and Plan alike. Build/schedule affordances keep `--plan` violet in both modes (design-language: violet marks a plan/build action, not a mode). So "Plan-mode Index during a trip" vs. "before the trip" is not a separate design — it is the same Plan chrome over a different lifecycle content state (see §2). We explicitly rejected diverging content by mode (e.g. Trip surfacing the next/active booking to the top) — Home's quick-access already does "next code," and a stable reference list is more useful than a re-sorting one.

**2. Lifecycle drives content state, independent of mode:**

- **Before (brand-new trip):** everything is upcoming; teaching empty states ("האינדקס עוד ריק") that lead to the add flow, never a silent empty list. "Before the trip _with_ bookings" is simply the during view minus the past section.
- **During:** bookings already behind you mute into a **"כבר מאחוריכם" past section** below the upcoming/active ones, so a ten-day trip's used bookings don't crowd the next flight. "Behind you" is measured against the booking's **closing edge, not its calendar day** (see the boundary rule below): a flight drops the moment it lands, a hotel the moment its check-out passes — not at the next midnight. Past bookings stay openable (durable record — a flown flight's code for a delay claim, a receipt). The active booking (the hotel you're in) reads "פעיל".
- **After (archive):** the finished trip is **read-only** (ADR-0040/0044) — no add/edit affordances, no "פעיל"/now states, an "🗄️ הטיול הסתיים · תצוגה בלבד" banner, and the desaturated archive **wash** (ADR-0043's past-day treatment). **Documents remain openable** (you still want the visa scan or the insurance policy after the trip); bookings remain viewable.

**3. Bookings and documents are peers, with matched add affordances.** Both lists get the same prominent "＋ הוסף הזמנה" / "＋ הוסף מסמך" entry (removed in the read-only archive). An earlier draft had a prominent add-booking button but a quiet bottom-of-card add-document link; the asymmetry made the document action easy to miss. Peer lists, peer affordances.

### Refinement (2026-07-19): the closing-edge boundary rule

The original ("Event's end is behind now") was implemented **day-granular** — a booking dropped to past only once its whole calendar day was behind you (`lastDay(event) < today`). That kept a mid-stay hotel from filing itself under "past" the morning after check-in, but it also kept a flight that landed at 04:30 and a check-out completed at 10:00 sitting in the active list until the next midnight, which reads as a bug (they plainly already happened).

We reconcile the code to the ADR's stated intent — an **end-instant** rule — via one type-agnostic primitive, so it composes cleanly and no new booking type/category/profile can silently break it. A booking's **closing edge** is derived purely from its linked event's timing _shape_, never its type:

| Event shape                                       | Closing edge            | Past when     |
| ------------------------------------------------- | ----------------------- | ------------- |
| `endsAt` set (arrival / check-out / activity end) | that instant            | instant < now |
| multi-day, no end **time** (`endDate` only)       | the whole check-out day | day < today   |
| a single moment (`startsAt`, no end)              | that instant            | instant < now |
| only a `date` (no clock time)                     | the whole day           | day < today   |

This keeps the two cases the day-rule got right — a **mid-stay hotel** (its closing edge is the future check-out, so it never drops early) and an **untimed booking** (lingers till midnight) — while a timed point-in-time booking drops the moment it's genuinely behind you.

- **The primitive is `eventEndBoundary(event)` in `@waypoint/shared`** (beside `isMultiDay`/`isAmbient`/`eventDurationUnit`, ADR-0063's time-shape derivations). It's **clock-free and unit-tested**, returning a discriminated `{ kind: 'instant' } | { kind: 'day' }` boundary; the frontend's `isEventPast(event, at, tz)` (in `lib/time.ts`) resolves it against the trip clock + timezone (ADR-0026). Splitting shape-derivation (shared) from clock-resolution (frontend) is what keeps it pure.
- **Type-agnostic by construction:** it branches on the presence of `endsAt`/`endDate`/`startsAt`/`date`, not on booking type or category. A new bracketed type, a new ambient category, or a manual (non-booking) event inherits correct past/upcoming behaviour with no edit here — which was the design goal.
- **Trade-off — gradual re-sorting:** an instant rule migrates one row at a time across the day as each booking's edge passes, rather than the day-rule's all-at-once midnight flip. That is more movement than §1's "stable reference list" preference, but it is exactly what "already behind you" should mean, and it is gradual and predictable (each row crosses precisely when it's done), not churn.
- **Distinct from `eventPhase`'s `passed`** (`lib/time.ts`), which is single-day-scoped (`start ≤ at < end` within one day) for the Day view's now-line; `isEventPast` spans the whole trip and honours multi-day `endDate`. They are cousins over the same clock, deliberately not unified.

## Consequences

- **One Index screen, skinned and state-switched — not six permutations.** Mode = a chrome reskin (the plan-mode chrome already exists); lifecycle = the content states in §2. `mockups/trip-index-v1.html` demonstrates the Trip-chrome × {during, before, archive} states; the Plan reskin is the known drafting-table chrome applied to the same content.
- **The past/upcoming split needs a "now" reference**, which the app already derives (ADR-0026 real clock); a booking is "past" when its linked Event's **closing edge** is behind now (the §2 refinement above makes "closing edge" precise). Unlinked bookings (no Event) are never "past" — they sit with upcoming until scheduled.
- **Archive read-only is consistent with ADR-0040/0044:** the finished trip is a read-only _structural_ archive. Bookings/documents have nothing to "settle" (unlike day-view events), so the Index archive is purely read + open, no settle verbs.
- No new data is required — every state is derived from existing fields (link status, Event end vs. now, trip lifecycle) plus the mode flag.

## Alternatives considered

- **Diverge Index content by mode** (Plan foregrounds building; Trip surfaces next/active). Rejected: no Tier-3 capability to gate, and it duplicates Home's "next code" surfacing; a stable reference reads better than a mode-dependent one.
- **One flat chronological list during the trip** (no past/upcoming split). Rejected: a long trip's used bookings crowd the upcoming ones, burying "what's next."
- **Drop past bookings from the Index once they're behind you.** Rejected: the Index is the durable record; a flown flight's code and a used hotel's receipt still matter.
- **No lifecycle differences at all.** Rejected: a finished trip would keep live "פעיל"/add affordances, contradicting the archive ADRs (0040/0044).
- **Treat "Plan during trip" as a distinct design.** Rejected: it is fully described by Plan chrome (§1) over the during content state (§2); no separate design exists.
