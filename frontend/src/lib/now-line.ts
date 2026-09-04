// **Where "now" lands in a day's list.**
//
// One derivation, two hosts: Trip mode's live marker (`DayView`, ADR-0043) and Plan mode's
// static now-reference (`PlanDay`), which differ only in which instant they are given. Both
// used to compute this inline, in two spellings — Trip read a cluster's `endMs`, Plan read the
// end of the cluster's last-ending member — and while those agree today, "where is now" is
// exactly the kind of fact that must not have two answers.
//
// **It now answers BOTH halves of the question** (ADR-0217 §1/§2), because a marker between
// rows cannot answer it at all:
//
//  - `index` — the row the marker sits above when nothing holds the moment. This is the
//    original answer and it is unchanged, which is what keeps the boundary cases (before the
//    day, after it, inside a hole `dayBlocks` draws no row for) on one rule.
//  - `inside` — the row the moment is INSIDE and how far through it we are, or `null`. This is
//    what the header of this file asked for on 2026-08-02: _"'now' is often genuinely INSIDE
//    something — a flight you are on, a dinner you are at, the layover between two legs — and
//    the honest marker would say so."_ The return type was an object with one field precisely
//    so this could arrive without touching a caller.
//
// **And a HOLE is two rows, not one** (the 2026-09-04 amendment): `nowInJoin` below answers which
// box of a hole holds the moment — the free time, or the journey out of it — because a fraction
// measured over the pair puts the arrow wherever those two happen to divide the pixels. It is
// derived here rather than in `nowLinePlacement` for the reason ADR-0217's build log §3 gives: a
// hole is not an entry, `dayBlocks` measures it between two of them.
//
// **The rule itself lives in `lib/now-inside.ts`**, unit-agnostic, because the shared reader
// (`lib/share-now-line.ts`) needs the same rule over a different unit — it compares
// pre-formatted `HH:MM` labels, since the public projection deliberately ships no instants
// (ADR-0213 §11), and its own comment asks to be unified "when `nowLinePlacement` grows its
// `inside` shape". What this file owns is the translation from `DayEntry` to that rule's spans.
import { groupEndEvent, groupMembers, type DayEntry } from './day-entries';
import { DAY_JOURNEY_ARM, holeDepartsMs, type DayJourney } from './day-joins';
import { nowInside, type NowInside, type NowSpan } from './now-inside';
import { EVENT_STATUS } from '@waypoint/shared';
import { MS_PER_SECOND } from '../constants';
import type { TimeGroup, TimeItem } from './time';

export interface NowLinePlacement {
  /** The entry the marker sits ABOVE. `entries.length` means after all of them —
   *  every row is behind us. */
  index: number;
  /** The row the moment is inside, and how far through it (`lib/now-inside.ts`), or `null`
   *  when no row holds it. A host reads `key` back against its own rows: for an event that is
   *  the event's `id`, which is what `GroupNode`/`ItemNode` and `BuilderNode` have in hand at
   *  every depth. */
  inside: NowInside | null;
}

/** When an entry is finished with: a group ends with its last-ending member, a
 *  transition point is an instant and ends at itself. */
function entryEndMs(entry: DayEntry): number {
  if (entry.kind !== 'event') return entry.atMs;
  const end = groupEndEvent(entry.group);
  return Date.parse(end.endsAt ?? end.startsAt!);
}

/**
 * **Every event in the day as a span, at every depth** — because the moment can be inside
 * more than one of them and only the innermost is the marker's (ADR-0041's forest).
 *
 * A settled row is flagged rather than dropped: `nowInside` needs to know it exists to fall
 * through to whatever contains it, and "excluded because we already answered for it" is that
 * function's own rule to apply rather than a filter this one performs.
 *
 * A transition point contributes nothing: it is an instant, and a zero-length span can never
 * hold a moment anyway (`NowSpan.end` is exclusive), so this is a statement rather than a
 * guard.
 */
function eventSpans(entries: readonly DayEntry[]): NowSpan[] {
  const spans: NowSpan[] = [];
  const pushItem = (item: TimeItem) => {
    const { event } = item;
    if (!event.startsAt) return;
    const start = Date.parse(event.startsAt);
    spans.push({
      key: event.id,
      start,
      end: event.endsAt ? Date.parse(event.endsAt) : start,
      settled: event.status !== EVENT_STATUS.PLANNED,
    });
    item.children.forEach(pushGroup);
  };
  const pushGroup = (group: TimeGroup) => groupMembers(group).forEach(pushItem);
  for (const entry of entries) if (entry.kind === 'event') pushGroup(entry.group);
  return spans;
}

/**
 * Where the marker goes, and what it is inside.
 *
 * `index` is the first entry that is not fully behind `nowMs`, and after them all when every
 * one is — the placement this file has always answered, kept because it is what a boundary
 * needs. `inside` is the innermost row holding the moment, and a host that has one uses it
 * INSTEAD of the index: the marker is nailed to that row at `thruFrac` of its height rather
 * than floated above it.
 */
export function nowLinePlacement(entries: readonly DayEntry[], nowMs: number): NowLinePlacement {
  const index = entries.findIndex((entry) => entryEndMs(entry) > nowMs);
  return {
    index: index === -1 ? entries.length : index,
    inside: nowInside(eventSpans(entries), nowMs),
  };
}

/** The two boxes a hole can draw, and which of them the marker is nailed to. */
export const JOIN_BOX = {
  /** The hole's own row: the free-time strip, or a connection band. */
  HOLE: 'hole',
  /** The journey across the hole. */
  JOURNEY: 'journey',
} as const;
export type JoinBox = (typeof JOIN_BOX)[keyof typeof JOIN_BOX];

