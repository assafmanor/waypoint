import { ApiProperty } from '@nestjs/swagger';
import { MEMBERSHIP_ROLE, type Membership, type Trip } from '@waypoint/shared';

// Swagger can't infer schemas from plain interfaces imported across packages,
// so these mirror the @waypoint/shared shapes for documentation only —
// `implements` keeps them from drifting silently out of sync.
export class TripDto implements Trip {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() destination!: string;
  @ApiProperty() startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ required: false }) currency?: string;
  @ApiProperty({ required: false }) dailyBudgetMinor?: number;
  @ApiProperty() createdBy!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() updatedBy!: string;
}

export class MembershipDto implements Membership {
  @ApiProperty() id!: string;
  @ApiProperty() tripId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: Object.values(MEMBERSHIP_ROLE) }) role!: Membership['role'];
  @ApiProperty() calendarSyncEnabled!: boolean;
  @ApiProperty() joinedAt!: string;
}

/** `GET /trips/:tripId` — not a @waypoint/shared type, just this route's ad-hoc response shape. */
export class TripWithMembersDto {
  @ApiProperty({ type: TripDto }) trip!: Trip;
  @ApiProperty({ type: [MembershipDto] }) members!: Membership[];
}

export class InviteUrlDto {
  @ApiProperty() inviteUrl!: string;
}
