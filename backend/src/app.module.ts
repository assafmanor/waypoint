import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TripsModule } from './trips/trips.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TripsModule],
  controllers: [HealthController],
})
export class AppModule {}
