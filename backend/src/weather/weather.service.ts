// The forecast pipe (ADR-0218 §1), which is **`PlaceEnrichment`'s store with `FxService`'s
// policy** — and the distinction is the whole design.
//
// The policy, copied from `fx.service.ts` line for line in intent:
//
//  - **Serve stale, never block** (ADR-0166 §6.4). A read returns whatever is stored and
//    schedules a refresh if one is due. Nothing user-facing ever waits on a third party.
//  - **The read is the trigger** (§14). There is no scheduler and no route: `FxController`
//    exists only because a human taps refresh, and nobody taps a forecast — its trigger is the
//    day turning over, which the snapshot read already witnesses. ADR-0157 §6 and ADR-0166 §14
//    both faced the "introduce a scheduler?" question and answered the same way.
//  - **In-flight dedupe, and surplus dropped rather than queued.** A dropped pass simply still
//    reads as due on the next snapshot.
//  - **A `_DISABLED` kill switch**, the fifth of its kind.
//
// The STORE is not FX's, and `fx.service.ts`'s own header says why it cannot be: *"there is
// exactly one document … nothing to bound."* A forecast is keyed by place AND day, so it is a
// bounded, expiring, many-row table. What that changes here is that everything is per **cell**:
// the due check, the in-flight map, and the attempt clock.
//
// **Two clocks, and confusing them is the bug this file is most exposed to.** `expiresAt` is
// MET's own caching contract (~22 min) and decides when to RE-ASK. ADR-0218 §4's 6h/24h shelf
// life decides what may be SHOWN, runs from the model's issue time, and is enforced where the
// card is rendered — because the snapshot is mirrored into Dexie and read offline, so a bound
// applied only here would be a bound that stops applying the moment it matters.
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  forecastCell,
  forecastCellSchema,
  type Forecast,
  type ForecastCell,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WEATHER_DISABLED } from '../common/env';
import { zoneAt } from '../common/geo-zone';
import { WEATHER_PROVIDER, type WeatherProvider } from './weather.provider';

/** How long to wait before re-attempting a cell after any pass, successful or not.
 *
 *  It floors MET's ~22-minute `Expires` rather than replacing it, and its real job is the same
 *  one it does in `fx.service.ts`: `fetchedAt` is written only on success, so while the source
 *  is down `expiresAt` stays in the past and every snapshot in the fleet would start another
 *  pass. In memory, not a column — a redeploy losing it costs one extra request, which is the
 *  same call ADR-0166 §14 makes. */
const RETRY_AFTER_MS = 15 * 60 * 1000;

/** How many passes may be in flight across the whole process.
 *
 *  MET's stated ceiling is 20 req/s for the whole application and this is orders of magnitude
 *  under it, so the cap is not a rate limit — it is the same politeness `enrichment.scheduler`
 *  keeps for Wikimedia: behave like one client rather than a fleet. */
const MAX_CONCURRENT_PASSES = 3;

/** How many cells one snapshot read may start. The rest are not queued: the read trigger is
 *  idempotent, a trip holds a handful of cells rather than the forty places that made
 *  ADR-0166 §14's backlog necessary, and the next snapshot re-offers whatever was skipped. */
const MAX_CELLS_PER_READ = 3;

/**
 * **How many distinct cells one trip may hold forecasts for.**
 *
 * A cell is ~⁦11km⁩, so a city trip is one or two and a Tokyo → Hakone → Kyoto → Nara → Osaka
 * itinerary is a handful; ⁦12⁩ is a genuinely multi-country trip and still one small request per
 * cell per refresh, orders of magnitude under MET's ⁦20⁩ req/s. It is a bound rather than a
 * budget: a trip past it simply reads the dashed placeholder on the days it cannot reach, which
 * is the state ADR-0218 §5 already designs for.
 */
const MAX_CELLS_PER_TRIP = 12;

/** A cell this trip could ask about, as the snapshot read hands it over. */
export interface CellRequest {
  cell: string;
  lat: number;
  lng: number;
}

