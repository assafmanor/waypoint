import { Module } from '@nestjs/common';
import { EnrichmentImagePipeline } from '../enrichment/image-pipeline';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController, AvatarController, MeController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, MeController, AvatarController],
  // The fetch-sniff-store pair the Google avatar copy runs through (ADR-0133 §13). Listed
  // here rather than importing `EnrichmentModule`: the same shape `routing/` already uses,
  // and it keeps auth free of a dependency on enrichment's providers, caches and schedule.
  providers: [AuthService, EnrichmentFetcher, EnrichmentImagePipeline],
})
export class AuthModule {}
