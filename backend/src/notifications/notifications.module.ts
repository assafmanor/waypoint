import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_SENDER } from './notification-sender';
import { WebPushSender } from './web-push.sender';

/** The notifications epic's module (ADR-0197). Phase 1 is the pipe: subscribe, unsubscribe,
 *  and one dev-only send. The sweep that decides what to send and when is phase 3's and
 *  lands here beside them. */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: NOTIFICATION_SENDER, useClass: WebPushSender }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
