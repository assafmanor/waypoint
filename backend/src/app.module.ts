import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ZodSerializerInterceptor } from 'nestjs-zod';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { BookingsModule } from './bookings/bookings.module';
import { DocumentsModule } from './documents/documents.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { MaybeItemsModule } from './maybe-items/maybe-items.module';
import { PlacesModule } from './places/places.module';
import { PrismaModule } from './prisma/prisma.module';
import { SyncModule } from './sync/sync.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [
    // Repo-root .env per the CLAUDE.md quickstart; backend/.env wins when present.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    PrismaModule,
    AuthModule,
    TripsModule,
    SyncModule,
    EventsModule,
    BookingsModule,
    MaybeItemsModule,
    PlacesModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // ADR-0020: every route needs a Bearer access JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // ADR-0023: validates/strips responses against each route's @ZodSerializerDto schema.
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
