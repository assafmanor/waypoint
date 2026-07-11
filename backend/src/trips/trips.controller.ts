import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Trip, TripSnapshot } from '@waypoint/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import type { Principal } from '../auth/principal';
import { MembershipGuard } from './membership.guard';
import { TripDto, TripSnapshotDto } from './trips.dto';
import { TripsService } from './trips.service';

@ApiTags('trips')
@Controller('trips')
@UseGuards(DevAuthGuard)
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  @ApiOkResponse({ type: [TripDto] })
  list(@CurrentUser() user: Principal): Promise<Trip[]> {
    return this.trips.listForUser(user.userId);
  }

  @Get(':tripId/snapshot')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: TripSnapshotDto })
  snapshot(@Param('tripId') tripId: string): Promise<TripSnapshot> {
    return this.trips.getSnapshot(tripId);
  }
}
