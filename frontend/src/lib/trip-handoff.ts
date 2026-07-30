// **The trip you picked comes with you** (ADR-0140 §7, Journey 3).
//
// Tapping a trip in `/trips` swapped the whole screen, and the one thing both surfaces
// draw — the trip's own glyph — was simply redrawn somewhere else with nothing
// connecting the two. So the glyph travels: it lifts off the tile you tapped, holds
// while the trip shell mounts, then lands exactly on the switcher pill's icon, which
// stays hidden until it arrives.
//
// **Why the glyph and not the card.** A shared element has to be the same object at
// both ends. The glyph is: same character, near-identical size (23px in the row, 26px
// in the hero, 22px in the pill). The trip NAME is not — between the two surfaces it
// changes font size, colour, neighbours and truncation, so carrying it would be two
// different objects pretending to be one. The tile travels with the glyph and dissolves
// on the way, which is what makes the arrival a bare glyph sitting on the pill.
//
// **Why a module store and not `useHandoff`** (`lib/handoff.ts`, the app's one-shot
// request primitive): the two ends of this one straddle a route change, so the state
// would have to live in `App`, above `AppRoutes` — and every update would re-render the
// entire route tree at exactly the moment the new route is mounting. Here only the
// layer and the pill subscribe, so a pick costs two small re-renders instead.
//
// **Why not `useDragGhost`**, which also floats a stand-in for a real element: it
// clones the DOM inside one screen and follows a finger with no animation, and its
// clone keeps its looks only because it never leaves the subtree whose CSS paints it.
// None of that survives a route change. The two share just "a fixed box measured from a
// source rect"; folding them together would mean reworking a live gesture path, which
// rule 8 says to ask about rather than do quietly.
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { prefersReducedMotion } from './motion';

/** The tile that was tapped: where it is, and the paint that makes a stand-in
 *  indistinguishable from it. Read off the element rather than declared, so the paper
 *  row and the indigo hero — different size, radius and fill — both hand over through
 *  one code path. */
export interface HandoffOrigin {
  tripId: string;
  glyph: string;
  left: number;
  top: number;
  width: number;
  height: number;
  background: string;
  radius: string;
  fontSize: string;
}

/** Where it has to land: the switcher pill's glyph, once the trip shell has mounted. */
export interface HandoffTarget {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: string;
}

export interface TripHandoff {
  origin: HandoffOrigin | null;
  /** `null` until the destination exists — which is the whole reason this is a store
   *  and not a single call: the pill mounts some frames after the pick, behind a boot
   *  fetch of unknown length. */
  target: HandoffTarget | null;
}

const IDLE: TripHandoff = { origin: null, target: null };

let store: TripHandoff = IDLE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): TripHandoff {
  return store;
}

/** Start carrying `tile`'s glyph into the trip shell. Answers whether it will actually
 *  fly, so the caller can fall back to the ordinary route transition.
 *
 *  Three ways it won't, and all of them are the same answer — no clone, no state:
 *  reduced motion (a user who asked for less did not ask for a different outcome), no
 *  tile, and a tile with **no measurable box**. That last one is what keeps this inert
 *  in jsdom, where every rect is zero: a handoff nothing can measure would leave the
 *  pill's glyph hidden waiting for a flight that cannot land. */
export function beginTripHandoff(tile: Element | null, tripId: string): boolean {
  if (!tile || !(tile instanceof HTMLElement) || prefersReducedMotion()) return false;
  const box = tile.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false;
  const paint = getComputedStyle(tile);
  store = {
    origin: {
      tripId,
      glyph: tile.textContent ?? '',
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      background: paint.backgroundColor,
      radius: paint.borderRadius,
      fontSize: paint.fontSize,
    },
    target: null,
  };
  emit();
  return true;
}

/** Claim a pending handoff for `tripId`: `el` is where the glyph should land. A no-op
 *  unless a handoff for this exact trip is waiting and nothing has claimed it — landing
 *  a glyph on a trip the user did not pick would be worse than not animating. */
export function claimTripHandoff(tripId: string, el: HTMLElement): void {
  const { origin, target } = store;
  if (!origin || origin.tripId !== tripId || target) return;
  const box = el.getBoundingClientRect();
  store = {
    origin,
    target: {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      fontSize: getComputedStyle(el).fontSize,
    },
  };
  emit();
}

/** Done, or given up on. Removes the clone and reveals the real glyph in one commit —
 *  the swap has to be a single render or there is a frame with neither on screen. */
export function endTripHandoff(): void {
  if (store === IDLE) return;
  store = IDLE;
  emit();
}

export function useTripHandoff(): TripHandoff {
  return useSyncExternalStore(subscribe, snapshot, () => IDLE);
}

/** The receiving end. Put `ref` on the element the glyph lands on, and hide that
 *  element while `landing` — a shared element that arrives next to a copy of itself is
 *  just two glyphs.
 *
 *  Measured in a layout effect, before the browser paints the pill, and correct only
 *  because a handoff arrival is the one route transition that does NOT translate the
 *  shell (`data-nav='handoff'`): `getBoundingClientRect` includes ancestor transforms,
 *  so mid-slide it would report the pill up to `--route-offset` from where it settles,
 *  and the glyph would land beside its target instead of on it. */
export function useTripHandoffTarget(tripId: string): {
  ref: React.RefObject<HTMLSpanElement | null>;
  landing: boolean;
} {
  const ref = useRef<HTMLSpanElement>(null);
  const { origin } = useTripHandoff();
  useLayoutEffect(() => {
    if (ref.current) claimTripHandoff(tripId, ref.current);
  }, [tripId]);
  return { ref, landing: origin?.tripId === tripId };
}