/**
 * **WHICH BOX OF A HOLE HOLDS THE MOMENT** (ADR-0217's 2026-09-04 amendment).
 *
 * A hole is not one row. `JoinRow` draws up to two — the free time, then the journey out of it —
 * and `--thru` is a fraction of the marked BOX's height, so a fraction measured over the pair
 * lands wherever the two happen to divide the pixels rather than where the clock is. On the
 * reported day an ⁦08:00–17:00⁩ hole put ⁦13:01⁩ ⁦56%⁩ down a strip-plus-block and the arrow struck
 * the drive — three and three-quarter hours before its own `יציאה עד 16:46`.
 *
 * The two boxes are two intervals: the free time runs to `holeDepartsMs` and the journey runs from
 * it, so the marker asks the same `nowInside` which one it is in and is nailed to that one alone.
 * It is the identical repair the shared reader took on 2026-09-03 (the wrapper's SCOPE, not the
 * fraction), arriving at the host that amendment said did not have it.
 *
 * **It answers which box, never whether that box is DRAWN** (the 2026-09-05 amendment, which took
 * a `statesHole` argument out of here). A hole too short to state free time in, and one whose free
 * time the clock has spent, both draw the journey alone — and telling this rule so made the
 * journey's span the whole hole, so the arrow entered the block two-thirds down it and jumped the
 * moment the strip retired. A journey's box means the journey at every hour; where the hole's own
 * part holds the moment and nothing is drawn for it, the caller stands the mark ABOVE the block,
 * which is the answer the day's edge legs already take.
 */
export function nowInJoin(
  hole: {
    /** The row above's end and the row below's start — the hole's own extent. */
    opensMs: number;
    closesMs: number;
    /** The journey drawn across it, or `null` where the hole draws only itself. */
    journey: DayJourney | null;
  },
  nowMs: number,
): NowInside | null {
  const { opensMs, closesMs, journey } = hole;
  const departsMs = holeDepartsMs(journey, opensMs, closesMs);
  const spans: NowSpan[] =
    departsMs === null
      ? [{ key: JOIN_BOX.HOLE, start: opensMs, end: closesMs }]
      : [
          { key: JOIN_BOX.HOLE, start: opensMs, end: departsMs },
          { key: JOIN_BOX.JOURNEY, start: departsMs, end: closesMs },
        ];
  return nowInside(spans, nowMs);
}

/**
 * **A LEG'S OWN SPAN: WHEN YOU GO, AND WHEN YOU GET THERE.**
 *
 * Recovered from the two fields the row already ships rather than re-derived, so the marker and
 * the words under it cannot disagree: `dayJourney` builds `arriveAtMs` as `goesAtMs + travel`, so
 * subtracting the leg gives back the departure it counted forward from — the advised leave-by
 * where the row states one, and the earliest departure that exists where it states none (a
 * flexible destination has no deadline to count back from, ADR-0206 §AJ1/§AR1).
 *
 * `null` on every arm that predicts no arrival: the four with no estimate (§AA4/§AM10/§AU1/§AZ1)
 * and the denied claim (ADR-0208 §2). A row that will not say when it lands must not be told where
 * the clock is inside it either.
 */
function legSpan(journey: DayJourney): NowSpan | null {
  const lands = journey.arriveAtMs;
  if (lands === null || !Number.isFinite(lands) || journey.travelSeconds === null) return null;
  const departs = lands - journey.travelSeconds * MS_PER_SECOND;
  return lands > departs ? { key: JOIN_BOX.JOURNEY, start: departs, end: lands } : null;
}

/**
 * **WHERE THE MOMENT STANDS AGAINST A LEG THAT HAS NO JOIN ABOVE IT** — the day's first drive out
 * of the bed you woke in (ADR-0206 §AD), the one that brought you to it, and the one back into
 * tonight's (ADR-0209 §1). All three render outside the block loop, so the placement the loop
 * performs for every other hole has to be performed for them here.
 *
 * Without it the boundary mark keeps the one position it has always had — **below** all three —
 * at every hour of the day: at ⁦05:00⁩ it says an ⁦08:40⁩ departure out of the hotel is behind us,
 * and after the day's last row it says a drive still ahead of you is done. That is the reported
 * defect one row up, at the two ends of the day.
 *
 * A leg is an interval, so this is `nowInside` over one span like everything else.
 */
export function nowInJourney(journey: DayJourney | null, nowMs: number): NowInside | null {
  if (!journey) return null;
  const span = legSpan(journey);
  if (!span) return null;
  // **A claim that somebody is moving holds from the moment it is made** (ADR-0207 §2), whatever
  // the leave-by says — which is the owner's own "unless someone marked it as on the way".
  const start = journey.arm === DAY_JOURNEY_ARM.ON_WAY ? Math.min(span.start, nowMs) : span.start;
  return nowInside([{ ...span, start }], nowMs);
}

/** **Whether such a leg is still AHEAD of the moment** — the mark stands above it while it is, and
 *  keeps its shipped place below it once it is not. A leg somebody is on is never ahead, and
 *  neither is one that predicts no arrival: with nothing to compare against, the day may not claim
 *  the drive has not started either. */
export function journeyIsAhead(journey: DayJourney | null, nowMs: number): boolean {
  if (!journey || journey.arm === DAY_JOURNEY_ARM.ON_WAY) return false;
  const span = legSpan(journey);
  return span !== null && nowMs < span.start;
}
