// **What is awake** (ADR-0197 §4): a 60-second interval in the one Nest service.
//
// Not `@nestjs/schedule` — a decorator around `setInterval` for one job, registered globally
// in a way that makes the test story worse. Not a Railway cron hitting an HTTP route — a
// second deploy artifact, and a route that can notify every user is an auth seat to defend
// forever. Not `pg_cron` — that would put the catalogue's logic in SQL where none of it can
// be unit-tested.
//
// **60 seconds is also `fireKey`'s bucket** (`send-policy.ts`): a notification may be up to a
// minute late, and nothing in ADR-0198's catalogue is written to a tighter tolerance.
//
// The clock is injected the same way the sweep's is, so a spec drives ticks directly and
// never waits for real time. `PUSH_DISABLED` is read per tick, not at boot, so it can be
// flipped without a deploy — and note what it does NOT stop: subscribing, unsubscribing and
// every in-app surface, which are the primary and of which push is only the amplifier.
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PUSH_DISABLED } from '../common/env';
import { NOTIFICATION_KINDS } from './notification-registry';
import { NotificationSweepService } from './notification-sweep.service';

/** The tick interval. Named here rather than inlined because it is load-bearing twice: it
 *  bounds how late a notification can be, and §3.1's threshold-2 ("a tick that cannot finish
 *  inside its interval") is measured against it. */
export const SWEEP_INTERVAL_MS = 60_000;

/** How often the ledger's retention runs. **Not every tick**: it is a `deleteMany` over a
 *  date range that has nothing to do 1,439 minutes out of every 1,440, and it rides the sweep's
 *  timer rather than a second one because a second timer is a second thing to shut down
 *  cleanly (ADR-0072). */
export const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class NotificationSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(NotificationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  /** One tick at a time. A sweep that outruns its interval must not have a second copy of
   *  itself running beside it — that would double every query and race the ledger against
   *  itself for no benefit, since the second tick would find the first one's claims. */
  private running = false;
  /** When the retention last ran, so it can ride a 60-second timer at a 6-hour cadence.
   *  `null` means never — and the first tick after a boot prunes, which is also the only
   *  thing that would ever run it on a deploy that restarts more often than the interval. */
  private lastPrunedAtMs: number | null = null;

  constructor(private readonly sweep: NotificationSweepService) {}

  onApplicationBootstrap(): void {
    // **Nothing is scheduled while no kind is registered.** Phase 3 ships in exactly this
    // state, so the timer does not exist at all rather than firing a no-op every minute for
    // the lifetime of the process.
    if (NOTIFICATION_KINDS.length === 0) {
      this.log.log('notification sweep idle: no kinds registered');
      return;
    }
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS);
    // `unref` so a pending tick cannot hold the process open during a shutdown — the
    // graceful-shutdown path (ADR-0072) closes the pool, and a timer keeping the event loop
    // alive turns a clean exit into a hang.
    this.timer.unref();
    this.log.log(`notification sweep every ${SWEEP_INTERVAL_MS / 1000}s`);
  }

  onModuleDestroy(): void {
    // Cleared before the Prisma pool closes (ADR-0072), so an in-flight tick cannot query a
    // closed connection on the way out.
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One tick. Public so a spec can drive it without waiting a minute. */
  async tick(nowMs = Date.now()): Promise<void> {
    if (process.env[PUSH_DISABLED]) return;
    if (this.running) {
      this.log.warn('sweep still running; skipping this tick');
      return;
    }
    this.running = true;
    try {
      await this.sweep.sweep(nowMs);
      await this.pruneIfDue(nowMs);
    } catch (error) {
      // A failed tick is dropped, never retried here: the next one re-derives everything
      // from the entities, so there is nothing to recover (ADR-0197 §3). What must not
      // happen is the interval dying on an unhandled rejection.
      this.log.error(`sweep failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** The retention, at its own cadence. Called inside the tick's `try`, so a failing prune is
   *  logged and dropped exactly like a failing sweep — housekeeping must never be the reason a
   *  notification does not go out. `lastPrunedAtMs` advances only on success, so a broken
   *  prune keeps retrying rather than going quiet for six hours. */
  private async pruneIfDue(nowMs: number): Promise<void> {
    if (this.lastPrunedAtMs !== null && nowMs - this.lastPrunedAtMs < PRUNE_INTERVAL_MS) return;
    await this.sweep.pruneLedger(nowMs);
    this.lastPrunedAtMs = nowMs;
  }
}
