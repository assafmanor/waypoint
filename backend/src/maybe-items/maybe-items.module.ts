import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { MaybeItemsController } from './maybe-items.controller';
import { MaybeItemsService } from './maybe-items.service';

@Module({
  imports: [SyncModule],
  controllers: [MaybeItemsController],
  providers: [MaybeItemsService, MembershipGuard],
})
export class MaybeItemsModule {}
