import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { DestinationsController } from './destinations.controller';
import { DestinationsService } from './destinations.service';
import { GooglePlacesClient } from './google-places.client';
import { PlacesController } from './places.controller';
import { PlacesThrottlerGuard } from './places-throttler.guard';
import { PlacesService } from './places.service';

@Module({
  imports: [SyncModule],
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