/**
 * **Which cells this trip could ask about**, which is exactly the set the frontend's day anchor
 * can resolve to: `dayAnchorCoord` answers with a placed event's coordinate or, failing that,
 * the trip's destination (ADR-0113). So rounding those same points is the complete answer, and
 * the backend needs none of the zone-evidence derivation the frontend runs per day.
 *
 * The destination leads, because it is the anchor for every day nothing else places — which on a
 * trip that is still being planned is all of them.
 */
export function forecastCells(
  destination: { destinationLat: number | null; destinationLng: number | null },
  places: readonly { lat: number | null; lng: number | null }[],
): CellRequest[] {
  const points = [
    { lat: destination.destinationLat, lng: destination.destinationLng },
    ...places.map((p) => ({ lat: p.lat, lng: p.lng })),
  ];
  const cells = new Map<string, CellRequest>();
  for (const { lat, lng } of points) {
    if (lat === null || lng === null) continue;
    const cell = forecastCell(lat, lng);
    if (cells.has(cell)) continue;
    cells.set(cell, { cell, lat, lng });
    if (cells.size >= MAX_CELLS_PER_TRIP) break;
  }
  return [...cells.values()];
}

/** The stored row as Prisma hands it back. */
type ForecastRow = {
  cell: string;
  date: string;
  zone: string;
  symbolCode: string;
  tempMax: number;
  tempMin: number;
  precipMm: number;
  issuedAt: Date;
  expiresAt: Date;
  lastModified: string | null;
};

