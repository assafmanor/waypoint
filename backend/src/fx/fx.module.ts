// The FX module (ADR-0180 §7; backend/CLAUDE.md: a new domain gets its own module).
//
// Rates reach the client *pushed*, on the trip snapshot, exactly as enrichment
// does and for the same reason (ADR-0166 §6): a global, server-owned read model
// that no client writes needs no route to be rendered.
//
// **One route joined it anyway**, and the amendment is worth the line: ADR-0180
// §4's refresh affordance has to await a fetch and answer with what it got, and
// no request already in flight can carry that. `FxController`'s header states
// what that does and does not cost — ADR-0004 forbids an integration a SCREEN,
// and enrichment's own `lookup` is the precedent for one owning a route.
//
// The provider is bound through a token rather than a class, so the second
// provider the coverage amendment leaves open (the ECB, for the majors it is
// authoritative on) is a change in this file and nowhere else.
import { Module } from '@nestjs/common';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { PlacesThrottlerGuard } from '../places/places-throttler.guard';
import { MembershipGuard } from '../trips/membership.guard';
import { FxController } from './fx.controller';
import { ExchangeRateApiProvider, FX_PROVIDER, type FxProvider } from './fx.provider';
import { FxService } from './fx.service';

@Module({
  controllers: [FxController],
  providers: [
    // The controller's two guards, declared the way every other consumer
    // declares them — `PlacesModule` names `MembershipGuard` from `trips/` in
    // exactly this shape. Importing the owning modules instead would be a cycle:
    // `TripsModule` already imports this one for the snapshot's rates.
    MembershipGuard,
    PlacesThrottlerGuard,
    // The outbound client is enrichment's, deliberately (rule 8): it is the
    // process's one allowlisted, timeboxed, size-capped seat, and a second
    // fetcher would be a second place to get SSRF wrong.
    EnrichmentFetcher,
    {
      provide: FX_PROVIDER,
      inject: [EnrichmentFetcher],
      useFactory: (fetcher: EnrichmentFetcher): FxProvider => new ExchangeRateApiProvider(fetcher),
    },
    FxService,
  ],
  exports: [FxService],
})
export class FxModule {}
