// **When an enrichment pass happens** (ADR-0166 §14, filling in what §6 left as "scheduled
// after the fact" without saying by what).
//
// Three triggers, each riding a request that was going to happen anyway, so this file adds no
// scheduler, no queue, no new dependency and nothing that runs on a clock:
//
//  1. **A pick** — `resolvePlace` fires one pass for the place just picked, so a place enriches
//     while the person who added it is still looking at it.
//  2. **A snapshot read** — the trip snapshot's own enrichment join already knows which of the
//     trip's places are missing or past TTL, so it hands that list over for free. This is what
//     backfills places picked before any of this existed, what refreshes a value once its TTL
//     lapses, and what recovers a pass a redeploy interrupted.
//  3. **A tap on a place nobody has added yet** (§17) — the deciding surface, and the only one
//     with a **person waiting on the answer**, which is why `enrichNow` is the one door here
//     that returns a value and can be awaited. The two triggers above deliver through the
//     snapshot and the WS nudge, both keyed by `placeId`; a candidate has no `placeId`, so its
//     answer travels back down the request that asked.
//
// **The read starts the backfill; each pass's completion continues it** (§14's 2026-08-11
// amendment). The original shape started three passes per read and discarded the rest, on the
// reasoning that the read trigger is idempotent and the next snapshot would re-offer them. It
// is idempotent — but the next snapshot only happens when somebody opens the trip again, so a
// cleared cache needed one app-open per three places and looked, correctly, like enrichment
// being slow. A completed pass now takes the next stale place instead.
//
// **This is still not a scheduler** (ADR-0157 §6's refusal stands): nothing ticks, nothing is
// persisted, nothing needs shutting down, and the concurrency ceiling is unchanged — it is the
// same three passes, kept busy instead of stopping. A restart loses the backlog, and the next
// snapshot read rebuilds it for free, which is exactly what made dropping it safe in the first
// place.
//
// **What keeps this from hammering Wikimedia is the negative cache, not this file.** A place
// that has nothing is re-attempted at most once every 30 days (§6.4's miss TTL) however many
// times it is read, so fetch volume is bounded by the number of *places*, not by traffic. The
// caps below are the second line of defence, for the cold-start case where a trip's places are
// all unattempted at once.
import { Injectable, Logger } from '@nestjs/common';
import type { DeliveredEnrichmentFields } from '@waypoint/shared';
import { ENRICHMENT_DISABLED } from '../common/env';
import { toDeliveredEnrichment } from './enrichment.mapper';
import type { PlaceIdentity } from './enrichment.provider';
import { EnrichmentService, type StoredEnrichment } from './enrichment.service';

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
 * How many stale places one snapshot read may hold **waiting** for a slot.
 *
 * This used to be `MAX_PASSES_PER_READ = 3` — a read started three passes and **discarded the
 * rest**, so a trip only filled in three places per app-open and nothing re-fired on its own
 * (owner report, 2026-08-11: enrichment "takes a long time", after clearing `PlaceEnrichment`
 * made every place stale at once). A 40-place trip needed fourteen opens. The places were not
 * failing to match; they were never being asked about.
 *
 * So the surplus is **held** now rather than dropped, and `pump` feeds it into the same three
 * slots as they free up (see the header's amended note). The cap is a memory bound on one
 * process's backlog, not a rate: the rate is still `MAX_CONCURRENT_PASSES`, unchanged, because
 * that is what Wikimedia etiquette is about and nothing measured says three is too few.
 *
 * **Anything past this is logged, not silently dropped** — it is also still stale, so the next
 * read re-offers it.
 */
const MAX_PENDING_BACKFILL = 200;

/**
 * The ceiling a pass **somebody is waiting for** may use, above the background cap.
 *
 * A tap is a person looking at a blank card; a backfill is nobody. Letting an interactive pass
 * take a slot a snapshot's cold start is holding is the difference between "the picture appeared"
 * and "the picture appeared the second time you tapped, for no reason you could see". Still a
 * ceiling and not a bypass, because the etiquette argument in the header does not stop applying
 * when the traffic is interactive — and the route's own per-member·trip rate limit is the brake
 * that actually bounds this one.
 */
const MAX_CONCURRENT_PASSES_FOR_A_WAITER = 6;

/**
 * How long `enrichNow` waits for the pass it started before answering with what the store
 * already holds.
 *
 * Long enough for the usual pass — a Wikidata search, one entity read, a summary and a modest
 * image — and short enough that a stuck source is a card that says nothing rather than a spinner
 * you have to abandon. Nothing is lost when it lapses: the pass keeps running and stores its
 * result, so the next tap on that same place answers instantly and so does the place once it is
 * added. The per-fetch timeout (`ENRICHMENT_FETCH_TIMEOUT_MS`, 8s default) bounds one request;
 * this bounds the whole pass, which is several of them in sequence.
 */
const LOOKUP_WAIT_MS = 5000;

@Injectable()
export class EnrichmentScheduler {
  private readonly logger = new Logger(EnrichmentScheduler.name);

  /** Places with a pass in flight, keyed by `googlePlaceId` → **the pass itself**. Two members
   *  opening the same trip at once — or a pick immediately followed by a snapshot read — must not
   *  run the same pass twice, and the store is global so the duplicate would be cross-trip too.
   *
   *  It holds the promise rather than just the key so a **waiter can join a pass already
   *  running** (§17): two people tapping the same result get one pass and both get its answer. */
  private readonly inFlight = new Map<string, Promise<StoredEnrichment | null>>();

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
    void this.start(identity, MAX_CONCURRENT_PASSES);
  }

  /**
   * Schedule the stale places a snapshot read turned up — **all of them**, drained at the
   * concurrency cap rather than truncated to it.
   *
   * Still synchronous and `void`: this queues and pumps, and the pumping is what the completion
   * of each pass continues. A cleared cache now drains from one app-open instead of needing one
   * open per three places.
   */
  scheduleMany(identities: readonly PlaceIdentity[]): void {
    if (this.disabled()) return;
    let dropped = 0;
    for (const identity of identities) {
      const key = identity.googlePlaceId;
      if (!key || this.inFlight.has(key) || this.pending.has(key)) continue;
      if (this.pending.size >= MAX_PENDING_BACKFILL) {
        dropped += 1;
        continue;
      }
      this.pending.set(key, identity);
    }
    // No silent caps: a backlog this long is worth knowing about, and everything past the bound
    // is still stale, so the next snapshot read offers it again.
    if (dropped > 0) {
      this.logger.warn(`enrichment backlog full: ${dropped} stale places left for a later read`);
    }
    this.pump();
  }

  /**
   * **Fill every free slot from the backlog, and keep filling it as slots free.**
   *
   * The one change that makes a cold start finish: called once when a read queues work, and
   * again from every pass's `finally`, so the three slots stay busy until the backlog is empty
   * instead of stopping after the first three places. It is not a scheduler and not a clock —
   * there is nothing to tick, nothing to persist and nothing to shut down; a restart simply
   * loses a backlog that the next snapshot read rebuilds for free (ADR-0166 §14).
   */
  private pump(): void {
    if (this.disabled()) {
      this.pending.clear();
      return;
    }
    while (this.pending.size > 0 && this.inFlight.size < MAX_CONCURRENT_PASSES) {
      const [key, identity] = this.pending.entries().next().value!;
      this.pending.delete(key);
      void this.start(identity, MAX_CONCURRENT_PASSES);
    }
  }

  /** Stale places waiting for a slot, keyed by `googlePlaceId` so a place queued twice — by two
   *  members' reads, or by a read and a pick — is queued once. Insertion-ordered, so a backlog
   *  drains in the order the snapshot listed it. */
  private readonly pending = new Map<string, PlaceIdentity>();

  /**
   * **A pass with somebody waiting on it** (§17) — what a place the trip does not hold yet is
   * enriched by, since it has neither a snapshot row nor a `placeId` to be nudged about.
   *
   * The bargain is bounded, not unlimited: it waits `LOOKUP_WAIT_MS` for the pass and then
   * answers with whatever the store holds — which is the right answer in every branch. Fresh
   * already? `enrich` returns without asking a source at all, so this is one query. Nothing
   * there? An empty payload, which is the majority case (§11.3) and renders as nothing at all.
   * Slow source? What we had, and the pass finishes into the store for next time.
   *
   * **The only method here that can be awaited, and the only one that returns a value.** §6's
   * guarantee — no request ever waits on a third party — is about requests that exist for
   * something else: a pick, a snapshot. This request exists *for* the enrichment, so waiting for
   * it is its own job rather than a source slowing something unrelated down.
   */
  async enrichNow(identity: PlaceIdentity): Promise<DeliveredEnrichmentFields> {
    const pass = this.start(identity, MAX_CONCURRENT_PASSES_FOR_A_WAITER);
    const stored = pass ? await Promise.race([pass, afterLookupWait()]) : null;
    if (stored) return toDeliveredEnrichment(stored.fields);
    // The pass was refused (kill switch, no alias, at the ceiling), failed, or outran the wait.
    // Either way the question stands, and the store may well answer it from an earlier pass.
    const held = await this.enrichment.read(identity);
    return held ? toDeliveredEnrichment(held.fields) : {};
  }

  /**
   * Start a pass, join one already running, or refuse — the one place that decides which.
   *
   * Returns the pass so a caller **may** wait for it; `schedule` deliberately does not, which is
   * what keeps its own contract (synchronous, `void`, cannot throw) intact. `null` means no pass
   * is running for this place and none was started.
   */
  private start(identity: PlaceIdentity, ceiling: number): Promise<StoredEnrichment | null> | null {
    if (this.disabled()) return null;
    const key = identity.googlePlaceId;
    // No alias to dedupe on means no way to tell two passes for the same place apart. A
    // coordless Place-lite is also not matchable yet (§10), so there is nothing to do for it.
    if (!key) return null;
    const running = this.inFlight.get(key);
    if (running) return running;
    if (this.inFlight.size >= ceiling) return null; // dropped, not queued — see header

    const pass = this.enrichment
      .enrich(identity)
      .catch((err: unknown) => {
        // Already logged per-provider inside the pass; this catches a store or storage fault,
        // which is ours rather than a source's and so is worth its own line. Swallowed rather
        // than rethrown: a pass that fails is a field that stays empty, never a caller that
        // breaks — including the one that is waiting for it.
        this.logger.warn(`enrichment pass failed for ${key}: ${(err as Error).message}`);
        return null;
      })
      .finally(() => {
        this.inFlight.delete(key);
        // **The chain.** A freed slot immediately takes the next stale place, which is what
        // turns "three per app-open" into "the trip drains from one".
        this.pump();
      });
    this.inFlight.set(key, pass);
    return pass;
  }

  /** In-flight count, for tests and for a future health line. */
  get activePasses(): number {
    return this.inFlight.size;
  }
}

/** The wait itself. `unref` so a lookup answered by its pass leaves nothing holding the process
 *  open for the remainder of the window — which a test process would otherwise sit through. */
function afterLookupWait(): Promise<null> {
  return new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), LOOKUP_WAIT_MS).unref();
  });
}
