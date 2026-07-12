import { Module } from '@nestjs/common';
import { MembershipGuard } from './membership.guard';
import { InvitesController, TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  controllers: [TripsController, InvitesController],
  providers: [TripsService, MembershipGuard],
})
export class TripsModule {}
