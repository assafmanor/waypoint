import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [SyncModule],
  controllers: [BookingsController],
  providers: [BookingsService, MembershipGuard],
})
export class BookingsModule {}
