# Session 126 — the Map's maybes chip was lying three different ways

**Date:** 2026-07-26
**Branch:** `claude/maps-maybes-display-bugs-pbmgse`
**ADR:** [0119](../decisions/0119-map-maybes-facet-is-the-shelf.md)

Owner report, three bullets on one chip:

- in maps "maybe today" does not appear on the list of maybes;
- there are ideas that don't appear as maybes at all but do appear in their
  categories (perhaps they were events once?);
- the number of maybes doesn't change after filtering to a specific category
  (i.e. a maybe restaurant).

Three separate causes, which is why they read as one flaky chip.

## What was actually happening

**1. An idea had no day, ever.** `buildPlaceUsageIndex` passed `days: []` for every
`MaybeItem`, including one with a `targetDate`. Trip mode's Map is day-scoped, and
the scope filter keeps only usages anchored to `activeDate` — so an idea pencilled in
for today was gone before the `אולי` toggle was consulted. ADR-0116's consequences
already claimed the opposite ("the Map's day filter gains ideas… a place referenced by
an idea with a `targetDate` now has a day facet"): the field shipped in session 112,
the facet didn't. Worth naming as a class — a consequence bullet is not a built thing,
and this is the second time a §-level promise in that ADR turned out to be aspirational
(§3's Plan-mode union was the first).

**2. The facet was narrower than the shelf.** `isMaybe` is only set by an
**unconsumed** `MaybeItem`. The shelf renders two things (ADR-0027 §2): unplaced ideas
**and** the day's skipped soft events. So the most common "was an event once" path —
schedule an idea (it becomes `consumed`, an event appears), then skip it — produced a
place that shows under its type chip (the event still has a category) and is absent
from `אולי`. The report's own parenthetical named the mechanism.

**3. Neither count knew about the other facet.** `maybesInScope` filtered `dayScoped`
by `isMaybe` and stopped; `categoryCounts` counted `dayScoped` and ignored
`maybesOnly`. So the chip counts were answering a question nobody asked, and the
"empty chip → fall back to `הכל`" guard was reading them.

## What shipped

`lib/place-usage.ts`:

- an idea with a `targetDate` contributes one **clock-free** `DayUsage` (no `at`,
  `until`, `sortOrder` or `eventId`) — it ranks as untimed, exactly where the day view
  puts an untimed row, and never reaches the timeline;
- the same-date merge got its tiebreak stated once (`primaryRef`): the earliest
  reference that _has_ a clock owns the day's moment and pointer, and between two
  clockless ones a real event beats a pencil mark. Without it, an idea aimed at the
  same day as an **untimed** event took over the row's "what happens here" wording;
- `isParked` (a skipped **soft** event, the same rule `lib/shelf.ts` groups by) plus
  `isOnShelf = isMaybe || isParked`, which is what the facet reads now. `isMaybe` keeps
  its narrow meaning — research's `על המדף` badge is asking whether `＋ אולי` would
  duplicate an idea, not whether the place is shelved.

`screens/Map.tsx`:

- each facet counts what the other leaves visible (the `אולי` count follows the picked
  type; the type chips + `הכל` count only shelf places while the toggle is on), so the
  chip row narrows to the types that actually have shelf places and the "picked a type,
  got nothing" dead end is unreachable by tapping;
- a day that comes only from an idea renders in a **neutral** tag, not the amber time
  tag — amber is time & commitment (ADR-0028) and a pencil mark is neither.

## Tests

`place-usage.test.ts`: the pencilled day (present, clock-free) and the dateless idea
(still dayless); the merge keeping an event's pointer against a pencil mark, timed and
untimed; `isParked` for a skipped soft event and **not** for a skipped hard one; the
`אולי` filter finding a skipped soft event.

`Map.test.tsx`: a new `ADR-0119` block — "maybe today" visible and counted in the day
scope, the neutral day tag, the skipped soft event reachable from `אולי` **in both day
scopes**, and the two count directions. Clock pinned throughout (frontend `CLAUDE.md`),
since every fixture carries a fixed date.

## Not done, deliberately

- **The outcome filter facet** ("what's left to do" / "where we've been") stays
  deferred where ADR-0117 left it. Folding skipped events into `אולי` is about
  shelf membership, not about ranking outcomes, and it is what the reported bug asked
  for.
- **Sorting the shelf-only list** (a pencilled idea for today vs. a skipped stop) —
  the untimed ordering the comparator already gives is coherent; a dedicated order for
  the filtered view is a design question nobody has asked yet.
