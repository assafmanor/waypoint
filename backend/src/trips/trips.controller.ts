import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  createTripSchema,
  invitePreviewSchema,
  inviteUrlSchema,
  joinTripSchema,
  membershipSchema,
  tripSchema,
  tripSnapshotSchema,
  tripWithMembersSchema,
  updateMembershipPrefsSchema,
  type InvitePreview,
  type Membership,
  type Trip,
  type TripSnapshot,
} from '@waypoint/shared';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { Principal } from '../auth/principal';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembershipGuard } from './membership.guard';
import { TripsService } from './trips.service';

// ADR-0023: OpenAPI DTOs generated from the @waypoint/shared zod schemas — no
// hand-written field lists to keep in sync (see the deleted trips.dto.ts).
class CreateTripDto extends createZodDto(createTripSchema) {}
class TripDto extends createZodDto(tripSchema) {}
class MembershipDto extends createZodDto(membershipSchema) {}
class TripWithMembersDto extends createZodDto(tripWithMembersSchema) {}
class TripSnapshotDto extends createZodDto(tripSnapshotSchema) {}
class InviteUrlDto extends createZodDto(inviteUrlSchema) {}
class InvitePreviewDto extends createZodDto(invitePreviewSchema) {}
class JoinTripDto extends createZodDto(joinTripSchema) {}
class UpdateMembershipPrefsDto extends createZodDto(updateMembershipPrefsSchema) {}

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  @ApiOkResponse({ type: [TripDto] })
  @ZodSerializerDto([TripDto])
  list(@CurrentUser() user: Principal): Promise<Trip[]> {
    return this.trips.listForUser(user.userId);
  }

  @Post()
  @ApiCreatedResponse({ type: TripDto })
  @ZodSerializerDto(TripDto)
  create(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(createTripSchema)) body: CreateTripDto,
  ): Promise<Trip> {
    return this.trips.createTrip(user.userId, body);
  }

  @Post('join/:token')
  @ApiCreatedResponse({ type: MembershipDto })
  @ZodSerializerDto(MembershipDto)
  join(
    @CurrentUser() user: Principal,
    @Param('token') token: string,
    @Body(new ZodValidationPipe(joinTripSchema)) body: JoinTripDto,
  ): Promise<Membership> {
    return this.trips.joinByToken(user.userId, token, body);
  }

  @Patch(':tripId/members/me')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: MembershipDto })
  @ZodSerializerDto(MembershipDto)
  updateMyMembership(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(updateMembershipPrefsSchema)) body: UpdateMembershipPrefsDto,
  ): Promise<Membership> {
    return this.trips.updateMembershipPrefs(tripId, user.userId, body);
  }

  @Get(':tripId')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: TripWithMembersDto })
  @ZodSerializerDto(TripWithMembersDto)
  getTrip(@Param('tripId') tripId: string): Promise<{ trip: Trip; members: Membership[] }> {
    return this.trips.getTripWithMembers(tripId);
  }

  @Get(':tripId/snapshot')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: TripSnapshotDto })
  @ZodSerializerDto(TripSnapshotDto)
  snapshot(@Param('tripId') tripId: string): Promise<TripSnapshot> {
    return this.trips.getSnapshot(tripId);
  }

  @Post(':tripId/invite')
  @UseGuards(MembershipGuard)
  @ApiCreatedResponse({ type: InviteUrlDto })
  @ZodSerializerDto(InviteUrlDto)
  invite(@Param('tripId') tripId: string): { inviteUrl: string } {
    return { inviteUrl: `/join/${this.trips.createInviteToken(tripId)}` };
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

// Public/unguarded (ADR-0024) — the join screen needs this before sign-in.
@ApiTags('invites')
@Controller('invites')
@Public()
export class InvitesController {
  constructor(private readonly trips: TripsService) {}

  @Get(':token')
  @ApiOkResponse({ type: InvitePreviewDto })
  @ZodSerializerDto(InvitePreviewDto)
  preview(@Param('token') token: string): Promise<InvitePreview> {
    return this.trips.getInvitePreview(token);
  }
}
