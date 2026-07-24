# Session 95 — Shorten place names; destination-primary fallback; the rail is deleted

**Date:** 2026-07-24
**Kind:** Design correction of session 94, from user feedback on the shipped rail.
**ADRs:** [0059](../decisions/0059-booking-presentation-on-home-and-index.md) §3 — the **session-95 amendment supersedes session 94's**.

## Why session 94 was wrong

The stacked rail treated a too-long route as a _layout_ problem. It shipped and still failed:

- the destination was **still truncated** (`נמל התעופה הבינלאומי…`) — at ~150px of value column, even two lines aren't enough for a 28-character name, so the rail failed at its one job;
- the dot / connector / arrowhead markers read as debris, not design;
- and the meta line was **repeating the origin** (it resolves through `bookingPlaceId` → `fromPlaceId`), spending the row's scarcest resource on duplicate information.

Session 94's _diagnosis_ was right and still holds — both day surfaces rendered the stored title string rather than the route. The layout answer was wrong: two full official names cannot fit that column in any arrangement. So: **show shorter names**, and the inline route grammar survives.

## What shipped

**1. `lib/place-label.ts` — `shortPlaceLabel(name)`.** Strips _generic category phrasing_, never place names:
`נמל התעופה בן גוריון` → **בן גוריון**, `Keflavík International Airport` → **Keflavík**, `תחנת הרכבת המרכזית חיפה` → **חיפה**.

The key property: the pattern list grows with how many **kinds** of place exist, not how many places. Nine patterns handle Keflavík, Narita, Haneda, Charles de Gaulle, Amsterdam Central and Savidor without knowing anything about them — so there is no per-place dictionary anywhere.

- **Google has no short name for a POI.** `shortFormattedAddress` is an address; `addressComponents[].shortText` abbreviates address parts only; there's no IATA field. The airport's `locality` is a trap — Ben Gurion's is **לוד**. Hence: ours.
- **Cannot corrupt a name.** Display-only (`Place.name` untouched → the detail view and tooltips keep the full name, and there's no migration to undo). The strip boundary requires whitespace, so a name that _is_ the category phrase (`Airport`, `נמל התעופה`) is kept whole; a remainder under 2 chars, or one that's only a modifier (`המרכזית`, `International`), is rejected. Failure mode is **"no change"** — an unlisted phrase or an unknown script (`東京駅`) displays in full, exactly as today.
- It deliberately does **not** produce `נתב״ג` — that needs the abbreviation dictionary, which is what the (still-backlogged) user-set place nickname is for.

**2. Destination-primary fallback.** When even the shortened route overflows, the row's title becomes the destination alone and the meta becomes `מ־<origin>`. The destination keeps the title line because it's where you're going. **Nothing is clamped or truncated** anywhere in this path — an unshortenable name simply wraps.

**3. `ui/useRouteDisplay.tsx` — one decision, both slots.** It returns the title node _and_ the meta line, so they can never disagree, and both day surfaces call it. Measurement is `lib/useOverflows.ts` (session 94's hook, renamed for its new job): compare the inline row's natural nowrap width against the space it has, latch the width it wanted, then compare that against the container on later resizes — bidirectional, no hidden text ruler.

**4. The meta stops repeating the origin.** Inline it carries the destination's **full** name (so shortening loses nothing); in the fallback it carries `מ־<origin>`.

**5. Consistency by component, not by screen.** Shortening lives in the two shared title components — `EventTitle` (events: Trip day row, Plan builder row, board hero) and `BookingTitle` (bookings: Index row, Index "next" preview) — so a flight reads the same on every glanceable surface in both modes. The **booking detail** (the record) and the **booking form** (the editor) keep full names by design.

**6. Arrows.** The visible route arrow is already `NavArrow` (SVG) on every surface; `t.arrows.route`'s text `←` survives only in the stored title string and screen-reader labels, which must be text — its i18n comment already says so.

**7. Deleted.** The stacked rail, its three `Icon` members (`route-origin`/`route-line`/`route-dest`), its CSS, and the session-93 whole-title clamp (routes are handled structurally now; nothing else needed clamping).

## Verification

- `lib/place-label.test.ts` (7 cases): Hebrew + English category stripping across places the rules never "saw"; the more specific phrase wins; names with no category phrasing pass through byte-identical (incl. `東京駅`); never strips to nothing; the leftover-modifier guard; whitespace.
- `ui/useRouteDisplay.test.tsx` (6 cases, widths stubbed since jsdom reports 0): no slots for a non-transport event; inline with **shortened** names + the destination's full name as meta; the destination-primary fallback with `מ־origin`; no ellipsis in either slot in the fallback; a one-ended route.
- `ui/RouteLabel.test.tsx`: origin/destination as bidi-isolated values with the SVG arrow and no arrow glyph in the text.
- `typecheck` + `lint` (0 errors) + `build` green; full frontend suite **764** passes; `pnpm format` clean.
