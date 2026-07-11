import { Module } from '@nestjs/common';
import { MembershipGuard } from '../trips/membership.guard';
import { ChangeService } from './change.service';
import { SyncController } from './sync.controller';
import { SyncGateway } from './sync.gateway';

@Module({
  controllers: [SyncController],
  providers: [ChangeService, SyncGateway, MembershipGuard],
  exports: [ChangeService, SyncGateway],
})
export class SyncModule {}
