// **Where "now" lands in a day's list.**
//
// One derivation, two hosts: Trip mode's live now-line (`DayView`, ADR-0043) and Plan
// mode's static now-reference (`PlanDay`), which differ only in which instant they are
// given. Both used to compute this inline, in two spellings — Trip read a cluster's
// `endMs`, Plan read the end of the cluster's last-ending member — and while those agree
// today, "where is now" is exactly the kind of fact that must not have two answers.
//
// **This is deliberately shaped for a generalization it does not yet make.** Today the
// marker can only land BETWEEN rows: the answer is an index, and a row that is currently
// running gets the line above it rather than through it. But "now" is often genuinely
// INSIDE something — a flight you are on, a dinner you are at, the layover between two
// legs — and the honest marker would say so rather than floating above the row. The
// journey block (ADR-0159) is the first place the line renders inside a container, and
// it is a hint of the shape rather than the shape itself.
//
// So the return value is an object with one field, not a bare number: the day it grows
// `inside` (the entry the moment falls within, plus how far through it is) every caller
// keeps working, and the placement stays computed in one place instead of being
// re-derived per surface. See the backlog line "the now-line says where we actually are".
import { groupEndEvent, type DayEntry } from './day-entries';

export interface NowLinePlacement {
  /** The entry the marker sits ABOVE. `entries.length` means after all of them —
   *  every row is behind us. */
  index: number;
}

/** When an entry is finished with: a group ends with its last-ending member, a
 *  transition point is an instant and ends at itself. */
function entryEndMs(entry: DayEntry): number {
  if (entry.kind !== 'event') return entry.atMs;
  const end = groupEndEvent(entry.group);
  return Date.parse(end.endsAt ?? end.startsAt!);
}

/**
 * The marker goes above the first entry that is not fully behind `nowMs`, and after
 * them all when every one is. A row that is *running* therefore has the line above it,
 * which is the approximation this file exists to eventually replace.
 */
export function nowLinePlacement(entries: readonly DayEntry[], nowMs: number): NowLinePlacement {
  const index = entries.findIndex((entry) => entryEndMs(entry) > nowMs);
  return { index: index === -1 ? entries.length : index };
}
