// The subscription store (ADR-0197 §2), and the one send phase 1 can make.
//
// Deliberately **not** through `ChangeService`: this is control plane, and the three
// reasons `PlaceEnrichment` sits outside the change log transfer exactly (ADR-0166 §6) —
// there is no trip to write a change against, there is one writer, and a subscription is
// not something anyone would undo. `backend/CLAUDE.md`'s hard boundary is about data-plane
// mutations; nothing here is one.
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_KIND,
  type CreatePushSubscriptionInput,
  type PushDevice,
  type PushPayload,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { deviceLabel } from './device-label';
import {
  NOTIFICATION_SENDER,
  SEND_OUTCOME,
  type NotificationSender,
  type SubscriptionTarget,
} from './notification-sender';

/** What a caller learns about one device's send. `gone` is not surfaced separately: by the
 *  time the caller sees this the row is already deleted, so the honest report is that the
 *  device was not reached. */
export interface SendReport {
  attempted: number;
  sent: number;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SENDER) private readonly sender: NotificationSender,
  ) {}

  /**
   * Register (or refresh) this device.
   *
   * **An upsert on `endpoint`, and the update half is what matters.** A browser may hand
   * back the same endpoint with rotated keys, and it may hand the same endpoint to a
   * *different* signed-in user on a shared device — so `userId` is on the update too. The
   * alternative, create-and-ignore-conflict, leaves the previous user's row owning that
   * endpoint, which is ADR-0197 §2.3's handed-over-phone case arriving through the front
   * door instead.
   *
   * `lastFailedAt` is cleared: a re-subscribe is the cure for whatever the failure was.
   */
  async subscribe(userId: string, input: CreatePushSubscriptionInput): Promise<{ id: string }> {
    const { endpoint, p256dh, auth, userAgent } = input;
    // **The id comes back**, and that is what lets the device list mark "this device"
    // without the endpoint ever appearing in a list response: the client stores this and
    // compares ids. An endpoint is a bearer capability; an id is not.
    const row = await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, userAgent },
      update: { userId, p256dh, auth, userAgent, lastFailedAt: null },
      select: { id: true },
    });
    return row;
  }

  /**
   * Drop this device.
   *
   * **Scoped to the caller's own rows.** An endpoint is a bearer capability, so a request
   * carrying one it does not own must not be able to unsubscribe somebody else's device —
   * and `deleteMany` with the pair is what makes that true without a read-then-check race.
   * A no-match is a success: the desired state is "this endpoint is not registered to me",
   * and it already holds.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** This user's devices, newest first. The internal read — rows with their endpoints, for
   *  sending. `listDevices` is the one a client sees. */
  listForUser(userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The device list a settings surface renders (phase 1b).
   *
   * **Neither the endpoint nor the raw user-agent leaves the server.** The first is a bearer
   * capability and the second is 120 characters of noise the screen does not want — so the
   * `select` here is the security boundary, not a convenience: a field added to the model is
   * not added to this response by accident.
   */
  async listDevices(userId: string): Promise<PushDevice[]> {
    const rows = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userAgent: true, lastSentAt: true, createdAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      label: deviceLabel(row.userAgent),
      lastSentAt: row.lastSentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Drop one device **by its id** — how a person revokes a phone they no longer have.
   *
   * Scoped to the caller's own rows by the same `deleteMany` pair `unsubscribe` uses, and
   * for the same reason: an id the caller does not own must not delete anything, and the
   * pair makes that true without a read-then-check race. A no-match is a success.
   */
  async removeDevice(userId: string, id: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, id } });
  }

  /**
   * Send one payload to every device this user has.
   *
   * The only send in phase 1, and its only caller is the dev-only test route. The sweep
   * that will decide *what* to send and *when* is ADR-0197 §3's, and it is not written
   * yet — so this is deliberately the dumb half: no ledger, no dedup, no quiet hours. A
   * test send is meant to arrive every time it is asked for.
   *
   * **A `gone` device is deleted here rather than reported up** (§10): that is a
   * subscription's normal death, and the row is wrong the moment we learn it.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<SendReport> {
    const subscriptions = await this.listForUser(userId);
    let sent = 0;
    for (const subscription of subscriptions) {
      const target: SubscriptionTarget = {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      };
      const outcome = await this.sender.send(target, payload);
      if (outcome === SEND_OUTCOME.SENT) {
        sent += 1;
        await this.touch(subscription.id, { lastSentAt: new Date() });
      } else if (outcome === SEND_OUTCOME.GONE) {
        await this.prisma.pushSubscription
          .delete({ where: { id: subscription.id } })
          .catch(() => {});
        this.log.log('pruned a subscription the push service reports as gone');
      } else {
        await this.touch(subscription.id, { lastFailedAt: new Date() });
      }
    }
    return { attempted: subscriptions.length, sent };
  }

  /** The dev-only proof that the pipe works end to end (ADR-0197 §7's test send). Its copy
   *  is Latin and deliberately not in `i18n/he.ts`: this is an instrument, not product UI,
   *  so it spends no copy budget — the same call `BuildBadge` makes on the client. */
  sendTest(userId: string): Promise<SendReport> {
    return this.sendToUser(userId, {
      kind: NOTIFICATION_KIND.TEST,
      title: 'Travelive test',
      body: 'The push pipe works on this device.',
      url: '/',
    });
  }

  /** A diagnostic write that must never fail a send: the row it touches may have been
   *  deleted by another request between the read and here. */
  private async touch(id: string, data: { lastSentAt?: Date; lastFailedAt?: Date }): Promise<void> {
    await this.prisma.pushSubscription.update({ where: { id }, data }).catch(() => {});
  }
}
