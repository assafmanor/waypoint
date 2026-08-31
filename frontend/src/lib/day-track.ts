// **A DAY AS A PROPORTIONAL TRACK** — the geometry two surfaces want and neither should own
// (ADR-0214 §5).
//
// The night board's tomorrow-strip is the first consumer; the Home glance rail is the second
// one already asked for, so this file is deliberately the shared half and `lib/tomorrow.ts` is
// deliberately thin. The split follows the precedent `frontend/CLAUDE.md` names for exactly
// this shape: `lib/edge-fade.ts` + `styles/edge-fade.css` is one strip mechanism serving three
// strips, and it exists because three surfaces each wrote the fade out and the CONDITION they
// all lacked then had to be added three times. A second copy of the rules below would repeat
// that, and the rules are the part with the measured numbers in them.
//
// **What belongs here:** turning `DayGlance.segs` into positioned boxes, and deciding which
// positioned marks may be drawn at all. Both are questions about a track of a given width, not
// about which day it is or what colour it wears.
//
// **What does not:** which segment is the interesting one, what a surface calls the day, and
// every ink — a consumer supplies the first two and `styles/day-track.css` reads the rest from
// `--track-*` custom properties the host sets. So the board's dark ground and the glance's
// paper are the same geometry with different tokens, which is the thing that makes a v2 of the
// glance a re-skin rather than a rewrite.
//
// Pure and injected, like `gap-character.ts`: fractions in, a view model out. No formatting, no
// zone resolution, no `Date.now()`, and nothing that measures the DOM — a consumer must be able
// to compute this during render rather than after it.
import { DAY_TRACK } from '../constants';
import type { GlanceSeg } from './glance';

/** One occupied stretch of the day, in window fractions (0..1) — `DayGlance`'s own scale. */
export interface TrackBlock {
  key: string;
  startFrac: number;
  endFrac: number;
  /** A hard commitment: solid rather than tinted (the hard/soft grammar, ADR-0011). */
  hard: boolean;
  /** Zero-length by nature (a check-in) or by data (`endsAt === startsAt`) — drawn as a tick. */
  point: boolean;
  /** The end lands on the next calendar day (ADR-0037): the trailing edge fades. */
  nextDay: boolean;
  /** Several events collapsed into one box (a cluster or an envelope, ADR-0041). Carried
   *  because a consumer with room may want to say so — the strip deliberately does not. */
  composite: boolean;
  /** The block whichever header names, so it can be marked without a caption. At most one. */
  cue: boolean;
}

/** A glyph over the track, at an instant. */
export interface TrackMark {
  key: string;
  frac: number;
  /** The event's own icon — content the group chose, never a mark this layer picks. */
  icon: string;
}

/** **Per-segment facts a `GlanceSeg` does not carry**, keyed by its `key` — which is the root
 *  event's own id (`groupKey`), so a caller holding the day's events resolves them by lookup.
 *  Both are the event's data rather than the rail's: an icon is content, and `hard` is
 *  ADR-0011's commitment. For a COMPOSITE segment the key is its first member, so what a
 *  cluster's icon and commitment are is the caller's call — it is the only one that knows the
 *  containment forest the segment came from. */
export type TrackMeta = Record<string, { icon?: string; hard?: boolean }>;

export interface TrackBlocksOptions {
  /** Which segment wears the cue. Defaults to none. */
  isCue?: (seg: GlanceSeg, index: number) => boolean;
  /** Whether a segment is drawn at all. Defaults to "everything the glance returned". */
  include?: (seg: GlanceSeg) => boolean;
}

/** The spacing two marks need in FRACTION space, computed for the NARROWEST track — which is
 *  the decision rather than the arithmetic: a wider phone keeps the same marks instead of
 *  finding room for more, so one day reads one way on every device (ADR-0214 §4). */
export const MARK_MIN_FRAC = DAY_TRACK.MARK_MIN_PX / DAY_TRACK.NARROWEST_TRACK_PX;

/**
 * **`DayGlance.segs` as boxes, and the reason a consumer takes segments rather than events.**
 *
 * `segs` are the containment forest's ROOTS (ADR-0041): a partial overlap comes back as one
 * composite segment, a containment as an envelope, and three events starting on one minute as a
 * single segment that turns its own count off. So **two events cannot be two blocks if they
 * overlap** — a track built from this inherits non-overlap instead of re-deriving it, and there
 * is no overlap rule here to get wrong.
 *
 * The one thing this does add is the zero-width case: an event whose `endsAt` equals its
 * `startsAt` arrives with `point: false` and no width at all, which is why the shipped rail
 * draws nothing for it (see `docs/backlog.md`). Both zero-length shapes read as a tick here.
 */
