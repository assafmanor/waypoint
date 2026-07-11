import { ApiProperty } from '@nestjs/swagger';
import type {
  Booking,
  MaybeItem,
  Membership,
  Trip,
  TripEvent,
  TripNote,
  TripSnapshot,
} from '@waypoint/shared';

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

export class TripSnapshotDto implements TripSnapshot {
  @ApiProperty({ type: TripDto }) trip!: Trip;
  @ApiProperty({ type: [Object] }) members!: Membership[];
  @ApiProperty({ type: [Object] }) events!: TripEvent[];
  @ApiProperty({ type: [Object] }) bookings!: Booking[];
  @ApiProperty({ type: [Object] }) maybeItems!: MaybeItem[];
  @ApiProperty({ type: [Object] }) notes!: TripNote[];
  @ApiProperty() latestSeq!: string;
}
