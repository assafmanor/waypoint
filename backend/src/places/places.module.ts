import { Module } from '@nestjs/common';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { DestinationsController } from './destinations.controller';
import { DestinationsService } from './destinations.service';
import { GooglePlacesClient } from './google-places.client';
import { PlacesController } from './places.controller';
import { PlacesThrottlerGuard } from './places-throttler.guard';
import { PlacesService } from './places.service';

@Module({
  // EnrichmentModule for the scheduler only: a pick schedules a pass and never waits on it
  // (ADR-0166 §14). Nothing here reads the store.
  imports: [SyncModule, EnrichmentModule],
  controllers: [PlacesController, DestinationsController],
  providers: [
    PlacesService,
    DestinationsService,
    GooglePlacesClient,
    MembershipGuard,
    PlacesThrottlerGuard,
  ],
})
export class PlacesModule {}
