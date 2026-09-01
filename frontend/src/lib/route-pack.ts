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
//
// **And since ADR-0206 §AZ5, getting the pack onto the device at all.** §V1.8 hung both halves off
// the Map's archive flow, which is a 42 MB opt-in behind a prompt — so a group that never opened
// the Map, or dismissed that prompt, had no pack, and the artefact built to make every day of the
// trip warm was reaching almost nobody. A pack is a few hundred KB, it is the one thing that makes
// a day switch instant and a plane readable, and it is not in the class of download ADR-0186 §5's
// prompt exists for. So it is fetched per trip, once, quietly — and the Map's flow keeps its own
// call, which is now the redundant one rather than the only one.
import { useEffect } from 'react';
import { routePackSchema } from '@waypoint/shared';
import { downloadMapArchive, listMapArchives, readLocalMapArchive } from './map-archive-cache';
import { routePackUrl } from './map-config';
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
    // **A pack that is not here yet has not been hydrated** — the mark has to describe what was
    // actually read, or the hydrate that follows a download is a no-op against a set that only
    // recorded the attempt (ADR-0206 §AZ5, which is the caller that makes both calls).
    if (!stored) {
      hydrated.delete(url);
      return 0;
    }
    const pack = routePackSchema.parse(JSON.parse(await stored.blob.text()));
    return await fillCachedRouteLegs(pack.legs);
  } catch {
    // Unreadable, unparseable, or a schema that moved on. A pack is a cache of a cache; the
    // worst case is the day it would have filled reading remotely, which is where it started.
    hydrated.delete(url);
    return 0;
  }
}

/** Trips whose pack this session has already fetched (or tried to). A pack is small and a trip
 *  has one; re-deciding on every mount is what a `useEffect` with an object dep would do. */
const fetched = new Set<string>();

/** **The longest this waits on a `Retry-After` it does not control** (ADR-0206 §BA3) — the same
 *  reasoning as `WARM_RETRY_MAX_MS` next door, at a pack's own scale: a precompute is slower than
 *  a matrix call, and a minute is already past the point where the next mount will ask anyway. */
const PACK_RETRY_MAX_S = 60;

export function resetRoutePackFetchForTests(): void {
  fetched.clear();
}

/**
 * **PUT THE TRIP'S TRAVEL TIMES ON THE DEVICE, WITHOUT ASKING FOR A MAP FIRST** (ADR-0206 §AZ5).
 *
 * Three things this is the answer to, and they are one thing: a day you swipe to has its numbers
 * before you arrive (the peek never fetches, ADR-0200 §7); a day nobody has opened is already warm
 * when they open it; and a device with no signal reads every day of the trip rather than the ones
 * it happened to visit while online. The server precomputes every ordered pair of every day
 * (`route-pack.ts`, backend), so one download covers all three and a reorder mid-flight too.
 *
 * **Hydrating is separate from fetching and always runs**, because the two caches are evicted by
 * different rules: a pack can be on the device with its legs gone from Dexie, and the one that
 * matters on a plane is the one holding the legs.
 *
 * Silent by nature — no status, no prompt, no error state. A pack that does not arrive leaves
 * every day exactly where §D4 leaves it, which is a complete state.
 */
export function useTripRoutePack(opts: {
  tripId: string | undefined;
  offline: boolean;
  /** A finished trip is swept rather than stocked (ADR-0186 §6), so it is not fetched either. */
  ended: boolean;
  /** `/me`'s `map.archiveVintage`, so a pack cut before the current one is replaced rather than
   *  held for the life of the install — the same rule every other archive follows. */
  archiveVintage?: string | null;
}): void {
  const { tripId, offline, ended, archiveVintage } = opts;
  useEffect(() => {
    if (!tripId) return;
    // Captured, because `pass` is hoisted and TypeScript cannot carry the narrowing across it.
    const id = tripId;
    const url = routePackUrl(id);
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** Spent on the one `202` wait below, so a pack that is never ready cannot loop. */
    let waited = false;
    void pass();
    async function pass(): Promise<void> {
      // First, and whatever the network is doing: what is already here.
      await hydrateRoutePack(url);
      if (!live || offline || ended || fetched.has(id)) return;
      const held = (await listMapArchives().catch(() => [])).find((entry) => entry.key === url);
      // **Stale is decided the way every other archive decides it** — `useMapArchives`' own
      // `wanted`, not reproduced here: a pack this device holds at the vintage the server is
      // cutting is the pack, and re-downloading it every session would spend bytes to learn that.
      if (held && !isPackStale(held.vintage, archiveVintage)) return;
      fetched.add(id);
      try {
        const result = await downloadMapArchive({
          url,
          kind: 'routes',
          tripId: id,
          currentTripId: id,
          vintage: archiveVintage,
        });
        // **`202` — the server is still precomputing, and it is WAITED FOR ONCE** (ADR-0206 §BA3).
        //
        // This returned and left the trip without a pack for the session, on the reasoning that "a
        // timer for an optimisation is a poll". A cold trip's pack is precomputed on the first ask,
        // so `202` is not the exception there — it is what the FIRST device to open the trip always
        // gets, and every day it would have warmed then goes without. That is the owner's _"sometimes
        // they're not preloaded at all"_.
        //
        // One wait, paced by the answer's own `Retry-After` and capped, which is ADR-0187's flow
        // rather than a poll; past it the next mount asks again, since nothing is recorded.
        if (result.status !== 'stored') {
          fetched.delete(id);
          if (live && result.status === 'preparing' && !waited) {
            retry = setTimeout(
              () => {
                waited = true;
                void pass();
              },
              Math.min(Math.max(result.retryAfterSeconds ?? 0, 1), PACK_RETRY_MAX_S) * 1000,
            );
          }
          return;
        }
        await hydrateRoutePack(url);
      } catch {
        // Offline, refused, failed. The day falls back to reading remotely or to §D4's chip.
        fetched.delete(id);
      }
    }
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, [archiveVintage, ended, offline, tripId]);
}

/** A pack cut before the vintage the server is cutting now is replaceable; one with no vintage
 *  recorded, or a server that names none, is left alone (ADR-0186 §6's amendment). */
const isPackStale = (held: string | undefined, cutting: string | null | undefined): boolean =>
  !!cutting && !!held && held !== cutting;
