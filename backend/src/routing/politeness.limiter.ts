// **The 1 call/s FOSSGIS asks for** (ADR-0205 §2), server-wide.
//
// ADR-0205 §Z4 measured that the limit **does not bind**: six concurrent identical day matrices
// came back 200 with no `429` and no `Retry-After`. That is exactly why this file exists and says
// so — absence of a rejection is not permission. The limit is a request from volunteers who run
// a planet router for nothing, and §Y1 makes "FOSSGIS asks us to stop" a trigger for leaving the
// community server altogether. Honouring it costs us nothing: §4's cache means a place-pair is
// asked about once, ever.
//
// **What it paces is what leaves the process** (§Y2). A three-mode warm is three upstream calls,
// so it takes ~3 s of paced time rather than bursting — and none of that is on a request path,
// because the batch endpoint answers `202` and warms behind it.
import { Logger } from '@nestjs/common';

/** One call per second, which is the number §2 records FOSSGIS asking for. */
export const ROUTING_MIN_CALL_GAP_MS = 1000;

/**
 * **How many consecutive failures mean the provider is DOWN rather than unlucky** (ADR-0205 §Y3).
 *
 * Three, because two is a coincidence a cold container or one dropped connection produces on its
 * own and this must not open on those — a closed breaker costs nothing, and an open one delays a
 * recovery by the cooldown below. What it exists to stop is the arithmetic of an outage: a
 * three-mode leg is 3 calls per warm, the client retries `DAY_TRAVEL_WARM_ATTEMPTS` (6) rounds,
 * and `DayPeek` mounts the day plus both neighbours — so ~54 calls that cannot succeed leave the
 * process per visit, each holding this file's single seat for its full timeout. The seat is the
 * real cost: a leg that COULD be served queues behind calls that are already known to fail.
 */
export const ROUTING_BREAKER_THRESHOLD = 3;

/**
 * **How long an open breaker waits before letting ONE call test the water** (ADR-0205 §Y3).
 *
 * A minute, matched to the shape of the failure it covers: a provider outage is measured in
 * minutes-to-hours, not seconds, and §4's cache means nothing expires while we wait — every leg
 * already stored keeps answering, so the only thing a longer pause delays is a NEW pair. Short
 * enough that a group adding a stop shortly after the provider returns gets its number without a
 * restart; long enough that the pause is a pause rather than a slower poll.
 */
export const ROUTING_BREAKER_COOLDOWN_MS = 60_000;

/** **The provider is known to be failing, so this call never left the process** (ADR-0205 §Y3).
 *  Distinct from a call that was made and failed, because the warm path logs those and must not
 *  log these: an open breaker is one line at the transition, not one per suppressed call. */
export class RoutingUnavailableError extends Error {
  constructor() {
    super('routing provider is unavailable; call suppressed by the breaker');
    this.name = 'RoutingUnavailableError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A single-file queue with a minimum gap between departures.
 *
 * **A queue and not a token bucket**, which is a real difference at this rate: a bucket lets a
 * burst through after an idle spell, and a burst is the one thing this exists to prevent. Work is
 * never dropped — a task waits its turn — because everything queued here is a warm nobody is
 * holding a socket for.
 */
/** **Not `@Injectable()`, and that is a fix rather than an omission.** The gap is a constructor
 *  parameter with a default, so Nest's reflection reads it as a `Number` dependency and refuses
 *  to build the module — an error that surfaces only when the whole `AppModule` is constructed.
 *  `routing.module.ts` binds it through a factory instead, which is also what makes a spec able
 *  to run it at a zero gap. */
export class PolitenessLimiter {
  private readonly logger = new Logger(PolitenessLimiter.name);
  /** The tail of the chain every task appends itself to. Rejections are swallowed **on the tail
   *  only** (the caller still sees its own), or one failed call would poison every later one. */
  private tail: Promise<unknown> = Promise.resolve();
  private lastDepartureAt = 0;
  private queued = 0;
  /** **The breaker** (ADR-0205 §Y3). Consecutive failures, and when the count last crossed the
   *  threshold — `openedAt` is re-stamped by a failed probe, so the cooldown restarts rather than
   *  letting one call per cooldown through forever. `probing` is what makes half-open a SINGLE
   *  call: without it every queued warm would be admitted the moment the cooldown elapsed, which
   *  is the burst this whole file exists to prevent, aimed at a server already in trouble. */
  private failures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly minGapMs: number = ROUTING_MIN_CALL_GAP_MS,
    private readonly breakerThreshold: number = ROUTING_BREAKER_THRESHOLD,
    private readonly cooldownMs: number = ROUTING_BREAKER_COOLDOWN_MS,
  ) {}

  /** **Whether the provider is currently believed to be down**, for a caller that has to decide
   *  what to promise rather than what to send. `RoutingService.batch` reads it exactly as it
   *  reads `ROUTING_DISABLED`: every stored leg is still served, and no `retryAfterSeconds` is
   *  offered, because nothing is coming and a client spinning `מחשב…` for six rounds over an
   *  outage is the one state ADR-0206 §AU1 forbids. */
  get isOpen(): boolean {
    return this.failures >= this.breakerThreshold;
  }

  /** May this call leave the process at all? Closed: always. Open: only the one probe the
   *  cooldown has earned, and only if no probe is already out. */
  private admit(): boolean {
    if (!this.isOpen) return true;
    if (this.probing) return false;
    if (Date.now() - this.openedAt < this.cooldownMs) return false;
    this.probing = true;
    return true;
  }

  /** A call came back. Success closes the breaker; failure counts, and re-stamps the cooldown
   *  whenever the count is at or past the threshold so a failed probe buys another full wait. */
  private record(ok: boolean): void {
    const wasOpen = this.isOpen;
    this.probing = false;
    if (ok) {
      this.failures = 0;
      if (wasOpen) this.logger.log('routing breaker closed: the provider answered again');
      return;
    }
    this.failures++;
    if (this.isOpen) {
      this.openedAt = Date.now();
      if (!wasOpen) {
        this.logger.warn(
          `routing breaker opened after ${this.failures} consecutive failures; ` +
            `suppressing outbound routing calls for ${this.cooldownMs}ms`,
        );
      }
    }
  }

  /** How many calls are waiting, which is what an honest `Retry-After` is derived from. */
  get depth(): number {
    return this.queued;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    // **Refused before it is queued, which is the whole point** (ADR-0205 §Y3). Queueing it and
    // failing it fast would still spend the seat and still walk the 1 s gap; the cost this saves
    // is the wait every OTHER call does behind a call that cannot succeed.
    if (!this.admit()) throw new RoutingUnavailableError();
    this.queued++;
    const started = this.tail.then(async () => {
      const wait = this.lastDepartureAt + this.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastDepartureAt = Date.now();
      return task();
    });
    this.tail = started.catch(() => undefined);
    try {
      const result = await started;
      this.record(true);
      return result;
    } catch (error) {
      this.record(false);
      throw error;
    } finally {
      this.queued--;
    }
  }

  /** Log-and-swallow wrapper for the warm path, where nothing is waiting on the answer.
   *
   *  **A suppressed call is not a failed call** (ADR-0205 §Y3): the breaker logs the transition
   *  once, so logging every call it then declines to make would bury that line under the ~54 per
   *  visit it exists to prevent. Silence here is the breaker working. */
  async runQuietly(label: string, task: () => Promise<void>): Promise<void> {
    try {
      await this.run(task);
    } catch (error: unknown) {
      if (error instanceof RoutingUnavailableError) return;
      this.logger.warn(`routing call failed (${label}): ${String(error)}`);
    }
  }
}
