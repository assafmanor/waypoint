import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DirectDispatcher, NOTIFICATION_DISPATCHER } from './notification-dispatcher';
import { NOTIFICATION_SENDER } from './notification-sender';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationSweepService } from './notification-sweep.service';
import { WebPushSender } from './web-push.sender';

/** The notifications epic's module (ADR-0197).
 *
 *  Phase 1 was the pipe (subscribe, unsubscribe, one dev-only send). Phase 3 adds the clock:
 *  the sweep, the ledger, quiet hours and the daily cap — with **no kinds registered**, so
 *  the scheduler starts no timer and nothing can reach anybody. Phase 4 registers the first
 *  kind and every line here stays as it is. */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationSweepService,
    NotificationSchedulerService,
    { provide: NOTIFICATION_SENDER, useClass: WebPushSender },
    { provide: NOTIFICATION_DISPATCHER, useClass: DirectDispatcher },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
