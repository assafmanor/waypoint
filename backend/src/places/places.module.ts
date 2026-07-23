import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { GooglePlacesClient } from './google-places.client';
import { PlacesController } from './places.controller';
import { PlacesThrottlerGuard } from './places-throttler.guard';
import { PlacesService } from './places.service';

@Module({
  imports: [SyncModule],
  controllers: [PlacesController],
  providers: [PlacesService, GooglePlacesClient, MembershipGuard, PlacesThrottlerGuard],
})
export class PlacesModule {}
