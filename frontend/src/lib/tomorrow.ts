// **THE SHAPE OF TOMORROW** (ADR-0214) — what the night board draws in the slot a finished
// day leaves idle.
//
// The lookahead itself was never missing: `deriveNow` carries no date filter, so `הבא בתור`
// has crossed midnight since the first build and says which day it means since ADR-0211 §6.
// What was missing is the SHAPE — how full tomorrow is, when it really starts, and where it
// ends up — and a point cannot carry that, because a point is a title and a time.
//
// **This file is deliberately thin, and that is the point.** `buildDayGlance` already answers
// for any date, including a future one (it returns `nowFrac: null` for a day that has no now);
// `lib/day-track.ts` already turns those segments into positioned boxes and decides which marks
// may be drawn. What is left here is only what is TOMORROW's about it: which block the board's
// title is naming, and that a stop nobody has lived yet cannot have been skipped.
//
// The split is the reuse (ADR-0214 §5): the Home glance rail is the second consumer of the
// track already asked for, so anything true of "a day drawn as a proportional strip" belongs one
// file over, and only the adapter belongs here.
import type { DayGlance } from './glance';
import {
  thinMarks,
  trackBlocks,
  trackMarks,
  type TrackBlock,
  type TrackMark,
  type TrackMeta,
} from './day-track';

/** Tomorrow's blocks and marks are the track's own — re-exported under the names the board
 *  props use, so a reader of `Board.tsx` is not sent two files away to learn what a block is. */
export type RibbonBlock = TrackBlock;
export type RibbonMark = TrackMark;

export interface TomorrowRibbon {
  blocks: RibbonBlock[];
  marks: RibbonMark[];
  /** How many counted blocks tomorrow holds — `0` is the "nobody has filled it in" arm, and it
   *  is the emptiness test rather than `glance.empty`: a day with only a stay's own edges on it
   *  reports `empty: false` with two anchors and no blocks at all. */
  count: number;
}

export interface TomorrowRibbonInput {
  /** Tomorrow's glance, built with tomorrow's date and window (`buildDayGlance`). */
  glance: DayGlance;
  /** Per-segment icons and commitments — see {@link TrackMeta}. */
  meta: TrackMeta;
  /** How many marks the strip may carry at most. Defaulted so a caller cannot silently
   *  disagree with `constants.ts` about the taste half of the rule. */
  cap?: number;
}

/**
 * **Tomorrow's shape, from tomorrow's own glance.**
 *
 * The `cue` lands on the FIRST block, and that is not an arbitrary choice: the board's rank-1
 * title is `deriveNow`'s next, which on a finished day is tomorrow's earliest timed event — the
 * same event `buildDayGlance` sorts first. So the halo marks the block the title is talking
 * about, which is what lets the strip carry no caption at all.
 *
 * Skipped segments are dropped rather than struck: the rail shows them struck-through because it
 * is a record of a day being lived, and tomorrow has not been lived yet, so a skip on it is an
 * editing artefact rather than an outcome. **This is the one rule here that a glance rail must
 * not inherit**, which is exactly why it lives in the adapter and not in `day-track.ts`.
 */
export function tomorrowRibbon(input: TomorrowRibbonInput): TomorrowRibbon {
  const segs = input.glance.segs.filter((seg) => seg.phase !== 'skipped');
  const blocks = trackBlocks(segs, input.meta, { isCue: (_seg, i) => i === 0 });
  const marks = thinMarks(trackMarks(segs, input.meta), input.cap);
  return { blocks, marks, count: blocks.length };
}
