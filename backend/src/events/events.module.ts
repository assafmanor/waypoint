import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [SyncModule],
  controllers: [EventsController],
  providers: [EventsService, MembershipGuard],
})
export class EventsModule {}
