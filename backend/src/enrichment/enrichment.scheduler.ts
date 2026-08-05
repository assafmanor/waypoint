// **When an enrichment pass happens** (ADR-0166 §14, filling in what §6 left as "scheduled
// after the fact" without saying by what).
//
// Two triggers, both riding a request that was going to happen anyway, so this file adds no
// scheduler, no queue, no new dependency and nothing that runs on a clock:
//
//  1. **A pick** — `resolvePlace` fires one pass for the place just picked, so a place enriches
//     while the person who added it is still looking at it.
//  2. **A snapshot read** — the trip snapshot's own enrichment join already knows which of the
//     trip's places are missing or past TTL, so it hands that list over for free. This is what
//     backfills places picked before any of this existed, what refreshes a value once its TTL
//     lapses, and what recovers a pass a redeploy interrupted.
//
// **Nothing is ever queued — surplus work is dropped.** That looks lossy and is not: the
// read trigger is idempotent and re-fires on the next snapshot, and `attemptedAt` is only
// written when a pass completes, so a dropped or interrupted pass simply still reads as stale.
// A queue here would be state that a redeploy loses anyway, protecting work that costs nothing
// to redo.
//
// **What keeps this from hammering Wikimedia is the negative cache, not this file.** A place
// that has nothing is re-attempted at most once every 30 days (§6.4's miss TTL) however many
// times it is read, so fetch volume is bounded by the number of *places*, not by traffic. The
// caps below are the second line of defence, for the cold-start case where a trip's places are
// all unattempted at once.
import { Injectable, Logger } from '@nestjs/common';
import { ENRICHMENT_DISABLED } from '../common/env';
import type { PlaceIdentity } from './enrichment.provider';
import { EnrichmentService } from './enrichment.service';

/**
 * How many passes may be in flight across the whole process.
 *
 * Deliberately small. Each pass is several sequential third-party requests, and Wikimedia's
 * API etiquette asks a client to behave like one client rather than a fleet — a handful of
 * concurrent passes is the difference between a polite backfill and something that gets an IP
 * rate-limited. Not env-tunable yet: nothing has run against the live APIs, so there is no
 * measurement to tune against, and an untested knob is worse than a documented constant.
 */
const MAX_CONCURRENT_PASSES = 3;

/**
 * How many stale places one snapshot read may schedule.
 *
 * Bounds the cold-start burst: a trip whose 40 places are all unattempted would otherwise try
 * to enrich all 40 the first time anyone opens it. At this rate the trip fills in over the next
 * few reads instead, which nobody notices because nothing renders enrichment synchronously.
 */
const MAX_PASSES_PER_READ = 3;

@Injectable()
export class EnrichmentScheduler {
  private readonly logger = new Logger(EnrichmentScheduler.name);

  /** Places with a pass in flight, keyed by `googlePlaceId`. Two members opening the same trip
   *  at once — or a pick immediately followed by a snapshot read — must not run the same pass
   *  twice, and the store is global so the duplicate would be cross-trip too. */
  private readonly inFlight = new Set<string>();

  constructor(private readonly enrichment: EnrichmentService) {}

  /** Is outbound enrichment switched off? Read per call, not at module load, so the switch
   *  works without a redeploy and a test can stub it. */
  private disabled(): boolean {
    return Boolean(process.env[ENRICHMENT_DISABLED]);
  }

  /**
   * Schedule one pass, and **return immediately**.
   *
   * Synchronous and `void` by design: the whole point of §6 is that no request ever waits on a
   * third party. A caller cannot await this even by accident, and it can never throw into the
   * caller — a pass that fails is a field that stays empty, never a pick that fails or a
   * snapshot that 500s.
   */
  schedule(identity: PlaceIdentity): void {
    if (this.disabled()) return;
    const key = identity.googlePlaceId;
    // No alias to dedupe on means no way to tell two passes for the same place apart. A
    // coordless Place-lite is also not matchable yet (§10), so there is nothing to do for it.
    if (!key) return;
    if (this.inFlight.has(key)) return;
    if (this.inFlight.size >= MAX_CONCURRENT_PASSES) return; // dropped, not queued — see header

    this.inFlight.add(key);
    void this.enrichment
      .enrich(identity)
      .catch((err: unknown) => {
        // Already logged per-provider inside the pass; this catches a store or storage fault,
        // which is ours rather than a source's and so is worth its own line.
        this.logger.warn(`enrichment pass failed for ${key}: ${(err as Error).message}`);
      })
      .finally(() => this.inFlight.delete(key));
  }

  /** Schedule the stale places a snapshot read turned up, bounded per read. */
  scheduleMany(identities: readonly PlaceIdentity[]): void {
    for (const identity of identities.slice(0, MAX_PASSES_PER_READ)) this.schedule(identity);
  }

  /** In-flight count, for tests and for a future health line. */
  get activePasses(): number {
    return this.inFlight.size;
  }
}
