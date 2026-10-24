import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module';
import { WeatherModule } from '../weather/weather.module';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { SyncModule } from '../sync/sync.module';
import { MembershipGuard } from './membership.guard';
import { InvitesController, TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [
    FxModule,
    WeatherModule,
    SyncModule, // ChangeService — trip/membership mutations are data-plane (ADR-0039)
    // The snapshot joins enrichment as a server-owned read model (ADR-0166 §6). Read-only:
    // nothing in this module writes to the store.
    EnrichmentModule,
  ],
  controllers: [TripsController, InvitesController],
  providers: [TripsService, MembershipGuard],
  // `SpaModule` resolves an invite code to the trip a link preview names (ADR-0220) through
  // `getInvitePreview` — the same public lookup the join screen calls, so the preview and
  // the screen it opens cannot disagree.
  exports: [TripsService],
})
export class TripsModule {}
