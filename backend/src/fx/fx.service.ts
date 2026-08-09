// The rate feed (ADR-0180 §4/§7), which is ADR-0166's pipe at a much smaller scale.
//
// Three properties, all inherited rather than invented:
//
//  - **Serve stale, never block** (§6.4). A read returns whatever is stored and
//    schedules a refresh if one is due. Nothing user-facing ever waits on a
//    third party, and a source being down freezes the number instead of
//    removing it.
//  - **The read is the trigger** (§14). There is no scheduler, and that is
//    consistent with decided practice rather than a preference — ADR-0157 §6
//    and ADR-0166 §14 both faced this and answered the same way. A snapshot read
//    already happens; deciding whether the set has lapsed costs one indexed
//    lookup we are doing anyway.
//  - **Surplus work is dropped, never queued.** A refresh already in flight is
//    not started twice, and a dropped pass simply still reads as due on the next
//    snapshot. A queue would be state a redeploy loses, protecting work that
//    costs nothing to redo.
//
// What is NOT inherited is the negative cache. Enrichment needs one because most
// places will never have a summary and re-asking every provider forever is the
// expensive mistake (§6.4). Here there is exactly one document, fetched at most
// once a day for the whole install, so there is nothing to bound.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { fxRatesSchema, type FxRates } from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FX_DISABLED } from '../common/env';
import { FX_PROVIDER, type FxProvider } from './fx.provider';

/** How long to wait before re-attempting after a failed pass, so a source that
 *  is down is retried on the next snapshot rather than on every one. Deliberately
 *  much shorter than a publication cycle: the cost of a retry is one small
 *  request, and the cost of not retrying is a card that stays frozen. */
const RETRY_AFTER_MS = 15 * 60 * 1000;

/** The stored row as Prisma hands it back — JSON column, `Date` columns. Named
 *  rather than inlined because two methods now take it. */
type FxRateSetRow = {
  base: string;
  rates: unknown;
  publishedAt: Date;
  nextUpdateAt: Date;
  provider: string;
  providerUrl: string;
};

@Injectable()
export class FxService {
  private readonly log = new Logger(FxService.name);
  /** One in-flight pass process-wide. Not a queue — a second caller during a
   *  fetch simply does not start a second one. */
  private inFlight: Promise<void> | null = null;
  /** When a pass last STARTED, success or not — see `isDue`. */
  private lastAttemptAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FX_PROVIDER) private readonly provider: FxProvider,
  ) {}

  /** The snapshot's read. Returns the stored set at whatever age it is, and
   *  schedules a refresh when one is due — the two halves of §6.4 in one call,
   *  because separating them is how a read ends up not triggering anything
   *  (ADR-0166 §14's build shipped a complete pipe nothing ever started). */
  async readAndRefresh(): Promise<FxRates | null> {
    const row = await this.prisma.fxRateSet.findFirst();

    if (this.isDue(row)) {
      // `void`, and wrapped: a snapshot read is a paid, user-blocking request,
      // and no housekeeping may be what fails it (ADR-0166 §14's `sweepAfterMint`
      // rule, same reasoning).
      try {
        void this.refresh();
      } catch {
        /* unreachable — refresh never throws — and cheap insurance anyway */
      }
    }

    return this.parse(row);
  }

  /** The stored set, with **no** trigger — the read half of `readAndRefresh`.
   *  Its one caller is the on-demand refresh route, which has just awaited a
   *  pass and wants what that pass wrote; asking `readAndRefresh` there would
   *  schedule a second pass on the way out for no reason. */
  async read(): Promise<FxRates | null> {
    return this.parse(await this.prisma.fxRateSet.findFirst());
  }

  private parse(row: FxRateSetRow | null): FxRates | null {
    if (!row) return null;
    // Parsed on the way out rather than trusted: the row is JSON written by a
    // past version of this code, and the surfaces that read it have no other
    // guard. A malformed row reads as "no rates", which is a designed state.
    const parsed = fxRatesSchema.safeParse({
      base: row.base,
      rates: row.rates,
      publishedAt: row.publishedAt.toISOString(),
      nextUpdateAt: row.nextUpdateAt.toISOString(),
      provider: row.provider,
      providerUrl: row.providerUrl,
    });
    if (!parsed.success) {
      this.log.warn('stored FX set failed validation; serving none');
      return null;
    }
    return parsed.data;
  }

  /** Due when the source says a newer set should exist (or nothing is stored),
   *  and not more often than `RETRY_AFTER_MS`.
   *
   *  **The attempt clock is in memory, not a column**, and that is the same call
   *  ADR-0166 §14 makes: a redeploy losing it is harmless, because the worst
   *  case is one extra request. It is needed at all because `fetchedAt` is
   *  written only on SUCCESS — so while the source is down, `nextUpdateAt` stays
   *  in the past and every snapshot would otherwise start another pass. A row
   *  that succeeds moves `nextUpdateAt` ~24h out, so this guard only ever bites
   *  during an outage, which is exactly when it should. */
  private isDue(row: { nextUpdateAt: Date } | null): boolean {
    if (process.env[FX_DISABLED] === '1') return false;
    const now = Date.now();
    if (now - this.lastAttemptAt < RETRY_AFTER_MS) return false;
    if (!row) return true;
    return now >= row.nextUpdateAt.getTime();
  }

  /** Fetch and store. **Never throws** — every caller is a fire-and-forget from
   *  a request that must not fail because a third party did. */
  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<void> {
    this.lastAttemptAt = Date.now();
    try {
      const fx = await this.provider.fetch();
      await this.prisma.fxRateSet.upsert({
        where: { base: fx.base },
        create: {
          base: fx.base,
          rates: fx.rates,
          publishedAt: new Date(fx.publishedAt),
          nextUpdateAt: new Date(fx.nextUpdateAt),
          fetchedAt: new Date(),
          provider: fx.provider,
          providerUrl: fx.providerUrl,
        },
        update: {
          rates: fx.rates,
          publishedAt: new Date(fx.publishedAt),
          nextUpdateAt: new Date(fx.nextUpdateAt),
          fetchedAt: new Date(),
          provider: fx.provider,
          providerUrl: fx.providerUrl,
        },
      });
    } catch (err) {
      // Logged, not rethrown, and not stored as a failure state: the previous
      // set stays exactly as it was, which is the whole serve-stale contract.
      this.log.warn(`FX refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
