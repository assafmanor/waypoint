// The routing module (ADR-0205 §6; `backend/CLAUDE.md`: a new domain gets its own module).
//
// The provider is bound through a **token rather than a class**, which is §2's port made
// concrete: self-hosting Valhalla or moving to Geoapify behind the same interface is a change in
// this file and nowhere else, and §Y1 records that as a decision deliberately left open.
import { Module } from '@nestjs/common';
import {
  DEFAULT_ROUTING_BASE_URL,
  DEFAULT_ROUTING_FALLBACK_BASE_URL,
  ROUTING_BASE_URL,
  ROUTING_FALLBACK_BASE_URL,
  ROUTING_FALLBACK_DISABLED,
} from '../common/env';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { FailoverRouteProvider } from './failover.provider';
import { OsrmRouteProvider } from './osrm.provider';
import { MapModule } from '../map/map.module';
import { MembershipGuard } from '../trips/membership.guard';
import { PolitenessLimiter } from './politeness.limiter';
import { ROUTE_PROVIDER, type RouteProvider } from './route-provider';
import { RoutePackService } from './route-pack.service';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';
import { ValhallaRouteProvider } from './valhalla.provider';

@Module({
  // The gate needs the trip's download clusters, and `MapService.coordinatesFor` is already the
  // one derivation of "every coordinate this trip has committed to" (ADR-0187 §3). ADR-0205 §3
  // is explicit that the routing gate reuses ADR-0186 §4's clustering rather than growing a
  // second definition of what a trip covers.
  imports: [MapModule],
  controllers: [RoutingController],
  providers: [
    MembershipGuard,
    // The outbound client is enrichment's, deliberately (rule 8, and ADR-0166 §8 named ETA as a
    // consumer of it before this module existed): it is the process's ONE allowlisted, timeboxed,
    // size-capped seat, and a second fetcher would be a second place to get SSRF wrong.
    EnrichmentFetcher,
    // One limiter instance for the whole process, which is what "server-wide" in §2 means — a
    // per-request limiter would pace nothing. Bound through a factory because its gap is a
    // defaulted constructor argument, which Nest's reflection would otherwise try to inject.
    { provide: PolitenessLimiter, useFactory: () => new PolitenessLimiter() },
    {
      // **Two providers, primary first** (ADR-0205 §Y5). §Y1 listed "FOSSGIS degrades" as a
      // trigger for leaving the community server and the trigger fired: `valhalla1` served `503`
      // for the better part of a day, and with one host in the allowlist that meant no travel
      // times at all, mid-trip. A switch a human has to notice, decide and redeploy is a runbook,
      // not a switch — so the fallback is wired, not documented.
      //
      // Valhalla stays PRIMARY because its numbers are the tuned ones (§Z7's walking speed,
      // ferry avoidance, a stated tileset vintage); OSRM answers only when Valhalla cannot answer
      // at all. `ROUTING_FALLBACK_DISABLED` returns the single-provider behaviour for anyone who
      // would rather have no estimate than a less-tuned one.
      provide: ROUTE_PROVIDER,
      inject: [EnrichmentFetcher],
      useFactory: (fetcher: EnrichmentFetcher): RouteProvider => {
        const primary = new ValhallaRouteProvider(fetcher);
        if (process.env[ROUTING_FALLBACK_DISABLED]) return primary;
        const fallbackUrl =
          process.env[ROUTING_FALLBACK_BASE_URL] || DEFAULT_ROUTING_FALLBACK_BASE_URL;
        // A fallback pointed at the primary's own host is not a fallback; it would double every
        // failed call against the host that is already failing.
        const primaryUrl = process.env[ROUTING_BASE_URL] || DEFAULT_ROUTING_BASE_URL;
        if (hostOf(fallbackUrl) === hostOf(primaryUrl)) return primary;
        return new FailoverRouteProvider(primary, new OsrmRouteProvider(fetcher, fallbackUrl));
      },
    },
    RoutingService,
    // The offline pack (ADR-0206 §V1.8). Here rather than in `MapModule` because it needs
    // both `RoutingService` and `MapService`, and routing is the side that already imports map —
    // the other way round is a module cycle (§AO).
    RoutePackService,
  ],
  exports: [RoutingService, RoutePackService],
})
export class RoutingModule {}

/** Host of a configured origin, or the string itself when it will not parse — a value that
 *  cannot be parsed has already failed `validateConfig` at boot, so this only has to avoid
 *  throwing during module construction. */
function hostOf(value: string): string {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}
