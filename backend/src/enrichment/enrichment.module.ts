// The enrichment module (ADR-0166 §5: a new domain gets its own module).
//
// No controller, deliberately. Phase 1 of the build plan is **invisible**: nothing renders
// enrichment yet and nothing triggers it — `resolvePlace` is untouched and stays exactly as
// fast and as failable as it is today (§6). Delivery to the client is Phase 3's (the snapshot
// join plus one `WS_MESSAGE_TYPE` member), and the surfaces that read it are Phases 4–6.
//
// The registry is assembled here rather than by decorator scanning, because the **order**
// providers are registered in is the order identity accumulates in a pass: Wikidata settles
// the QID and the sitelinks that Wikipedia then reads (§12.3's exact-first match order). A
// provider whose dependencies are not yet registered would silently fall back to a fuzzier
// match instead of failing, which is the kind of bug that looks like bad coverage.
import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { EnrichmentImageController } from './enrichment.controller';
import { EnrichmentRegistry } from './enrichment.registry';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentImagePipeline } from './image-pipeline';
import { EnrichmentFetcher } from './outbound-fetch';
import { CommonsProvider } from './providers/commons.provider';
import { WikidataProvider } from './providers/wikidata.provider';
import { WikipediaProvider } from './providers/wikipedia.provider';

@Module({
  // SyncGateway only — to NUDGE a live client that enrichment landed (ADR-0166 §6). Pointedly
  // **not** `ChangeService`: a global row with no `tripId` has nothing to write a `Change`
  // against, which is the whole argument in §6.
  imports: [SyncModule],
  controllers: [EnrichmentImageController],
  providers: [
    EnrichmentFetcher,
    EnrichmentImagePipeline,
    WikidataProvider,
    WikipediaProvider,
    CommonsProvider,
    {
      provide: EnrichmentRegistry,
      inject: [WikidataProvider, WikipediaProvider, CommonsProvider],
      useFactory: (
        wikidata: WikidataProvider,
        wikipedia: WikipediaProvider,
        commons: CommonsProvider,
      ) =>
        // Wikidata first: it is the identity spine, and both the others match on what it
        // settles — Wikipedia on the sitelinks, Commons on the `P18` filename.
        new EnrichmentRegistry([wikidata, wikipedia, commons]),
    },
    EnrichmentService,
  ],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
