import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [SyncModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, MembershipGuard],
})
export class DocumentsModule {}
