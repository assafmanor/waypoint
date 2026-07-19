# 0081 — A quiet group change-feed (visible collaboration)

**Status:** Accepted (2026-07-19)
**Date:** 2026-07-19
**Relates:** [0019](0019-sync-protocol.md) (the WS `change` stream this reads), [0004](0004-integrations-are-pipes.md) (a feed is a pipe into Home, not its own tab), [0028](0028-plan-violet-color-budget-dark-ready.md) ("one loud element": the board is the only loud surface, the feed is quiet chrome), **F-05** (the frontend-review fix that threaded the real author into writes — the attribution this depends on). Implements finding **U-09** of the UI/UX review (`../reviews/ui-ux-review.md`). See also [collaboration-model.md](../architecture/collaboration-model.md) ("The change-feed") and PRD §4.2 ("Noam moved ramen to 20:00").

## Context

Peer edits reach a member's screen through the WS `change` stream and mutate the reactive lists / event reducer in `state/trip-state.tsx` **silently** (`applyRemoteChange`). A member who returns after a co-traveller moved a plan sees a changed state with no _what changed_ and no _by whom_ — the review's most visible collaboration gap (U-09, J14). The product explicitly promises _visible_ collaboration: PRD §4.2 and the vision both name "Noam moved ramen to 20:00", and `collaboration-model.md` calls the change-feed the group's safety net ("awareness, not a turf war"). The `Change` record already carries the real actor (`actorUserId`, correct since F-05), a `before`/`after` pair, an `action`, and `createdAt` — everything a narration needs. It was simply never surfaced.

## Decision

A bounded, WS-fed recent-changes **buffer** plus a quiet, dismissable **`ChangeFeed`** on the Trip-mode Home, below the board.

- **Buffer (`state/change-feed.tsx`).** A pure `describeChange(change, users, meId, tz)` turns one `Change` into an attributed `ChangeEntry` (actor resolved off the roster; subject = the entity's title/name or a generic noun; a moved-to clock time for a move/update carrying `startsAt`), and ring-buffer helpers keep the last **20**, newest-first, de-duped by id. The buffer is held as local state in `TripReady` and fed from the **same** `applyRemoteChange` choke point — it **narrates, it never re-applies** (the reducer / reactive lists already own the mutation). It covers both the live WS path and the reconnect catch-up (both funnel through `applyRemoteChange`); a full `RESYNC` replaces state wholesale and is deliberately not narrated (we have the new snapshot, not the deltas). It is in-memory, resets on trip switch (the component remounts), and stays empty offline (no changes arrive).
- **Own changes are filtered out.** `describeChange` returns `null` when the actor is `me` — your own edits are already optimistic on your screen, so echoing them back is noise. (The alternative, de-emphasis, was rejected as still-visible clutter for zero added awareness.)
- **`ChangeFeed` (`ui/domain/ChangeFeed.tsx`).** Presentational (all data via props): a calm strip of attributed lines with relative time, a per-item dismiss and a clear-all, that **auto-collapses to nothing when empty**. Neutral chrome only — no amber/teal/plan (those stay reserved for time/location/plan); spacing/type/radius from tokens (ADR-0077). It is **not a second board** (ADR-0028 "one loud element").
- **Wiring.** One unobtrusive surface: a strip on the Trip-mode Home, below the board and above quick-access (`screens/Home.tsx`), per the review's "a Home strip … quiet, not a second board".

**a11y.** The list is a polite live region (`role="log"`, `aria-live="polite"`, `aria-relevant="additions"`) so a peer change is announced calmly once and per-tick relative-time updates to existing lines are not re-read; it never steals focus (nothing is auto-focused). Dismiss and clear-all carry `aria-label`s.

**RTL.** Logical properties throughout; the clock time (`HH:MM`) and the relative-time numeral render in `dir="ltr"` islands (isolated) inside the RTL line, so numbers stay LTR. Copy lands in `i18n/he.ts` under a new `changeFeed` namespace; no em dashes (subject inlined in the lead, the time appended separately).

## Consequences

- Collaboration is **visible**: a returning member sees "נועם הזיז את ראמן ל-20:00", attributed and time-stamped, closing U-09 / J14.
- **Narrate-not-reapply** keeps the feed a pure read of the existing stream — no double-application risk, no second socket, no new backend/shared surface (attribution rides F-05's existing `actorUserId`).
- **Own-change filtering** means the feed only ever narrates _other people_; a solo editor sees an empty (collapsed) strip.
- **Bounded memory**: the ring caps at 20 entries and resets per trip, so a long session can't grow it without limit.
- A full `RESYNC` (gap / hard refresh) is not narrated — acceptable, since it isn't an incremental peer edit; the new state simply appears.

## Alternatives considered

- **A full activity log / its own tab** — rejected: ADR-0004 ("integrations are pipes, not screens") and the product's no-extra-surface posture; awareness belongs inline on Home, not behind a tab.
- **A toast per peer change** — rejected: too noisy and transient; a returning member would have missed them, and a burst of catch-up changes would flood. A calm, persistent, dismissable strip fits "awareness, not a turf war".
- **De-emphasizing (not filtering) own changes** — rejected: still visible clutter for no added awareness; filtering is cleaner and lighter.
