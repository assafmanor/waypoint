import { Module } from '@nestjs/common';
import { KeyRotationService } from './key-rotation.service';

@Module({ providers: [KeyRotationService] })
export class KeyRotationModule {}
