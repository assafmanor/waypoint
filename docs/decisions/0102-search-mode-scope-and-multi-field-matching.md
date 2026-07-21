# 0102 — Search mode always searches every category, matches by type vocabulary too, and back peels a category filter before leaving

**Status:** Accepted
**Date:** 2026-07-21
**Refines:** [0101](0101-index-search-mode-and-header-titles.md) (the full-screen `SearchOverlay`/`Modal variant="full"` this builds on, unchanged) — the ADR-0101 build carried the active category chip into search mode; this corrects that to always search everything.
**Touches:** [0090](0090-back-is-computed-from-nav-state.md) (no change — the new back-peel is local screen state, not a structural nav decision; see Alternatives), [0096](0096-per-domain-claude-md-guides.md) (the reuse-existing-infrastructure rule the shared term-matcher extraction follows)

## Context

Post-ADR-0101 feedback, once the full-screen search mode had shipped and merged:

1. **Search mode inherited whatever category chip was selected before opening it.** Selecting "טיסה" then tapping search left the search results filtered to flights only — surprising, since the whole point of opening search is usually to find something you can't currently see (which may be in a different category, or in the collapsed past section).
2. **Search only matched a booking's title or confirmation code.** Typing a category name ("מסעדות"/"מסעדה" for a restaurant, "טיסות"/"טיסה" for a flight) found nothing, even though that's a natural thing to search for. Explicitly flagged as a first step toward more searchable facets later (a linked place's name, "in the future").
3. **Refined further on the same category vocabulary**: a hotel booking should also be found by the actual lodging _kind_ someone booked — "מלון", "מוטל", "הוסטל", "דירה", "airbnb", "b&b" — not just the generic "לינה"/"לינות". Once that request was in for hotel, the same question applies to every other type: what do people actually type when searching for a flight, a restaurant, an activity?
4. **Back should un-filter before it leaves.** With a category chip selected on the main bookings screen, pressing back (tap, Escape, or a hardware/system back) closed the whole screen immediately — the same one-step behavior as with no filter active. The requested behavior: the first back should reset the filter to "all" and stay on the screen; only a clean, unfiltered state actually exits to the Index landing.

The user asked explicitly that all of this be "clean and reusable."

## Decision

**1. Search mode always searches every category, regardless of what was selected before opening it.** `IndexBookingsView`'s search-mode row computation (previously `visibleRows(searchRows, activeCategory, query)`) now passes `CATEGORY_ALL` unconditionally — search is a deliberate escape hatch from the current filter, not a continuation of it. The main screen's own category filtering (`upcomingVisible`/`pastVisible`) is untouched; only the search-mode list stopped taking the category into account.

**2. A new shared term-matching primitive, generalizing an existing near-duplicate rather than adding a third copy (ADR-0096).** `packages/shared/src/destinations.ts`'s `searchDestinations` and `packages/shared/src/icons.ts`'s `searchVibeIcons` each already had their own private "normalize text, then check if any of a list of candidate terms contains the query" helper — independently drifted (one stripped a trailing period, the other didn't). Rather than writing a _third_ version of the same shape for booking search, both were migrated onto one new shared pair in `packages/shared/src/search-terms.ts`:

- `normalizeSearchTerm(s)` — lowercase, strip quote-ish punctuation (straight/curly quotes, backtick, period, Hebrew geresh/gershayim), collapse whitespace.
- `matchesAnyTerm(query, terms)` — does `query` match any of `terms` (case/punctuation-insensitive substring)? Deliberately has no built-in empty-query special case (every string trivially contains the empty string, so a blank query matches whenever any term is present) — a caller wanting different blank-query behavior (`searchVibeIcons` wants none) checks that itself first, rather than this function guessing.

`destinations.ts`/`icons.ts` now both call the shared pair instead of their own copies; each gained a first unit test file/cases (neither had any before).

**3. `IndexBookingsView`'s `matchesQuery` (in `lib/index-bookings.ts`) now checks an array of searchable terms, not two fixed `||`-chained fields.** A new local `searchTerms(booking)` builds `[title, confirmationCode, singularTypeLabel, pluralTypeLabel, ...typeSynonyms]` and `matchesQuery` calls the shared `matchesAnyTerm` against it. This is the extensibility the "places in the future" hint asked for: a future searchable facet (a linked place's name) is one more array entry, not a new branch in `matchesQuery` itself.

Two new i18n lookups in `frontend/src/i18n/he.ts`, beside the existing `t.index.bookingType` (singular, displayed on chips/rows):

- `t.index.bookingTypePlural: Record<BookingType, string>` — "טיסות"/"מסעדות"/etc. `other` has no natural plural noun ("אחר" is an adjective, not a countable category name) and stays identical to the singular rather than the grammatically-correct-but-useless "אחרים".
- `t.index.bookingTypeSynonyms: Record<BookingType, readonly string[]>` — alternate/colloquial vocabulary beyond the singular/plural label. Populated per type with real alternate words people actually search by (hotel: מלון/מלונות/מוטל/מוטלים/הוסטל/הוסטלים/דירה/דירות/airbnb/b&b/bnb; flight: מטוס; restaurant: אוכל/ארוחה/קפה/בר; activity: טיול/אטרקציה/כרטיס); empty for `train`/`other`, which have no real alternate vocabulary beyond their singular/plural — not padded with weak synonyms nobody would actually type.

Kept in the frontend (not promoted to `packages/shared`) per that package's own CLAUDE.md: this is frontend-only Hebrew search vocabulary, and "frontend-only... vocabulary 'just in case it's needed later'" is explicitly not promoted to shared preemptively — only the generic matching _mechanism_ (`normalizeSearchTerm`/`matchesAnyTerm`) is cross-cutting enough to live there.

**4. A new local "back peels a modified condition before closing" primitive**, `frontend/src/lib/backPeel.ts`'s `peelBack(isModified, reset, close)`: runs `reset()` instead of `close()` while `isModified` is true. `IndexBookingsView` wires one `backOrResetCategory` handler — gated on the _derived_ `activeCategory` (not raw `category` state, so a chip that already silently fell back to "all" via ADR-0101's zero-count guard doesn't consume an extra back tap for a change the user can't see) — into **both** `useOverlay()` and `IndexBackRow`'s `onBack`, so a tap, Escape, and a hardware/system back all get the same peel, not just the visible arrow.

