import { Module } from '@nestjs/common';
import { MembershipGuard } from './membership.guard';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  controllers: [TripsController],
  providers: [TripsService, MembershipGuard],
})
export class TripsModule {}