@Injectable()
export class WeatherService {
  private readonly log = new Logger(WeatherService.name);
  /** One in-flight pass per cell, process-wide. Not a queue — a second caller during a fetch
   *  simply does not start a second one for the same cell. */
  private readonly inFlight = new Map<string, Promise<void>>();
  /** When a pass last STARTED for a cell, success or not — see `isDue`. */
  private readonly lastAttemptAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEATHER_PROVIDER) private readonly provider: WeatherProvider,
  ) {}

  /** The snapshot's read. Returns what is stored for these cells at whatever age it is, and
   *  schedules refreshes for the ones that are due — the two halves in one call, because
   *  separating them is how a read ends up not triggering anything (ADR-0166 §14's build
   *  shipped a complete pipe that nothing ever started). */
  async readAndRefresh(requests: readonly CellRequest[]): Promise<Forecast | null> {
    if (requests.length === 0) return null;
    const cells = [...new Set(requests.map((r) => r.cell))];
    const rows = (await this.prisma.weatherForecast.findMany({
      where: { cell: { in: cells } },
      orderBy: [{ cell: 'asc' }, { date: 'asc' }],
    })) as ForecastRow[];

    const newestByCell = new Map<string, ForecastRow>();
    for (const row of rows) {
      const held = newestByCell.get(row.cell);
      if (!held || row.expiresAt > held.expiresAt) newestByCell.set(row.cell, row);
    }

    const due = requests.filter((r) => this.isDue(newestByCell.get(r.cell)));
    if (due.length > 0) {
      // `void`, and wrapped: a snapshot read is a paid, user-blocking request, and no
      // housekeeping may be what fails it (ADR-0166 §14's `sweepAfterMint` rule).
      try {
        void this.refreshMany(due, newestByCell);
      } catch {
        /* unreachable — refresh never throws — and cheap insurance anyway */
      }
    }

    return this.assemble(rows);
  }

  /** Rows to the wire shape, validated on the way OUT rather than trusted: they are written by
   *  a past version of this code, and the surfaces that read them have no other guard. A
   *  malformed cell reads as a cell we hold nothing for, which is a designed state (§5). */
  private assemble(rows: readonly ForecastRow[]): Forecast | null {
    const byCell = new Map<string, ForecastRow[]>();
    for (const row of rows) {
      const bucket = byCell.get(row.cell);
      if (bucket) bucket.push(row);
      else byCell.set(row.cell, [row]);
    }

    const cells: ForecastCell[] = [];
    for (const [cell, cellRows] of byCell) {
      const parsed = forecastCellSchema.safeParse({
        cell,
        zone: cellRows[0].zone,
        // The rows of one cell share an issue time by construction (one response writes them
        // all); the newest is taken rather than assumed, so a half-written cell reads as its
        // OLDEST fact rather than its most flattering one.
        issuedAt: new Date(Math.min(...cellRows.map((r) => r.issuedAt.getTime()))).toISOString(),
        days: cellRows.map((r) => ({
          date: r.date,
          symbolCode: r.symbolCode,
          tempMax: r.tempMax,
          tempMin: r.tempMin,
          precipMm: r.precipMm,
        })),
      });
      if (parsed.success) cells.push(parsed.data);
      else this.log.warn(`stored forecast for cell ${cell} failed validation; serving none`);
    }
    if (cells.length === 0) return null;

    return {
      provider: this.provider.attribution,
      providerUrl: this.provider.attributionUrl,
      cells,
    };
  }

  /** Due when the provider's own `Expires` has passed (or nothing is stored), and not more often
   *  than `RETRY_AFTER_MS`. */
  private isDue(held: ForecastRow | undefined): boolean {
    if (process.env[WEATHER_DISABLED] === '1') return false;
    return !held || Date.now() >= held.expiresAt.getTime();
  }

  /** Fetch and store a set of cells. **Never throws** — every caller is a fire-and-forget from a
   *  request that must not fail because a third party did. */
  async refreshMany(
    requests: readonly CellRequest[],
    held?: ReadonlyMap<string, { lastModified: string | null }>,
  ): Promise<void> {
    const now = Date.now();
    const startable = requests
      .filter((r) => !this.inFlight.has(r.cell))
      .filter((r) => now - (this.lastAttemptAt.get(r.cell) ?? 0) >= RETRY_AFTER_MS)
      .slice(0, Math.min(MAX_CELLS_PER_READ, MAX_CONCURRENT_PASSES - this.inFlight.size));

    await Promise.all(startable.map((r) => this.refresh(r, held?.get(r.cell)?.lastModified)));
  }

  /** One cell, deduped. Never throws. */
  async refresh(request: CellRequest, lastModified?: string | null): Promise<void> {
    const running = this.inFlight.get(request.cell);
    if (running) return running;
    const pass = this.run(request, lastModified).finally(() => {
      this.inFlight.delete(request.cell);
    });
    this.inFlight.set(request.cell, pass);
    return pass;
  }

  private async run(request: CellRequest, lastModified?: string | null): Promise<void> {
    this.lastAttemptAt.set(request.cell, Date.now());
    // The bucketing zone comes from the CELL, not from the trip: the row is global, so two trips
    // at the same coordinate must agree about where Tuesday starts. `geo-tz` is the same source
    // `Place.timezone` comes from (ADR-0107), so the two cannot drift.
    const zone = zoneAt(request.lat, request.lng);
    if (!zone) return;

    try {
      const result = await this.provider.fetch(request.cell, zone, lastModified);
      const fetchedAt = new Date();

      if (result.notModified) {
        // **A 304 is a successful refresh, not a miss** (MET's own wording). The model has not
        // been re-run, so `issuedAt` — and with it ADR-0218 §4's shelf life — deliberately does
        // NOT move. Only the caching clocks do.
        await this.prisma.weatherForecast.updateMany({
          where: { cell: request.cell },
          data: { fetchedAt, expiresAt: result.expiresAt, lastModified: result.lastModified },
        });
        return;
      }

      const issuedAt = new Date(result.issuedAt);
      await this.prisma.$transaction([
        // Replace rather than upsert: the horizon MOVES, so yesterday's rows and any day the
        // provider no longer reaches must go. An upsert would leave a day-12 row from last week
        // sitting past the horizon, which is exactly the stale-looking-fresh state §4 forbids.
        this.prisma.weatherForecast.deleteMany({ where: { cell: request.cell } }),
        this.prisma.weatherForecast.createMany({
          data: result.days.map((day) => ({
            cell: request.cell,
            zone,
            date: day.date,
            symbolCode: day.symbolCode,
            tempMax: day.tempMax,
            tempMin: day.tempMin,
            precipMm: day.precipMm,
            issuedAt,
            fetchedAt,
            expiresAt: result.expiresAt,
            lastModified: result.lastModified,
          })),
        }),
      ]);
    } catch (err) {
      // Logged, not rethrown, and not stored as a failure state: the previous days stay exactly
      // as they were, which is the whole serve-stale contract. What removes them is age, not a
      // failed pass (§4).
      this.log.warn(
        `weather refresh failed for ${request.cell}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
