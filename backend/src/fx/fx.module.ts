// The FX module (ADR-0180 §7; backend/CLAUDE.md: a new domain gets its own module).
//
// No controller. Rates reach the client on the trip snapshot, exactly as
// enrichment does and for the same reason (ADR-0166 §6): a global, server-owned
// read model that no client writes needs no route of its own, and giving it one
// would be an integration growing a surface — the thing ADR-0004 exists to stop.
//
// The provider is bound through a token rather than a class, so the second
// provider the coverage amendment leaves open (the ECB, for the majors it is
// authoritative on) is a change in this file and nowhere else.
import { Module } from '@nestjs/common';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { ExchangeRateApiProvider, FX_PROVIDER, type FxProvider } from './fx.provider';
import { FxService } from './fx.service';

@Module({
  providers: [
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
