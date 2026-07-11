import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  createTripSchema,
  type CreateTripInput,
  type Membership,
  type Trip,
  type TripSnapshot,
} from '@waypoint/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { DevAuthGuard } from '../auth/dev-auth.guard';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from './membership.guard';
import { InviteUrlDto, MembershipDto, TripDto, TripWithMembersDto } from './trips.dto';
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

  @Post()
  @ApiCreatedResponse({ type: TripDto })
  create(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(createTripSchema)) body: CreateTripInput,
  ): Promise<Trip> {
    return this.trips.createTrip(user.userId, body);
  }

  @Post('join/:token')
  @ApiCreatedResponse({ type: MembershipDto })
  join(@CurrentUser() user: Principal, @Param('token') token: string): Promise<Membership> {
    return this.trips.joinByToken(user.userId, token);
  }

  @Get(':tripId')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: TripWithMembersDto })
  getTrip(@Param('tripId') tripId: string): Promise<{ trip: Trip; members: Membership[] }> {
    return this.trips.getTripWithMembers(tripId);
  }

  // ponytail: snapshot response left undocumented in Swagger (generic object) —
  // see T-037 for unifying entity types onto zod so nested shapes generate for real.
  @Get(':tripId/snapshot')
  @UseGuards(MembershipGuard)
  snapshot(@Param('tripId') tripId: string): Promise<TripSnapshot> {
    return this.trips.getSnapshot(tripId);
  }

  @Post(':tripId/invite')
  @UseGuards(MembershipGuard)
  @ApiCreatedResponse({ type: InviteUrlDto })
  invite(@Param('tripId') tripId: string): { inviteUrl: string } {
    return { inviteUrl: `/trips/join/${this.trips.createInviteToken(tripId)}` };
  }

  @Delete(':tripId/members/:userId')
  @UseGuards(MembershipGuard)
  @HttpCode(204)
  @ApiNoContentResponse()
  removeMember(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.trips.removeMember(tripId, user.userId, userId);
  }
}
