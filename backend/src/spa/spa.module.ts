import { Module } from '@nestjs/common';
import { SharingModule } from '../sharing/sharing.module';
import { TripsModule } from '../trips/trips.module';
import { OgImageService } from './og-image.service';
import { SpaShellController } from './spa-shell.controller';
import { SpaShellService } from './spa-shell.service';

/**
 * **The PWA shell, and the meta tags a link preview reads off it** (ADR-0220).
 *
 * Its own module rather than a route bolted onto `SharingModule`, because the homepage is
 * one of the three URLs it answers and the homepage is nobody's share. It imports the two
 * modules that can resolve a bearer code — `TripsModule` for an invite, `SharingModule` for
 * a live link — and owns nothing else.
 *
 * `OgImageService` renders the per-trip covers on `SharingModule`'s browser pool
 * (`RenderBrowserService`), which is why that module exports it: one Chromium and one
 * concurrency budget serve both the itinerary PDF and the covers (ADR-0220's 2026-09-06
 * amendment).
 *
 * `SpaShellService` is exported because `main.ts` hands it to `AllExceptionsFilter`: the
 * fallback that answers every OTHER app route (`/trips`, `/day/2026-09-11`, …) renders
 * through the same service, so there is exactly one place that knows how the shell is built.
 */
@Module({
  imports: [TripsModule, SharingModule],
  controllers: [SpaShellController],
  providers: [SpaShellService, OgImageService],
  exports: [SpaShellService],
})
export class SpaModule {}
