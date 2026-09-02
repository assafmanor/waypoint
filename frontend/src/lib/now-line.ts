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
// **The rule itself lives in `lib/now-inside.ts`**, unit-agnostic, because the shared reader
// (`lib/share-now-line.ts`) needs the same rule over a different unit — it compares
// pre-formatted `HH:MM` labels, since the public projection deliberately ships no instants
// (ADR-0213 §11), and its own comment asks to be unified "when `nowLinePlacement` grows its
// `inside` shape". What this file owns is the translation from `DayEntry` to that rule's spans.
import { groupEndEvent, groupMembers, type DayEntry } from './day-entries';
import { nowInside, type NowInside, type NowSpan } from './now-inside';
import { EVENT_STATUS } from '@waypoint/shared';
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
