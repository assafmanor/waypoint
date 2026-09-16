# 2026-09-16 — A cancelled booking leaves the day and keeps its code

**Outcome:** [ADR-0228 §6](../decisions/0228-the-quick-actions-are-one-list-and-a-commitment-can-be-settled.md) (amended in place, **built**) · README row updated · no backlog line (shipped in the same change) · a handoff for the next session at the foot.

## What was asked

The owner, on the deployed build, day 16 at ⁦13:51⁩, the `⋯` sheet open on the ⁦15:00⁩ Jökulsárlón boat tour:

> Our boat tour got canceled, and the app doesn't have a way to say that, especially because it's a hard event.

The sheet in the screenshot: `עריכה` · `מחיקה`. Nothing else, because the two other verbs it can carry (`החלף`, `העבר למדף`) are soft-only by ADR-0011.

## What counting found

Not a missing feature — a decision that was written and never built, plus a leftover it uncovered.

1. **`skipped` already exists and already serves hard events.** ADR-0228 §2 let a passed booking be marked `דילגנו` from the strip; `applySetStatus` never read the kind; the backend column is one enum. ADR-0228 §5c then moved the early mark ("a human outranks the clock", ADR-0117 §2) into `⋯` on paper — and `EventCard`'s `menuActions` never got it. The i18n even calls `actions.skip` "the row-menu action".
2. **The parking lot refused a commitment.** `shelfGroups.skipped` filtered `kind === SOFT` (from ADR-0027, when only a soft event could be skipped). Both day screens drop skipped events from `dayEvents`, so a skipped booking had no surface left in either mode — restorable only from the Map's reference row. `place-usage.isParked` carried the same `=== SOFT`, with a test asserting it.

## What was built

- `EventCard`: `⋯` leads with `סיימנו` · `דילוג` on an `upcoming` row, both kinds, when both handlers are wired. Passed → strip, now → band, done → chip; one home per phase.
- `shelfGroups.skipped` and `place-usage.isParked` drop the kind test. The parked card's tap restores in place; Plan's drag-restore into a gap already runs through the hard gate (`applyGuardedUpdate`).
- Comments that said "skipped **soft** events" in `DayView`, `PlanDay`, `shelf.ts`, `place-usage.ts` amended in place.
- Tests: seven new cases on the sheet in `EventCard.test.tsx`; the two `=== SOFT` assertions flipped in `shelf.test.ts` and `place-usage.test.ts`.

**Verification:** frontend suite 311 files / 5659 tests green; `pnpm typecheck` green in all three packages (backend needed `prisma:generate` first in this sandbox — environment, not the change); frontend lint 0 errors (2 pre-existing warnings, untouched files).

## What was left, on purpose

- **A `canceled` status.** Considered and not taken (ADR-0228 §6b): a Prisma enum migration plus ~40 frontend consumers for a distinction the day does nothing with. Open to the device pass whether `דילגתם` on a parked booking reads wrong enough to earn a kind-aware label.
- **Skipping does not pass the hard gate**, deliberately — a record, not an edit of the booking.

## Handoff — next session: last-minute schedule changes

The owner asked for the next session to be a **product → design → build** pass on last-minute changes on the ground: _"how we make this as easy as possible for users… what's inconvenient and is holding people back, what's taking too many steps… adding things, canceling, moving things around should be seamless."_ This report is the seed: a cancellation needed a trip through `⋯` to a verb that did not exist. Start from `docs/planning/2026-09-16-handoff-last-minute-changes.md`.
