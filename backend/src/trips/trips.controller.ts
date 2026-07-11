import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { Trip, TripSnapshot } from '@waypoint/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import type { Principal } from '../auth/principal';
import { MembershipGuard } from './membership.guard';
import { TripsService } from './trips.service';

@Controller('trips')
@UseGuards(DevAuthGuard)
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  list(@CurrentUser() user: Principal): Promise<Trip[]> {
    return this.trips.listForUser(user.userId);
  }

  @Get(':tripId/snapshot')
  @UseGuards(MembershipGuard)
  snapshot(@Param('tripId') tripId: string): Promise<TripSnapshot> {
    return this.trips.getSnapshot(tripId);
  }
}
