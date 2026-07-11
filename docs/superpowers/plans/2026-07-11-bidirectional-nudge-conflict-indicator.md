# Bidirectional Nudge + Standing Conflict Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a soft event be nudged earlier as well as later (mirroring the existing fixed-step "delay"), and make any resulting soft-vs-hard overlap permanently visible wherever the event renders, instead of silently vanishing into the data.

**Architecture:** Two independent, additive, non-blocking pieces. (1) Generalize the backend's forward-only ripple walk (`EventsService.computeRippleSuggestion`) into a direction-agnostic walk so a negative shift pulls preceding contiguous soft events earlier, mirroring how a positive shift pushes following ones later. (2) A new pure frontend helper (`hardConflicts`) flags any soft event whose current span overlaps a hard event's span, consumed by both `DayView` and `Home` on every render — independent of the ripple mechanism and of how the overlap arose.

**Tech Stack:** NestJS + Prisma (backend, Vitest integration tests against seeded dev Postgres), React + Vite (frontend, Vitest unit tests, no component-render harness — this codebase deliberately keeps UI logic testable via plain functions instead of installing `@testing-library/react`; see `frontend/src/state/verbs.ts`'s header comment).

## Global Constraints

- English-only code/identifiers; UI copy lives in `frontend/src/i18n/he.ts`, never inline.
- No magic numbers/strings — reuse `DELAY_STEP_MINUTES` (`frontend/src/constants.ts`), existing `ICONS`, existing enums from `@waypoint/shared`.
- Every non-trivial function gets a test.
- Hard events are guarded (ADR-0011): this change adds **no** confirmation gate and **no** rejection — both pieces are purely additive/informational. Do not touch `assertHardConfirmed` or the hard-event edit path.
- Conventional Commits; branch `t-014-wire-verbs-to-api` (already checked out — this work lands on it, not a new branch).
- `pnpm typecheck` and `pnpm build` must stay green.

---

## Task 1: Backend — bidirectional ripple walk

**Files:**

- Modify: `backend/src/events/events.service.ts:232-265` (the `computeRippleSuggestion` method)
- Test: `backend/src/events/events.service.spec.ts` (append after the existing `'ripples following soft events...'` test, ~line 208)

**Interfaces:**

- Consumes: nothing new — `RippleSuggestion` (defined at the top of `events.service.ts`), `toEventDto`, `shiftIso`/`ms` module-level helpers (unchanged).
- Produces: `computeRippleSuggestion(tripId, moved, minutes)` keeps its exact existing signature and return type (`Promise<RippleSuggestion | undefined>`); behavior for `minutes > 0` is byte-for-byte unchanged, `minutes < 0` is new.

- [ ] **Step 1: Write the failing test (backward ripple)**

Add to `backend/src/events/events.service.spec.ts`, right after the existing `'ripples following soft events on overlap, stopping at the first hard anchor'` test (after line 208):

```ts
it('ripples preceding soft events earlier on overlap, stopping at the first hard anchor', async () => {
  const tripId = await newTrip();
  const flight = await service.create(tripId, DEV_USER, {
    date: DAY,
    title: 'Flight',
    kind: EVENT_KIND.HARD,
    startsAt: at('08:00'),
    endsAt: at('10:00'),
    source: 'manual',
  });
  const coffee = await service.create(tripId, DEV_USER, {
    date: DAY,
    title: 'Coffee',
    kind: EVENT_KIND.SOFT,
    startsAt: at('10:00'),
    endsAt: at('11:00'),
    sortOrder: 1,
    source: 'manual',
  });
  const market = await service.create(tripId, DEV_USER, {
    date: DAY,
    title: 'Market',
    kind: EVENT_KIND.SOFT,
    startsAt: at('11:15'),
    endsAt: at('12:00'),
    sortOrder: 2,
    source: 'manual',
  });

  // Pull Market 30 minutes earlier so it now overlaps Coffee.
  const { rippleSuggestion } = await service.move(
    tripId,
    market.id,
    DEV_USER,
    { startsAt: at('10:45') },
    false,
  );

  expect(rippleSuggestion?.movedTitle).toBe('Market');
  expect(rippleSuggestion?.candidates).toEqual([
    {
      id: coffee.id,
      startsAt: new Date(at('09:30')).toISOString(),
      endsAt: new Date(at('10:30')).toISOString(),
    },
  ]);
  expect(rippleSuggestion?.candidates.some((c) => c.id === flight.id)).toBe(false);

  // Suggestion only — never auto-applied.
  const untouchedCoffee = await prisma.event.findUniqueOrThrow({ where: { id: coffee.id } });
  expect(untouchedCoffee.startsAt?.toISOString()).toBe(new Date(at('10:00')).toISOString());
});

it('returns no backward ripple when the preceding soft event has a real gap', async () => {
  const tripId = await newTrip();
  await service.create(tripId, DEV_USER, {
    date: DAY,
    title: 'Coffee',
    kind: EVENT_KIND.SOFT,
    startsAt: at('09:00'),
    endsAt: at('09:30'),
    source: 'manual',
  });
  const market = await service.create(tripId, DEV_USER, {
    date: DAY,
    title: 'Market',
    kind: EVENT_KIND.SOFT,
    startsAt: at('11:00'),
    endsAt: at('12:00'),
    sortOrder: 1,
    source: 'manual',
  });

  // Pulling Market 30 min earlier (to 10:30) still leaves a gap after Coffee (ends 09:30) — nothing to resolve.
  const { rippleSuggestion } = await service.move(
    tripId,
    market.id,
    DEV_USER,
    { startsAt: at('10:30') },
    false,
  );
  expect(rippleSuggestion).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @waypoint/backend test -- events.service`
Expected: the two new tests FAIL — today's `computeRippleSuggestion` only ever looks at `following` events (`ms(e.startsAt) > ms(moved.startsAt)`), so a `startsAt: at('10:45')` move that's earlier than the original produces `minutesShift = -30`, and the existing forward-only loop finds no candidates before Coffee's position at all (Coffee is _preceding_, never entered into `following`). Expect the assertion on `rippleSuggestion?.movedTitle` (or `.candidates`) to fail because `rippleSuggestion` is `undefined`.

(Requires the dev Postgres from `docker compose up -d` to be running, per this test file's "Integration test against the seeded dev Postgres" — same requirement as every other test in this file.)

- [ ] **Step 3: Implement the direction-agnostic walk**

Replace the existing `computeRippleSuggestion` method (`backend/src/events/events.service.ts:232-265`) with:

```ts
  /** Ports computeRipple() 1:1 from frontend/src/state/trip-state.tsx (T-010 notes),
   *  generalized to walk either direction (T-014 follow-on): a positive shift pushes
   *  contiguous/overlapping following soft events later; a negative shift pulls
   *  contiguous/overlapping preceding soft events earlier. Stops at the first hard
   *  anchor or the first event that isn't actually overlapping (nothing to resolve).
   *  Suggestion only — never applied here. */
  private async computeRippleSuggestion(
    tripId: string,
    moved: TripEvent,
    minutes: number,
  ): Promise<RippleSuggestion | undefined> {
    if (moved.kind !== EVENT_KIND.SOFT || !moved.startsAt || !moved.endsAt) {
      return undefined;
    }

    const dayEvents = await this.prisma.event.findMany({
      where: { tripId, date: new Date(moved.date) },
    });
    const events = dayEvents
      .map(toEventDto)
      .filter((e) => e.status === EVENT_STATUS.PLANNED && e.startsAt && e.id !== moved.id);

    const candidates =
      minutes > 0
        ? this.rippleForward(events, moved, minutes)
        : this.rippleBackward(events, moved, minutes);

    return candidates.length ? { movedTitle: moved.title, candidates } : undefined;
  }

  private rippleForward(
    events: TripEvent[],
    moved: TripEvent,
    minutes: number,
  ): RippleSuggestion['candidates'] {
    const following = events
      .filter((e) => ms(e.startsAt) > ms(moved.startsAt))
      .sort((a, b) => ms(a.startsAt) - ms(b.startsAt) || a.sortOrder - b.sortOrder);

    const candidates: RippleSuggestion['candidates'] = [];
    let prevEnd = ms(moved.endsAt);
    for (const e of following) {
      if (e.kind === EVENT_KIND.HARD) break;
      if (ms(e.startsAt) >= prevEnd) break;
      const startsAt = shiftIso(e.startsAt!, minutes);
      const endsAt = e.endsAt ? shiftIso(e.endsAt, minutes) : undefined;
      candidates.push({ id: e.id, startsAt, endsAt });
      prevEnd = ms(endsAt ?? startsAt);
    }
    return candidates;
  }

  /** Mirror of rippleForward: walks preceding events in reverse, pulling each one
   *  earlier while it overlaps the shifted-back start of its successor. */
  private rippleBackward(
    events: TripEvent[],
    moved: TripEvent,
    minutes: number,
  ): RippleSuggestion['candidates'] {
    const preceding = events
      .filter((e) => ms(e.startsAt) < ms(moved.startsAt))
      .sort((a, b) => ms(b.startsAt) - ms(a.startsAt) || b.sortOrder - a.sortOrder);

    const candidates: RippleSuggestion['candidates'] = [];
    let prevStart = ms(moved.startsAt);
    for (const e of preceding) {
      if (e.kind === EVENT_KIND.HARD) break;
      if (ms(e.endsAt ?? e.startsAt) <= prevStart) break;
      const startsAt = shiftIso(e.startsAt!, minutes);
      const endsAt = e.endsAt ? shiftIso(e.endsAt, minutes) : undefined;
      candidates.push({ id: e.id, startsAt, endsAt });
      prevStart = ms(startsAt);
    }
    return candidates;
  }
```

This preserves `rippleForward`'s logic exactly as it was inline before (verified against the existing `'ripples following soft events...'` test, which must still pass unchanged).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @waypoint/backend test -- events.service`
Expected: PASS — all existing tests in the file plus the two new ones (9 total `it` blocks after this addition).

- [ ] **Step 5: Commit**

```bash
git add backend/src/events/events.service.ts backend/src/events/events.service.spec.ts
git commit -m "feat(backend): bidirectional ripple walk for earlier/later nudges"
```

---

## Task 2: Frontend — `hardConflicts` pure helper

**Files:**

- Modify: `frontend/src/lib/time.ts` (add the new export; extend the `@waypoint/shared` import)
- Test: `frontend/src/lib/time.test.ts` (new `describe('hardConflicts', ...)` block)

**Interfaces:**

- Consumes: `TripEvent`, `EVENT_KIND` from `@waypoint/shared` (already used elsewhere in this file/package).
- Produces: `export function hardConflicts(event: TripEvent, dayEvents: TripEvent[]): TripEvent[]` — used by Task 4 (`DayView.tsx`) and Task 5 (`Home.tsx`).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/time.test.ts`, after the existing `import` line (line 1-4), extend the import and add a new `describe` block at the end of the file:

```ts
import { describe, expect, it } from 'vitest';
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
import { dayProgress, deriveNow, formatTime, hardConflicts, minutesUntil, shiftIso } from './time';
import { DEMO_NOW, EVENTS, TRIP } from '../fixtures';
```

(This replaces the file's current first four lines — adds `EVENT_KIND`, `TripEvent`, and `hardConflicts` to the existing imports.)

Append at the end of the file:

```ts
describe('hardConflicts', () => {
  const shinjuku = EVENTS.find((e) => e.id === 'ev-shinjuku')!;
  const ichiran = EVENTS.find((e) => e.id === 'ev-ichiran')!;

  it('is empty when a soft event only touches the following hard event (no overlap)', () => {
    expect(hardConflicts(shinjuku, EVENTS)).toEqual([]);
  });

  it("flags the hard event once the soft event's end runs past its start", () => {
    const delayed = { ...shinjuku, endsAt: shiftIso(shinjuku.endsAt!, 30) };
    expect(hardConflicts(delayed, EVENTS).map((e) => e.id)).toEqual(['ev-ichiran']);
  });

  it('ignores overlap between two soft events', () => {
    const a: TripEvent = {
      ...shinjuku,
      id: 'x-a',
      startsAt: '2026-07-07T10:00:00+09:00',
      endsAt: '2026-07-07T11:00:00+09:00',
    };
    const b: TripEvent = {
      ...shinjuku,
      id: 'x-b',
      startsAt: '2026-07-07T10:30:00+09:00',
      endsAt: '2026-07-07T11:30:00+09:00',
    };
    expect(hardConflicts(a, [a, b])).toEqual([]);
  });

  it('returns nothing for a hard event itself', () => {
    expect(hardConflicts(ichiran, EVENTS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @waypoint/frontend test -- time.test`
Expected: FAIL with `hardConflicts is not a function` / import error (not yet exported from `./time`).

- [ ] **Step 3: Implement `hardConflicts`**

In `frontend/src/lib/time.ts`, change the import on line 3 from:

```ts
import { EVENT_STATUS, type TripEvent } from '@waypoint/shared';
```

to:

```ts
import { EVENT_KIND, EVENT_STATUS, type TripEvent } from '@waypoint/shared';
```

Then append this function to the end of the file (after `shiftIso`):

```ts
/** Same-day hard event(s) whose span overlaps this soft event's current span.
 *  Two soft events overlapping is expected/unguarded (ADR-0011) — only hard-vs-soft
 *  matters, since a hard event can never move to resolve it. */
export function hardConflicts(event: TripEvent, dayEvents: TripEvent[]): TripEvent[] {
  if (event.kind !== EVENT_KIND.SOFT || !event.startsAt || !event.endsAt) return [];
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  return dayEvents.filter((e) => {
    if (e.id === event.id || e.kind !== EVENT_KIND.HARD || !e.startsAt) return false;
    const eStart = Date.parse(e.startsAt);
    const eEnd = e.endsAt ? Date.parse(e.endsAt) : eStart;
    return eStart < end && eEnd > start;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @waypoint/frontend test -- time.test`
Expected: PASS — all existing `time.test.ts` tests plus the new `hardConflicts` block.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/time.ts frontend/src/lib/time.test.ts
git commit -m "feat(frontend): add hardConflicts helper for standing overlap detection"
```

---

## Task 3: Frontend — `earlier` verb + i18n copy

**Files:**

- Modify: `frontend/src/i18n/he.ts` (add `actions.earlierBy`, `toast.softEarlier`, `event.conflictWarn`)
- Modify: `frontend/src/state/verbs.ts` (add `earlier` to the object returned by `useVerbs()`)

**Interfaces:**

- Consumes: `applyDelay` (existing, unchanged signature: `(deps, event, minutes) => Promise<void>`), `DELAY_STEP_MINUTES` (existing constant).
- Produces: `useVerbs().earlier: (e: TripEvent) => void` — consumed by Task 4 (`DayView.tsx`'s new button). `t.actions.earlierBy`, `t.event.conflictWarn` — consumed by Tasks 4 and 5.

No test for this task alone: `applyDelay` (the function `earlier` delegates to) is already covered by existing tests exercising signed-minutes moves; `earlier` itself is a one-line dispatch inside a hook not covered by component-render tests in this codebase (consistent with `delay`/`skip`/`done` etc., none of which are unit-tested at the `useVerbs()` level today — only the underlying `apply*` functions are, per `verbs.test.ts`). Verified instead by Task 4's manual/dev-server check.

- [ ] **Step 1: Add the i18n copy**

In `frontend/src/i18n/he.ts`, in the `actions` block (lines 75-85), add a line after `delayBy`:

```ts
  actions: {
    restore: 'שחזר',
    navigate: 'ניווט',
    delayBy: (minutes: number) => `דחה ${minutes} דק׳`,
    earlierBy: (minutes: number) => `הקדם ${minutes} דק׳`,
    onWay: 'בדרך',
    done: 'סיימנו',
    skip: 'דלג',
    swap: 'החלף',
    scheduleToDay: 'שבץ ליום',
    scheduled: 'שובץ',
  },
```

In the `toast` block (lines 86-99), add a line after `softDelayed`:

```ts
    softDelayed: (minutes: number) => `נדחה ב-${minutes} דקות`,
    softEarlier: (minutes: number) => `הוקדם ב-${minutes} דקות`,
```

In the `event` block (lines 68-74), add a line after `hardWarn`:

```ts
  event: {
    hard: 'קשיח',
    soft: 'גמיש',
    softNow: 'גמיש · עכשיו',
    bookingLabel: 'הזמנה',
    hardWarn: 'אירוע קשיח · שינוי דורש עדכון ההזמנה',
    conflictWarn: (title: string, time: string) => `חופף ל-${title} (קשיח) · ${time}`,
  },
```

- [ ] **Step 2: Add the `earlier` verb**

In `frontend/src/state/verbs.ts`, in the object returned by `useVerbs()` (the `return { ... }` block, currently starting around line 200), add `earlier` right after the existing `delay` entry:

```ts
    delay: (e: TripEvent) => {
      void applyDelay(deps, e, DELAY_STEP_MINUTES);
      if (e.kind === EVENT_KIND.HARD) toast(ICONS.warn, t.toast.hardDelayed, undo);
      else toast(ICONS.delay, t.toast.softDelayed(DELAY_STEP_MINUTES), undo);
    },
    earlier: (e: TripEvent) => {
      void applyDelay(deps, e, -DELAY_STEP_MINUTES);
      toast(ICONS.delay, t.toast.softEarlier(DELAY_STEP_MINUTES), undo);
    },
```

(`earlier` has no hard-event branch — per the spec, no "earlier" affordance is offered for hard events in this change, so this verb is only ever invoked from a soft event's action row.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @waypoint/frontend typecheck`
Expected: PASS (no new type errors — `earlier` matches the shape of every other verb in the returned object).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/he.ts frontend/src/state/verbs.ts
git commit -m "feat(frontend): add earlier verb mirroring delay"
```

---

## Task 4: Frontend — DayView: earlier button + standing conflict flag

**Files:**

- Modify: `frontend/src/screens/DayView.tsx`
- Modify: `frontend/src/screens.css` (one new rule)

**Interfaces:**

- Consumes: `hardConflicts` (Task 2), `verbs.earlier` (Task 3), `t.actions.earlierBy`, `t.event.conflictWarn` (Task 3).
- Produces: nothing new consumed by later tasks — this is a leaf UI task.

- [ ] **Step 1: Pass conflicts into `EventItem` and render the earlier button**

In `frontend/src/screens/DayView.tsx`, update the import line (line 15) from:

```ts
import { deriveNow, formatTime } from '../lib/time';
```

to:

```ts
import { deriveNow, formatTime, hardConflicts } from '../lib/time';
```

In the `DayView` component, update the `dayEvents.map` block (lines 60-71) to pass `conflicts`:

```tsx
<div>
  {dayEvents.map((e) => (
    <EventItem
      key={e.id}
      event={e}
      tz={trip.timezone}
      isNow={e.id === nowId}
      isOpen={openId === e.id}
      onToggle={() => setOpenId((id) => (id === e.id ? null : e.id))}
      booking={e.bookingId ? bookings.find((b) => b.id === e.bookingId) : undefined}
      conflicts={hardConflicts(e, dayEvents)}
      verbs={verbs}
    />
  ))}
</div>
```

Update `EventItem`'s props type and destructuring (lines 97-113):

```tsx
function EventItem({
  event,
  tz,
  isNow,
  isOpen,
  onToggle,
  booking,
  conflicts,
  verbs,
}: {
  event: TripEvent;
  tz: string;
  isNow: boolean;
  isOpen: boolean;
  onToggle: () => void;
  booking?: Booking;
  conflicts: TripEvent[];
  verbs: ReturnType<typeof useVerbs>;
}) {
```

Add the standing conflict flag inside the `.main` span (lines 135-147), right after the existing `.m` meta span:

```tsx
<span className="main">
  <span className="t">
    {event.title}
    {isHard ? (
      <span className="tag-hard">
        {ICONS.lock} {t.event.hard}
      </span>
    ) : (
      <span className="tag-soft">{isNow ? t.event.softNow : t.event.soft}</span>
    )}
  </span>
  <span className="m">{meta}</span>
  {conflicts.length > 0 && (
    <span className="conflict-flag">
      {ICONS.warn}{' '}
      {t.event.conflictWarn(conflicts[0].title, formatTime(conflicts[0].startsAt!, tz))}
    </span>
  )}
</span>
```

Add the earlier button to the soft-event actions row (lines 178-196), right before the existing `delay` button:

```tsx
<>
  <button className="act" onClick={() => verbs.done(event)}>
    {t.actions.done}
  </button>
  <button className="act" onClick={() => verbs.skip(event)}>
    {t.actions.skip}
  </button>
  <button className="act" onClick={() => verbs.earlier(event)}>
    {t.actions.earlierBy(DELAY_STEP_MINUTES)}
  </button>
  <button className="act" onClick={() => verbs.delay(event)}>
    {t.actions.delayBy(DELAY_STEP_MINUTES)}
  </button>
  <button className="act" onClick={() => verbs.swap(event)}>
    {t.actions.swap}
  </button>
  <button className="act go" onClick={() => verbs.navigate(event)}>
    {t.actions.navigate}
  </button>
</>
```

- [ ] **Step 2: Add the CSS rule**

In `frontend/src/screens.css`, right after the `.hard-warn` rule (line 456-459), add:

```css
.conflict-flag {
  display: block;
  font-size: 11px;
  color: var(--amber-deep);
  margin-top: 2px;
}
```

- [ ] **Step 3: Typecheck and build**

Run: `pnpm --filter @waypoint/frontend typecheck && pnpm --filter @waypoint/frontend build`
Expected: PASS.

- [ ] **Step 4: Manual verification in the dev server**

Run: `pnpm dev` (or just the frontend workspace), open the Day view for the active date, expand "זמן חופשי · שינג׳וקו" (Shinjuku free time), tap "דחה 30 דק׳" (delay 30) — confirm:

- A "הקדם 30 דק׳" (earlier 30) button is present and, when tapped on a fresh reload, shifts the event 30 minutes earlier.
- After delaying Shinjuku by 30 min so it now overlaps Ichiran Ramen (hard), the conflict flag ("חופף ל-Ichiran Ramen (קשיח) · 19:30") appears under the event's meta line, visible even when the row is collapsed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/DayView.tsx frontend/src/screens.css
git commit -m "feat(frontend): earlier nudge button + standing conflict flag in Day view"
```

---

## Task 5: Frontend — Home: conflict warning on the now-card

**Files:**

- Modify: `frontend/src/screens/Home.tsx`
- Modify: `frontend/src/screens.css` (one new rule)

**Interfaces:**

- Consumes: `hardConflicts` (Task 2), `t.event.conflictWarn` (Task 3).
- Produces: nothing consumed by later tasks — leaf UI task.

- [ ] **Step 1: Compute and render the conflict warning**

In `frontend/src/screens/Home.tsx`, update the import (line 7) from:

```ts
import { deriveNow, dayProgress, formatTime, minutesUntil } from '../lib/time';
```

to:

```ts
import { deriveNow, dayProgress, formatTime, hardConflicts, minutesUntil } from '../lib/time';
```

Update the destructure on line 15 from:

```ts
const { trip, bookings, glance, notes, events } = useTrip();
```

to:

```ts
const { trip, bookings, glance, notes, events, activeDate } = useTrip();
```

After the `deriveNow` call (line 20), add:

```ts
const { now: nowEvent, next: nextEvent } = deriveNow(events, now);
const dayEvents = events.filter((e) => e.date === activeDate);
const conflicts = nowEvent ? hardConflicts(nowEvent, dayEvents) : [];
```

Render the warning right after the existing `now-meta` block (lines 65-69):

```tsx
{
  nowEvent.endsAt && (
    <div className="now-meta">
      {t.board.until} <span dir="ltr">{formatTime(nowEvent.endsAt, tz)}</span>
    </div>
  );
}
{
  conflicts.length > 0 && (
    <div className="now-conflict">
      {ICONS.warn}{' '}
      {t.event.conflictWarn(conflicts[0].title, formatTime(conflicts[0].startsAt!, tz))}
    </div>
  );
}
```

- [ ] **Step 2: Add the CSS rule**

In `frontend/src/screens.css`, right after the `.now-meta` rule (lines 73-76), add:

```css
.now-conflict {
  color: var(--amber-deep);
  font-size: 12px;
  margin-top: 4px;
}
```

- [ ] **Step 3: Typecheck and build**

Run: `pnpm --filter @waypoint/frontend typecheck && pnpm --filter @waypoint/frontend build`
Expected: PASS.

- [ ] **Step 4: Manual verification in the dev server**

With the clock sitting inside Shinjuku's (now-overlapping) window, confirm Home's now-card shows the conflict line under "עד 20:00" naming Ichiran Ramen and its 19:30 start — reproducing this session's original bug report, now visibly flagged instead of silent.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/Home.tsx frontend/src/screens.css
git commit -m "feat(frontend): surface standing hard-event conflicts on the Home now-card"
```

---

## Task 6: Docs — update the Ripple section

**Files:**

- Modify: `docs/architecture/sync-and-offline.md` (the "Ripple (suggestion only)" section)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update the Ripple section**

In `docs/architecture/sync-and-offline.md`, replace the "Ripple (suggestion only)" section (currently):

```markdown
## Ripple (suggestion only)

When a soft event moves, the server may return a `rippleSuggestion` describing subsequent **soft** events it _could_ push, with new times. The client shows the amber ripple bar; nothing moves until the user says yes. Ripple computation stops at the first hard anchor.
```

with:

```markdown
## Ripple (suggestion only)

When a soft event moves — earlier or later — the server may return a `rippleSuggestion` describing contiguous/overlapping **soft** events it _could_ shift the same way, with new times. The client shows the amber ripple bar; nothing moves until the user says yes. The walk stops at the first hard anchor in that direction, or at the first event that isn't actually overlapping (nothing to resolve).

Ripple is a suggestion mechanism for soft events, not a conflict-detection mechanism. Whether a nudge (rippled or not) leaves a soft event overlapping a hard anchor is tracked separately: any soft event whose current span overlaps a hard event's span is flagged wherever it renders (Day view row, Home's now-card), independent of the ripple bar and of how the overlap arose — this keeps the guard on hard events (ADR-0011) visible without ever blocking or requiring confirmation on the soft side.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/sync-and-offline.md
git commit -m "docs(sync-and-offline): document bidirectional ripple + conflict indicator"
```

---

## Final check

- [ ] Run the full suite: `pnpm typecheck && pnpm build && pnpm test` from the repo root.
- [ ] Confirm the branch is `t-014-wire-verbs-to-api` and all six commits from this plan are present (`git log --oneline -8`).
- [ ] Update `_internal/tasks/open/T-014-wire-verbs-to-api.md`'s Progress log with a dated entry describing this follow-on work, since it's landing on the same branch/PR (per `_internal/tasks/README.md`'s status protocol) — do not mark the task Done; it's still held for the user's go/no-go on pushing.
