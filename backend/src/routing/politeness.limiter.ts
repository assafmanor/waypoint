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

  constructor(private readonly minGapMs: number = ROUTING_MIN_CALL_GAP_MS) {}

  /** How many calls are waiting, which is what an honest `Retry-After` is derived from. */
  get depth(): number {
    return this.queued;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    this.queued++;
    const started = this.tail.then(async () => {
      const wait = this.lastDepartureAt + this.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastDepartureAt = Date.now();
      return task();
    });
    this.tail = started.catch(() => undefined);
    try {
      return await started;
    } finally {
      this.queued--;
    }
  }

  /** Log-and-swallow wrapper for the warm path, where nothing is waiting on the answer. */
  async runQuietly(label: string, task: () => Promise<void>): Promise<void> {
    try {
      await this.run(task);
    } catch (error: unknown) {
      this.logger.warn(`routing call failed (${label}): ${String(error)}`);
    }
  }
}
