import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from './membership.guard';
import { InvitesController, TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [SyncModule], // ChangeService — trip/membership mutations are data-plane (ADR-0039)
  controllers: [TripsController, InvitesController],
  providers: [TripsService, MembershipGuard],
})
export class TripsModule {}
