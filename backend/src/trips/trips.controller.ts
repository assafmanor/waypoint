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
import { Throttle } from '@nestjs/throttler';
import {
  createTripSchema,
  invitePreviewSchema,
  inviteUrlSchema,
  joinTripSchema,
  membershipSchema,
  removedMemberSchema,
  tripSchema,
  tripSnapshotSchema,
  tripWithMembersSchema,
  updateMembershipPrefsSchema,
  updateMembershipRoleSchema,
  updateTripSchema,
  type InvitePreview,
  type Membership,
  type RemovedMember,
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
class UpdateTripDto extends createZodDto(updateTripSchema) {}
class UpdateMembershipRoleDto extends createZodDto(updateMembershipRoleSchema) {}
class RemovedMemberDto extends createZodDto(removedMemberSchema) {}

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

  @Post('join/:code')
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // code-guessing / join abuse (B-10)
  @ApiCreatedResponse({ type: MembershipDto })
  @ZodSerializerDto(MembershipDto)
  join(
    @CurrentUser() user: Principal,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(joinTripSchema)) body: JoinTripDto,
  ): Promise<Membership> {
    return this.trips.joinByCode(user.userId, code, body);
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

  // Declared after `members/me` so the literal route wins over this `:userId` param.
  @Patch(':tripId/members/:userId')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: MembershipDto })
  @ZodSerializerDto(MembershipDto)
  setMemberRole(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMembershipRoleSchema)) body: UpdateMembershipRoleDto,
  ): Promise<Membership> {
    return this.trips.setMemberRole(tripId, user.userId, userId, body);
  }

  @Get(':tripId')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: TripWithMembersDto })
  @ZodSerializerDto(TripWithMembersDto)
  getTrip(@Param('tripId') tripId: string): Promise<{ trip: Trip; members: Membership[] }> {
    return this.trips.getTripWithMembers(tripId);
  }

  @Patch(':tripId')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: TripDto })
  @ZodSerializerDto(TripDto)
  updateTrip(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Body(new ZodValidationPipe(updateTripSchema)) body: UpdateTripDto,
  ): Promise<Trip> {
    return this.trips.updateTrip(tripId, user.userId, body);
  }

  @Delete(':tripId')
  @UseGuards(MembershipGuard)
  @HttpCode(204)
  @ApiNoContentResponse()
  deleteTrip(@CurrentUser() user: Principal, @Param('tripId') tripId: string): Promise<void> {
    return this.trips.deleteTrip(tripId, user.userId);
  }

  @Get(':tripId/snapshot')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: TripSnapshotDto })
  @ZodSerializerDto(TripSnapshotDto)
  snapshot(@Param('tripId') tripId: string): Promise<TripSnapshot> {
    return this.trips.getSnapshot(tripId);
  }

  // Get-or-create the trip's one stable invite link (ADR-0067) — the same code
  // every call, so trip-settings shows a single link instead of churning new ones.
  @Post(':tripId/invite')
  @UseGuards(MembershipGuard)
  @ApiCreatedResponse({ type: InviteUrlDto })
  @ZodSerializerDto(InviteUrlDto)
  async invite(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
  ): Promise<{ inviteUrl: string }> {
    const code = await this.trips.getOrCreateInvite(tripId, user.userId);
    return { inviteUrl: `/join/${code}` };
  }

  // Revoke + replace the link (admin-only, ADR-0067): the previously shared code
  // stops resolving at once.
  @Post(':tripId/invite/rotate')
  @UseGuards(MembershipGuard)
  @ApiCreatedResponse({ type: InviteUrlDto })
  @ZodSerializerDto(InviteUrlDto)
  async rotateInvite(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
  ): Promise<{ inviteUrl: string }> {
    const code = await this.trips.rotateInvite(tripId, user.userId);
    return { inviteUrl: `/join/${code}` };
  }

  // The "Removed" section: members an admin kicked, so they can be allowed back (ADR-0067).
  @Get(':tripId/blocks')
  @UseGuards(MembershipGuard)
  @ApiOkResponse({ type: [RemovedMemberDto] })
  @ZodSerializerDto([RemovedMemberDto])
  listBlocked(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
  ): Promise<RemovedMember[]> {
    return this.trips.listBlocked(tripId, user.userId);
  }

  // Allow a removed member back in (admin re-invite, ADR-0067): clear their block.
  @Delete(':tripId/blocks/:userId')
  @UseGuards(MembershipGuard)
  @HttpCode(204)
  @ApiNoContentResponse()
  unblock(
    @CurrentUser() user: Principal,
    @Param('tripId') tripId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.trips.unblockMember(tripId, user.userId, userId);
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

  @Get(':code')
  // Public short-code lookup otherwise hammerable for code-guessing (B-10) — tight per-IP cap.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({ type: InvitePreviewDto })
  @ZodSerializerDto(InvitePreviewDto)
  preview(@Param('code') code: string): Promise<InvitePreview> {
    return this.trips.getInvitePreview(code);
  }
}
