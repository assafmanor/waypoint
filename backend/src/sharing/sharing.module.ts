import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { MembershipGuard } from '../trips/membership.guard';
import { ItineraryNarrativeService } from './itinerary-narrative.service';
import {
  DisabledItineraryNarrativeGenerator,
  ITINERARY_NARRATIVE_GENERATOR,
} from './itinerary-narrative.generator';
import { PdfBrowserService } from './pdf-browser.service';
import { PublicSharingController } from './public-sharing.controller';
import { RenderBrowserService } from './render-browser.service';
import { SharingProjectionService } from './sharing-projection.service';
import { SharingService } from './sharing.service';
import { TripSharingController } from './trip-sharing.controller';

@Module({
  // `DocumentsModule` for `getContent` — the at-rest decryption path, reused rather than
  // reimplemented behind the public download route. `EnrichmentModule` for
  // `readForPlaces`, which is how the projection reaches rung 2 of the place-label chain
  // (the city an airport serves) and the caption and photo a stop already carries. **Read
  // only**: the public route never triggers a pass, so its `stale` list is ignored — an
  // unauthenticated reader must not be able to make us fetch.
  imports: [DocumentsModule, EnrichmentModule],
  controllers: [TripSharingController, PublicSharingController],
  providers: [
    SharingService,
    SharingProjectionService,
    ItineraryNarrativeService,
    PdfBrowserService,
    RenderBrowserService,
    // The port ADR-0213 §2 specified, bound to the implementation that ships: no external
    // model, no network call, deterministic narrative everywhere. Swapping this one line is
    // the entire integration surface a future provider needs.
    { provide: ITINERARY_NARRATIVE_GENERATOR, useClass: DisabledItineraryNarrativeGenerator },
    MembershipGuard,
  ],
  // `SpaModule` needs `previewByCode` for `/s/<code>`'s meta tags, and `RenderBrowserService`
  // to draw that link's per-trip cover on the same Chromium the PDF uses (ADR-0220).
  exports: [SharingService, RenderBrowserService],
})
export class SharingModule {}
