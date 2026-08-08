import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { DocumentAttachmentsController } from './document-attachments.controller';
import { DocumentAttachmentsService } from './document-attachments.service';

@Module({
  imports: [SyncModule],
  controllers: [DocumentAttachmentsController],
  providers: [DocumentAttachmentsService, MembershipGuard],
})
export class DocumentAttachmentsModule {}
