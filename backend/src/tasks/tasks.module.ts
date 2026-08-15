import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [SyncModule],
  controllers: [TasksController],
  providers: [TasksService, MembershipGuard],
})
export class TasksModule {}
