import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ZodSerializerInterceptor } from 'nestjs-zod';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { SyncModule } from './sync/sync.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TripsModule, SyncModule],
  controllers: [HealthController],
  providers: [
    // ADR-0023: validates/strips responses against each route's @ZodSerializerDto schema.
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
