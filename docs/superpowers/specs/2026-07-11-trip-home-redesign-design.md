# Trip home page: swipe actions, trimmed quick-access, quieter budget card

**Date:** 2026-07-11
**Status:** Approved for implementation

## Problem

The trip home page (`frontend/src/screens/Home.tsx`) has three confirmed pain points:

1. **No quick actions on the Next event.** The board card shows the single upcoming event (title, time, hard/soft badge, booking code, countdown) but it's purely informational — no way to act on it (mark done, skip, delay, etc.) without leaving the page for Day view.
2. **Quick-access grid is a junk drawer.** Of its four buttons (navigate-to-hotel, "the next ticket" `הכרטיס הבא`, nearby ATM, WiFi code), only WiFi actually does something (clipboard copy); the rest are toast-stubs. "The next ticket" duplicates the booking code already shown in the board card above it and its label doesn't clearly convey what tapping it does. ATM doesn't belong on this page. WiFi is real but shouldn't carry the same visual weight as a "quick access" tile.
3. **Budget card competes with the board.** The full-width budget card's large value and thick progress bar rival the amber board card for visual weight, conflicting with design-language's one-loud-element rule (the board is meant to be the only expressive element on the page).

## Decision

Incremental patch — fix these three things, leave the page's overall three-section shape (board / quick-access / glance) alone. Explicitly not doing a bigger rebuild (see Out of scope).

### 1. Swipe actions on the Next row

Scope the gesture to the `next-row` element only (`Home.tsx:79-107`) — not the `now` section above it, not the whole board card.

Direction maps to existing `verbs.ts` actions, split by `event.kind` exactly like `DayView.tsx`'s tap-to-expand action rows already do:

| Kind | Swipe right | Swipe left |
| ---- | ----------- | ---------- |
| Soft | `done`      | `skip`     |
| Hard | `onWay`     | `delay`    |

- Drag reveals a colored icon/label behind the row as it moves; release past a threshold commits the action, release short of it snaps back with no effect.
- Commit reuses the existing verb functions unchanged (`applySetStatus`/`applyDelay` already carry optimistic dispatch + REST reconciliation + undo + toast) — the gesture layer only ever calls `verbs.done(e)` / `verbs.skip(e)` / `verbs.onWay(e)` / `verbs.delay(e)`, no new state or write path.
- Tap (no drag) on the row navigates to Day view — today the row has no tap handler at all, so this is new: it's how you reach the fuller action set (swap, restore, navigate) that Home intentionally doesn't expose.
- No new dependency. Implemented with plain `pointerdown`/`pointermove`/`pointerup` handlers computing horizontal delta against a threshold constant. No events beyond the single next row, so a gesture library is unwarranted.
- The swipe→verb decision is a pure function, e.g. `resolveSwipeAction(kind: EventKind, direction: 'left' | 'right'): SwipeVerb`, kept free of DOM/React so it can be unit tested directly (matches how `verbs.ts`/`trip-state.ts` are tested today — no `@testing-library/react` or jsdom is installed in this repo, and this change doesn't add one).

### 2. Quick-access grid trimmed to one real action

- Delete the ATM button (`Home.tsx:137-140`) and its dead code: `ICONS.atm`, `t.quick.atmToast`, `t.quick.nearbyAtm`.
- Delete the "next ticket" button (`Home.tsx:128-136`) and its dead code: `ICONS.ticket`, `t.quick.nextTicket`, `t.quick.nextTicketToast`, `t.quick.noTicket`.
- Keep navigate-to-hotel (`Home.tsx:124-127`) as the one prominent quick-access button. It remains a toast-stub (`t.quick.openingNav`) until real map integration lands — that's separate, later work, not part of this change.
- Demote WiFi: move it out of the `.qa` grid tile treatment into a small secondary text-chip rendered near the board card (still calls the existing `copyWifi` handler unchanged, just lighter visual weight — no icon-tile).
- Net effect: the `.quick` grid shrinks from 4 tiles to 1 (navigate-to-hotel); WiFi becomes a small chip elsewhere; the `sec-title` for "quick access" may end up describing a single button, which is fine — it's still a distinct, findable action.

### 3. Budget card: quieter, not moved

Stays exactly where it is (full-width `gcard wide` in the glance row) — no position change. Reduce its visual weight so the board card is the only loud element on the page:

- Smaller type size for the spent/total value (currently matches other `gcard .v` sizing at a scale meant to draw the eye).
- Thinner progress bar fill.
- Muted/neutral fill color instead of the current green — green currently reads as a second "status" color competing with amber (now) and teal (location), which design-language reserves exclusively.

## Out of scope (this change)

- **Real navigate-to-hotel / ATM-locator functionality** — both are currently toast-stubs; wiring either to a real map/places API is separate, later work.
- **Showing more than one upcoming event on Home** (a swipeable queue) — considered and rejected for this change; Home stays a single-event glance, the fuller list lives in Day view.
- **Restructuring quick-access into the board itself** (Approach 2 considered during design) — deferred; revisit once WiFi's placement and hotel-nav's real behavior are settled, since a single leftover button doesn't yet justify a bigger layout change.

## Testing

- Unit test `resolveSwipeAction` for all four (kind × direction) combinations.
- Unit test the threshold/commit logic (below-threshold release → no verb call; past-threshold release → correct verb called once) at the gesture-handler-function level, without mounting a component.
- No changes expected to existing `verbs.test.ts`, `trip-state.test.ts` — the swipe layer only calls existing verb functions, it doesn't change them.

## Docs impact

`docs/design/design-language.md` currently notes swipe was deferred from the mockup ("mockup uses tap-to-expand rather than swipe ... revisit real swipe gestures in the build with care") — update that note once this ships, describing the row-scoped swipe-right/left pattern actually used, so it's available as precedent if swipe is later considered for Day view's event list too.