export function trackBlocks(
  segs: GlanceSeg[],
  meta: TrackMeta,
  { isCue, include }: TrackBlocksOptions = {},
): TrackBlock[] {
  const kept = include ? segs.filter(include) : segs;
  return kept.map((seg, i) => ({
    key: seg.key,
    startFrac: seg.startFrac,
    endFrac: seg.endFrac,
    hard: !!meta[seg.key]?.hard,
    point: seg.point || seg.endFrac - seg.startFrac < 1e-9,
    nextDay: seg.nextDay,
    composite: seg.composite,
    cue: isCue ? isCue(seg, i) : false,
  }));
}

/** The marks a set of segments would want, before thinning — one per segment that has an icon.
 *  A segment with no icon carries no mark, which is how a block with nothing attached stays
 *  silent rather than borrowing a default glyph.
 *
 *  **A mark sits over the MIDDLE of its block, not over its start instant** (owner, on the
 *  built strip: _"the emojis are too much to the right instead of being centered to their
 *  line"_). Right, and the reason is what a mark IS: the block carries the time — that is what
 *  a proportional track is for — so the glyph is a label on the thing, and a label belongs over
 *  the thing it labels. Anchored at the start it hangs off the block's leading edge, which in
 *  RTL reads as floating to the right of it.
 *
 *  It also has to be the drawn position rather than a second one, which is why the midpoint is
 *  computed HERE and not in CSS: {@link thinMarks} decides collisions on `frac`, so a mark drawn
 *  anywhere else would be spaced against a position it does not occupy. */
export function trackMarks(segs: GlanceSeg[], meta: TrackMeta): TrackMark[] {
  return segs
    .map((seg) => ({
      key: seg.key,
      frac: (seg.startFrac + seg.endFrac) / 2,
      icon: meta[seg.key]?.icon ?? '',
    }))
    .filter((mark) => !!mark.icon);
}

/**
 * **Which marks survive, in two passes — because a cap and a collision are different
 * questions.**
 *
 * Merging them is a mistake the drawing made and its own collision assertion caught: with one
 * greedy step a cap of ⁦5⁩ became a ⁦1/5⁩ spacing across the whole window, so a day whose five
 * stops sit inside three hours kept **one** mark. A cap limits a count; it says nothing about
 * spacing.
 *
 * Pass 1 is the collision rule: greedy in time order, keep a mark when it clears the last kept
 * one by {@link MARK_MIN_FRAC}. Pass 2 applies the cap by sampling that set **evenly**, and it
 * always keeps the first and the last — the first is usually the block a header names, and the
 * last is the evening, which a "keep the first N" rule silently drops.
 *
 * **This is the alternative to a lane band, not a cheaper version of one.** ADR-0077 answers
 * colliding pills by stacking them into lanes, which is right on a surface with height to give
 * and wrong on one where every busy day would grow. The precedent for thinning instead is
 * shipped one layer down: `GlanceSeg.showCount` drops the NUMBER on a too-narrow composite
 * rather than finding it room, because "the exact count is one tap away".
 *
 * Generic over the mark shape so a consumer can thin anything positioned — a glance anchor is
 * the next one to want it.
 */
export function thinMarks<T extends { frac: number }>(
  marks: T[],
  cap: number = DAY_TRACK.MARK_CAP,
): T[] {
  const spaced: T[] = [];
  let last = -Infinity;
  for (const mark of marks) {
    if (mark.frac - last >= MARK_MIN_FRAC - 1e-9) {
      spaced.push(mark);
      last = mark.frac;
    }
  }
  if (spaced.length <= cap) return spaced;
  if (cap <= 1) return spaced.slice(0, Math.max(0, cap));
  const picked: T[] = [];
  for (let i = 0; i < cap; i++) {
    const mark = spaced[Math.round((i * (spaced.length - 1)) / (cap - 1))];
    if (!picked.includes(mark)) picked.push(mark);
  }
  return picked;
}

/** The inline style a block needs, as the two custom properties `styles/day-track.css` reads.
 *  Here rather than at each render site so a second consumer cannot invent a third property
 *  name for the same two numbers. */
export const trackBlockStyle = (block: TrackBlock): Record<string, string> => ({
  '--s': `${block.startFrac * 100}%`,
  '--w': `${Math.max(0, block.endFrac - block.startFrac) * 100}%`,
});

/** The class list for a block, from its own flags — one string builder, so the board and the
 *  glance cannot end up spelling `next-day` two ways. */
export const trackBlockClass = (block: TrackBlock): string =>
  'wp-track-blk' +
  (block.hard ? ' hard' : '') +
  (block.point ? ' point' : '') +
  (block.nextDay ? ' next-day' : '') +
  (block.cue ? ' cue' : '');
