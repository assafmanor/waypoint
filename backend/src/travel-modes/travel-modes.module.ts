import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { TravelModesController } from './travel-modes.controller';
import { TravelModesService } from './travel-modes.service';

@Module({
  imports: [SyncModule],
  controllers: [TravelModesController],
  providers: [TravelModesService, MembershipGuard],
  // Exported because the trip snapshot reads the overrides alongside everything else, rather
  // than the trips service reaching into `travelModeOverride` itself.
  exports: [TravelModesService],
})
export class TravelModesModule {}
