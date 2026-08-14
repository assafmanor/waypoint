import { Module } from '@nestjs/common';
import { MembershipGuard } from '../trips/membership.guard';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  controllers: [MapController],
  providers: [MapService, MembershipGuard],
  exports: [MapService],
})
export class MapModule {}
