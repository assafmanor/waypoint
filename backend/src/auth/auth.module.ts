import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController, AvatarController, MeController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController, MeController, AvatarController],
  providers: [AuthService],
})
export class AuthModule {}
