import { ApiProperty } from '@nestjs/swagger';
import type { Trip } from '@waypoint/shared';

// Swagger can't infer schemas from plain interfaces imported across packages,
// so this mirrors the @waypoint/shared shape for documentation only —
// `implements` keeps it from drifting silently out of sync.
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
