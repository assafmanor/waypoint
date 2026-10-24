// **THE HOME GLANCE RAIL, AS THE SHARED TRACK** (ADR-0215 §2) — the second consumer
// `lib/day-track.ts` was split out for, and deliberately as thin as the first
// (`lib/tomorrow.ts`). Everything about *a day drawn as a proportional strip* is in the shared
// half; everything here is about what the GLANCE has that a lookahead does not: a clock inside
// the window, phases behind it, and a bracketed booking whose edge the rail has never drawn.
//
// Pure and injected, like `gap-character.ts` and `day-track.ts`: fractions in, a view model out.
// No formatting, no zone resolution, no `Date.now()`, nothing that measures the DOM.
import {
  thinMarks,
  trackBlocks,
  trackMarks,
  type TrackBlock,
  type TrackMark,
  type TrackMeta,
} from './day-track';
import type { DayGlance, GlanceAnchor, GlanceSeg } from './glance';

export interface GlanceTrackInput {
  glance: DayGlance;
  /** Per-segment icon + commitment, keyed by segment key — the two facts a `GlanceSeg` does not
   *  carry (see {@link TrackMeta}). An anchor supplies its own, so a caller need not resolve the
   *  stay it never had a block for. */
  meta: TrackMeta;
  /** How many marks may be drawn. Defaults to `DAY_TRACK.MARK_CAP`. */
  cap?: number;
}

export interface GlanceTrack {
  blocks: TrackBlock[];
  marks: TrackMark[];
}

/**
 * **A bracketed edge with no block becomes an instant on the rail** — the finding that made this
 * an adapter rather than a render (`mockups/glance-v2.html` §2a).
 *
 * `buildDayGlance` excludes an ambient span from the counted rail (ADR-0054), so a stay's
 * check-out has an anchor and no segment; ADR-0164 nevertheless counts that edge in `remaining`.
 * Withdrawing ADR-0077's pill band without drawing the moment would therefore have deleted the
 * check-out from a card whose own number was still counting it — the card would say `2` and show
 * one thing. A tick is what the track already draws for an instant, so the moment survives at the
 * position it happens, and its word and time read on the day's rows.
 *
 * **Hard, always.** Every standalone anchor is a bracketed booking's own edge — a reservation with
 * a code behind it — which is ADR-0011's commitment however the event's `kind` was typed.
 */
const edgeSeg = (anchor: GlanceAnchor): GlanceSeg => {
  const frac = anchor.kind === 'span' ? anchor.startFrac : anchor.frac;
  return {
    key: anchor.key,
    startFrac: frac,
    endFrac: frac,
    // **`upcoming`, never the clock's answer**, and this is a decision rather than a shortcut: a
    // check-out at ⁦10:00⁩ is behind you at noon, but the thing it belongs to — the stay — is not,
    // and `remaining` keeps counting the edge until it is settled or the day ends (ADR-0164 §1).
    // Greying it at ⁦10:01⁩ would contradict the number on the same card.
    phase: 'upcoming',
    composite: false,
    clusterLike: false,
    count: 0,
    showCount: false,
    point: true,
    nextDay: false,
    spanned: false,
  };
};

/**
 * **An instant inside an occupied stretch is not a separate stretch** — the rule the running app
 * added to this file, which no drawing could have (ADR-0215 build log).
 *
 * On the seeded arrival day the hotel's check-in (⁦15:00⁩, the hour the door opens — ADR-0171's
 * floor) falls **inside** the long-haul flight's own block, because you are still in the air when
 * the room becomes available. The tick was therefore drawn on top of the flight, amber on amber:
 * invisible, and the one thing this design forbids — two objects overlapping on the rail
 * (measured: ⁦1⁩ touching pair, where every drawn day had ⁦0⁩).
 *
 * Dropping it loses nothing the rail was saying. The tick exists because an ambient edge has no
 * block and `remaining` counts it anyway (§2) — and that reasoning is about a moment **nothing
 * else occupies**, which is the check-out case it was built for. A moment already covered by a
 * drawn block is on the rail; a second mark over it would say only that two things share it, and
 * the count is unchanged either way.
 */
const coveredBySeg = (segs: GlanceSeg[], frac: number): boolean =>
  segs.some((seg) => frac > seg.startFrac + 1e-9 && frac < seg.endFrac - 1e-9);

/**
 * **The day as blocks and marks.** `glance.segs` are the containment forest's roots (ADR-0041), so
 * two events that overlap are already one block before this file sees them and there is no overlap
 * rule here to get wrong; the standalone anchors are merged in as ticks and the whole set is sorted
 * by time, because {@link thinMarks} spaces marks greedily in time order.
 *
 * **No cue.** The night strip marks the block its header names; this rail has a clock in it
 * (`glance.nowFrac`), and two "look here" marks on one strip is one too many.
 *
 * See {@link coveredBySeg} for the one case an edge is dropped rather than drawn.
 */
export function glanceTrack({ glance, meta, cap }: GlanceTrackInput): GlanceTrack {
  const edges = glance.anchors.filter(
    (anchor) =>
      anchor.standalone &&
      !coveredBySeg(glance.segs, anchor.kind === 'span' ? anchor.startFrac : anchor.frac),
  );
  const segs = [...glance.segs, ...edges.map(edgeSeg)].sort((a, b) => a.startFrac - b.startFrac);
  const withEdges: TrackMeta = { ...meta };
  for (const anchor of edges) withEdges[anchor.key] = { icon: anchor.icon, hard: true };
  return {
    blocks: trackBlocks(segs, withEdges),
    marks: thinMarks(trackMarks(segs, withEdges), cap),
  };
}
