// The weather module (ADR-0218 §6; backend/CLAUDE.md: a new domain gets its own module).
//
// **No controller, and that is the decision rather than an omission.** `FxController` exists for
// exactly one reason — ADR-0180 §4's manual-refresh affordance has to await a fetch and answer
// with what it got, and no request already in flight can carry that. A forecast's refresh is the
// day turning over, not a tap, so the snapshot read serves it and no endpoint is added. If a
// "refresh now" is ever wanted, `FxController`'s header is the precedent and its two guards are
// the shape.
//
// The provider is bound through a token rather than a class, so the swap ADR-0218's consequences
// leave open (Open-Meteo paid, or NWS as a US second source) is a change in this file and
// nowhere else.
import { Module } from '@nestjs/common';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { MetNoProvider, WEATHER_PROVIDER, type WeatherProvider } from './weather.provider';
import { WeatherService } from './weather.service';

@Module({
  providers: [
    // The outbound client is enrichment's, deliberately (rule 8): it is the process's one
    // allowlisted, timeboxed, size-capped seat, and `fx.module.ts` already states why a second
    // would be a second place to get SSRF wrong.
    EnrichmentFetcher,
    {
      provide: WEATHER_PROVIDER,
      inject: [EnrichmentFetcher],
      useFactory: (fetcher: EnrichmentFetcher): WeatherProvider => new MetNoProvider(fetcher),
    },
    WeatherService,
  ],
  exports: [WeatherService],
})
export class WeatherModule {}
