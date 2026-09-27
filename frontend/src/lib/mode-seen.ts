// **The last mode this install SAW a trip in** (ADR-0221 §4).
//
// The going-live switch is armed only when the mode changes while the shell is mounted,
// and the automatic flip happens at trip-local midnight — so the product's one cinematic
// moment was playing for nobody. Remembering the mode a trip was last seen in is what lets
// the first open on departure day mount in plan chrome and switch for real.
//
// `waypoint:*` like every other key in this app (root `CLAUDE.md`: these keys ARE the
// local cache and are not renamed). Per trip, like `waypoint:map-download-prompt:<tripId>`.
import type { Mode } from './mode';

const KEY_PREFIX = 'waypoint:mode-seen:';

function key(tripId: string): string {
  return `${KEY_PREFIX}${tripId}`;
}

/** The mode this trip was last seen in on this install, or `null` when never seen. Never
 *  throws — a private window rejects the read — and an unknown value reads as never seen. */
export function modeSeen(tripId: string): Mode | null {
  try {
    const raw = localStorage.getItem(key(tripId));
    return raw === 'trip' || raw === 'plan' ? raw : null;
  } catch {
    return null;
  }
}

export function markModeSeen(tripId: string, mode: Mode): void {
  try {
    localStorage.setItem(key(tripId), mode);
  } catch {
    /* a private window; the first morning simply plays again next time */
  }
}

/** **Does the first open of this trip in trip mode deserve the going-live sequence?** Yes
 *  whenever the install has never seen this trip live — including someone joining
 *  mid-trip, whose first open of a live trip is still a first. The caller decides what
 *  reduced motion does with the answer. */
export function shouldGoLive(tripId: string, mode: Mode): boolean {
  return mode === 'trip' && modeSeen(tripId) !== 'trip';
}

// **Coming home** (ADR-0241 §3), in the same shape but its own key: the provider writes
// `mode-seen` on every mount, which would mark the beat before the memory Home was on screen.
const CAME_HOME_PREFIX = 'waypoint:came-home:';

/** Has this install shown this finished trip's coming-home beat? Never throws; a private window
 *  reads as never, and simply plays it again. */
export function cameHome(tripId: string): boolean {
  try {
    return localStorage.getItem(`${CAME_HOME_PREFIX}${tripId}`) != null;
  } catch {
    return false;
  }
}

/** Marked by the memory Home when the beat ends, is skipped, or is withheld under reduced
 *  motion — never by the provider. */
export function markCameHome(tripId: string): void {
  try {
    localStorage.setItem(`${CAME_HOME_PREFIX}${tripId}`, '1');
  } catch {
    /* a private window; the beat plays again next time */
  }
}
