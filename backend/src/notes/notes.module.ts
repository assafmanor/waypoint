import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [SyncModule],
  controllers: [NotesController],
  providers: [NotesService, MembershipGuard],
})
export class NotesModule {}