Plain function, not a hook: `useUnsavedGuard` (the closest existing precedent, also "intercept a close callback and decide locally") is a _stateful_ hook because it holds a confirm-dialog open across a render, an async multi-step interaction. This is synchronous — the decision and its effect (swap the filter back to "all") complete in the same tick — so a stateful hook would be overhead with no payoff. Kept in `lib/` (not `state/nav-state.tsx`): this is local screen state, not a structural nav decision, and `resolveBack`'s `BackAction` union has no (and needs no) new case for it.

## Consequences

- `matchesQuery`'s search-term array is the extension point for every future Index-search facet (a linked place's name is the next one flagged, not built here).
- `destinations.ts`/`icons.ts` lost their private normalize helpers in favor of the shared one — same behavior, now guaranteed not to drift a third time; both got their first unit test coverage as part of the migration.
- `peelBack` is reusable by any future screen with its own resettable view state sitting in front of "leave the screen" (a selection, a different filter) — not Index-specific, despite living beside `index-bookings.ts`'s other consumers today.
- No backend or schema change — presentation, local view state, and shared pure string-matching utilities only.
- `docs/backlog.md`: no change needed — the two follow-up lines from ADR-0101 (SearchOverlay beyond bookings; the general back-navigation report) are both still open and unaffected by this change.

## Alternatives considered

- **Add a `BackAction` kind to `resolveBack` for "peel local state."** Rejected: `resolveBack` (ADR-0090) is deliberately a pure function of _structural_ nav state (which overlay/tab/route) — it has no visibility into an arbitrary screen's own `category` state, and giving it one would mean threading screen-specific state into the shared nav layer for a need that's actually local. Wrapping the overlay's own close handler (already the established extension point — see `useUnsavedGuard`) keeps the concern where it belongs.
- **A stateful `useBackPeel` hook**, mirroring `useUnsavedGuard`'s shape for consistency. Rejected once traced: there's no async gap to hold state across — the reset and the decision both happen synchronously in the same call, so a hook would add render-cycle overhead and a component-only constraint for zero benefit over a plain function.
- **Leave `bookingTypeSynonyms` empty except for hotel** (the type explicitly flagged first). Rejected on the follow-up ask — once asked "what about the other types," padding only one type while leaving four others sparse would read as an arbitrary, half-finished feature rather than a considered one; populated each with real alternate vocabulary, left `train`/`other` empty on their own merits (no real alternate vocabulary exists), not because they were skipped.
