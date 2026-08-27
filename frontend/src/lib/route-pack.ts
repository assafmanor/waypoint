// **The offline route pack, on the device** (ADR-0206 §V1.8) — the small half of M10, and it is
// small on purpose: everything that makes an offline artefact safe was built by ADR-0186 §5/§6
// and is reused rather than restated here.
//
//   - **Downloaded, budgeted, evicted and pinned** by `map-archive-cache.ts` — one byte cache,
//     one budget, one LRU, the current trip pinned, the ended trip swept. A pack is `kind:
//     'routes'` in that store and nothing else.
//   - **Counted and deleted** by the readout and the delete `UserSettings` already renders: both
//     group by `tripId`, which a pack carries.
//   - **Missing is never an error** (§6 rule 5, ADR-0206 §D4). No pack, an unreadable one, a
//     half-written one: every path here answers "nothing hydrated" and the day falls back to
//     reading remotely, or to the crow-flies chip.
//
// What is left for this file is the two steps in between: read the stored bytes, and put the legs
// where `useDayTravel` already looks for them.
import { routePackSchema } from '@waypoint/shared';
import { readLocalMapArchive } from './map-archive-cache';
import { fillCachedRouteLegs } from './travel';

/** **Packs this session has already read into Dexie.** Hydrating is idempotent, but reading the
 *  blob is not free — this runs on the Map's mount, where main-thread work is paid for by the
 *  arrival landing that follows (`useMapArchives`' own note on `inspect`). */
const hydrated = new Set<string>();

export function resetRoutePackHydrationForTests(): void {
  hydrated.clear();
}

/**
 * **Put a stored pack's legs into the table the day reads**, and answer how many were new.
 *
 * Runs whenever a pack is present rather than only when one is downloaded, because the two
 * caches can fall out of step: the byte store and Dexie are evicted by different rules and
 * different browsers, and the one that matters on a plane is the one that has the legs in it.
 * Once per key per session — see `hydrated`.
 */
export async function hydrateRoutePack(url: string): Promise<number> {
  if (hydrated.has(url)) return 0;
  hydrated.add(url);
  try {
    const stored = await readLocalMapArchive(url);
    if (!stored) return 0;
    const pack = routePackSchema.parse(JSON.parse(await stored.blob.text()));
    return await fillCachedRouteLegs(pack.legs);
  } catch {
    // Unreadable, unparseable, or a schema that moved on. A pack is a cache of a cache; the
    // worst case is the day it would have filled reading remotely, which is where it started.
    hydrated.delete(url);
    return 0;
  }
}
