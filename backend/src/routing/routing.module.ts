// The routing module (ADR-0205 §6; `backend/CLAUDE.md`: a new domain gets its own module).
//
// The provider is bound through a **token rather than a class**, which is §2's port made
// concrete: self-hosting Valhalla or moving to Geoapify behind the same interface is a change in
// this file and nowhere else, and §Y1 records that as a decision deliberately left open.
import { Module } from '@nestjs/common';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { MapModule } from '../map/map.module';
import { MembershipGuard } from '../trips/membership.guard';
import { PolitenessLimiter } from './politeness.limiter';
import { ROUTE_PROVIDER, type RouteProvider } from './route-provider';
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
      provide: ROUTE_PROVIDER,
      inject: [EnrichmentFetcher],
      useFactory: (fetcher: EnrichmentFetcher): RouteProvider => new ValhallaRouteProvider(fetcher),
    },
    RoutingService,
  ],
  exports: [RoutingService],
})
export class RoutingModule {}
