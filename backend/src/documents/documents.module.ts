import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [SyncModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, MembershipGuard],
  // ADR-0213's public download route reuses `getContent` rather than owning a second copy
  // of the at-rest decryption path.
  exports: [DocumentsService],
})
export class DocumentsModule {}
