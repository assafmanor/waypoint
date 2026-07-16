import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from '../trips/membership.guard';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [SyncModule],
  controllers: [PlacesController],
  providers: [PlacesService, MembershipGuard],
})
export class PlacesModule {}
