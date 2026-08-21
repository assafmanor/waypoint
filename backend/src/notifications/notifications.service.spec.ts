import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { NOTIFICATION_KIND, type PushPayload } from '@waypoint/shared';
import type { PrismaService } from '../prisma/prisma.service';
import {
  SEND_OUTCOME,
  type NotificationSender,
  type SendOutcome,
  type SubscriptionTarget,
} from './notification-sender';
import { NotificationsService } from './notifications.service';

// **A fake Prisma rather than the seeded Postgres, and deliberately.** Every other service
// spec here is an integration test, which is right for a service whose subject is a
// transaction with a `Change` row in it. This one's subject is a DECISION SEQUENCE — which
// outcome prunes a row, which one only marks it, which one counts — and the service touches
// exactly five Prisma methods, so a fake covers it completely and can assert the order the
// calls arrived in, which a real database cannot.
//
// `backend/CLAUDE.md`'s own advice: count the methods before declaring glue untestable.

interface Row {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
  lastSentAt: Date | null;
  lastFailedAt: Date | null;
}

/** The five call shapes the service actually uses — narrow on purpose, so adding a sixth
 *  Prisma call to the service means widening this rather than passing unnoticed. */
type Where = Partial<Row>;
type Data = Partial<Pick<Row, 'lastSentAt' | 'lastFailedAt'>>;

function fakePrisma(rows: Row[]) {
  const calls: string[] = [];
  const table = {
    upsert: ({ where, create, update }: { where: Where; create: Row; update: Partial<Row> }) => {
      calls.push('upsert');
      const existing = rows.find((row) => row.endpoint === where.endpoint);
      if (existing) Object.assign(existing, update);
      else rows.push({ ...blankRow(), ...create });
      return Promise.resolve(existing ?? rows[rows.length - 1]);
    },
    deleteMany: ({ where }: { where: Where }) => {
      calls.push('deleteMany');
      const kept = rows.filter((row) => !matches(row, where));
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return Promise.resolve({ count });
    },
    findMany: ({ where }: { where: Where }) => {
      calls.push('findMany');
      return Promise.resolve(rows.filter((row) => matches(row, where)));
    },
    delete: ({ where }: { where: Where }) => {
      calls.push(`delete:${where.id}`);
      const index = rows.findIndex((row) => row.id === where.id);
      if (index < 0) return Promise.reject(new Error('not found'));
      rows.splice(index, 1);
      return Promise.resolve({});
    },
    update: ({ where, data }: { where: Where; data: Data }) => {
      calls.push(`update:${where.id}:${Object.keys(data).join(',')}`);
      const row = rows.find((item) => item.id === where.id);
      if (!row) return Promise.reject(new Error('not found'));
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  };
  return { prisma: { pushSubscription: table } as unknown as PrismaService, calls };
}

/**
 * A `where` clause the way Prisma reads one: **only the keys that are present constrain
 * anything.** Written out because the first version of this fake compared each field
 * directly, which made it STRICTER than the database — dropping `userId` from the query
 * left `row.userId === undefined`, so nothing matched, so the row survived and the spec
 * asserting that one user cannot unsubscribe another's device passed against a query that
 * would delete it. Mutation-testing found that, and the lesson generalises: **a fake that
 * is more restrictive than the real store turns a security assertion into theatre.**
 */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => row[key as keyof Row] === value);
}

const blankRow = (): Row => ({
  id: 'generated',
  userId: '',
  endpoint: '',
  p256dh: '',
  auth: '',
  userAgent: null,
  createdAt: new Date('2026-08-21T00:00:00Z'),
  lastSentAt: null,
  lastFailedAt: null,
});

const row = (over: Partial<Row>): Row => ({ ...blankRow(), ...over });

/** The transport, recorded. This is the fake ADR-0197 §3.1 says the seam exists for. */
class RecordingSender implements NotificationSender {
  readonly sent: SubscriptionTarget[] = [];
  constructor(private readonly outcomes: SendOutcome[]) {}
  send(target: SubscriptionTarget): Promise<SendOutcome> {
    this.sent.push(target);
    return Promise.resolve(this.outcomes[this.sent.length - 1] ?? SEND_OUTCOME.SENT);
  }
}

const PAYLOAD: PushPayload = {
  kind: NOTIFICATION_KIND.TEST,
  title: 't',
  body: 'b',
  url: '/',
};

describe('NotificationsService', () => {
  let rows: Row[];
  beforeEach(() => {
    rows = [];
  });

  describe('subscribe', () => {
    it('claims an endpoint that another user had registered', async () => {
      // The handed-over-device case arriving through the front door (ADR-0197 §2.3): the
      // same browser, a different person signed in. Create-and-ignore-conflict would leave
      // the previous user owning the endpoint and still being notified on it.
      rows.push(row({ id: 'r1', userId: 'old-user', endpoint: 'https://push/x' }));
      const { prisma } = fakePrisma(rows);
      const service = new NotificationsService(prisma, new RecordingSender([]));

      await service.subscribe('new-user', {
        endpoint: 'https://push/x',
        p256dh: 'k2',
        auth: 'a2',
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe('new-user');
      expect(rows[0].p256dh).toBe('k2');
    });

    it('clears a previous failure, because a re-subscribe is the cure for it', async () => {
      rows.push(
        row({
          id: 'r1',
          userId: 'u1',
          endpoint: 'https://push/x',
          lastFailedAt: new Date('2026-08-01T00:00:00Z'),
        }),
      );
      const { prisma } = fakePrisma(rows);
      const service = new NotificationsService(prisma, new RecordingSender([]));

      await service.subscribe('u1', { endpoint: 'https://push/x', p256dh: 'k', auth: 'a' });

      expect(rows[0].lastFailedAt).toBeNull();
    });
  });

  describe('unsubscribe', () => {
    it('cannot delete a row belonging to somebody else', async () => {
      // An endpoint is a bearer capability, so a request carrying one it does not own must
      // not be able to unsubscribe that device. The pair in the `where` is what enforces it.
      rows.push(row({ id: 'r1', userId: 'victim', endpoint: 'https://push/x' }));
      const { prisma } = fakePrisma(rows);
      const service = new NotificationsService(prisma, new RecordingSender([]));

      await service.unsubscribe('attacker', 'https://push/x');

      expect(rows).toHaveLength(1);
    });

    it('treats an unknown endpoint as success — the desired state already holds', async () => {
      const { prisma } = fakePrisma(rows);
      const service = new NotificationsService(prisma, new RecordingSender([]));
      await expect(service.unsubscribe('u1', 'https://push/gone')).resolves.toBeUndefined();
    });
  });

  describe('sendToUser', () => {
    it('sends to every device the user has, and counts only what was sent', async () => {
      rows.push(
        row({ id: 'r1', userId: 'u1', endpoint: 'https://push/1', p256dh: 'k1', auth: 'a1' }),
        row({ id: 'r2', userId: 'u1', endpoint: 'https://push/2', p256dh: 'k2', auth: 'a2' }),
        row({ id: 'r3', userId: 'other', endpoint: 'https://push/3' }),
      );
      const { prisma } = fakePrisma(rows);
      const sender = new RecordingSender([SEND_OUTCOME.SENT, SEND_OUTCOME.FAILED]);
      const service = new NotificationsService(prisma, sender);

      const report = await service.sendToUser('u1', PAYLOAD);

      expect(sender.sent.map((target) => target.endpoint)).toEqual([
        'https://push/1',
        'https://push/2',
      ]);
      expect(report).toEqual({ attempted: 2, sent: 1 });
    });

    it('hands the sender only the three fields it needs', async () => {
      // So a sender — or a log inside one — cannot reach the rest of the row.
      rows.push(
        row({ id: 'r1', userId: 'u1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a' }),
      );
      const { prisma } = fakePrisma(rows);
      const sender = new RecordingSender([SEND_OUTCOME.SENT]);
      await new NotificationsService(prisma, sender).sendToUser('u1', PAYLOAD);

      expect(Object.keys(sender.sent[0]).sort()).toEqual(['auth', 'endpoint', 'p256dh']);
    });

    it('PRUNES a device the push service reports as gone', async () => {
      // ADR-0197 §10: a 404/410 is a subscription's normal death, so the row is wrong the
      // moment we learn it — deleted, not marked.
      rows.push(
        row({ id: 'r1', userId: 'u1', endpoint: 'https://push/1' }),
        row({ id: 'r2', userId: 'u1', endpoint: 'https://push/2' }),
      );
      const { prisma, calls } = fakePrisma(rows);
      const sender = new RecordingSender([SEND_OUTCOME.GONE, SEND_OUTCOME.SENT]);
      const service = new NotificationsService(prisma, sender);

      const report = await service.sendToUser('u1', PAYLOAD);

      expect(rows.map((item) => item.id)).toEqual(['r2']);
      expect(calls).toContain('delete:r1');
      expect(report).toEqual({ attempted: 2, sent: 1 });
    });

    it('marks a failure without pruning, so a flaky device keeps its registration', async () => {
      rows.push(row({ id: 'r1', userId: 'u1', endpoint: 'https://push/1' }));
      const { prisma, calls } = fakePrisma(rows);
      const service = new NotificationsService(prisma, new RecordingSender([SEND_OUTCOME.FAILED]));

      await service.sendToUser('u1', PAYLOAD);

      expect(rows).toHaveLength(1);
      expect(rows[0].lastFailedAt).toBeInstanceOf(Date);
      expect(calls).toContain('update:r1:lastFailedAt');
    });

    it('does not let a lost diagnostic row fail the send it is describing', async () => {
      // The row can be deleted by another request between the read and the touch. A send
      // that already succeeded must not be reported as a failure because of it.
      rows.push(row({ id: 'r1', userId: 'u1', endpoint: 'https://push/1' }));
      const { prisma } = fakePrisma(rows);
      const service = new NotificationsService(prisma, {
        send: async (target) => {
          // Simulate the race: the row is gone by the time the outcome comes back.
          rows.splice(0, rows.length);
          expect(target.endpoint).toBe('https://push/1');
          return SEND_OUTCOME.SENT;
        },
      });

      await expect(service.sendToUser('u1', PAYLOAD)).resolves.toEqual({
        attempted: 1,
        sent: 1,
      });
    });

    it('reports nothing attempted for a user with no devices', async () => {
      const { prisma } = fakePrisma(rows);
      const sender = new RecordingSender([]);
      const report = await new NotificationsService(prisma, sender).sendToUser('u1', PAYLOAD);
      expect(report).toEqual({ attempted: 0, sent: 0 });
      expect(sender.sent).toHaveLength(0);
    });
  });

  it('sendTest carries a payload the worker can read', async () => {
    rows.push(row({ id: 'r1', userId: 'u1', endpoint: 'https://push/1' }));
    const { prisma } = fakePrisma(rows);
    let seen: PushPayload | undefined;
    const service = new NotificationsService(prisma, {
      send: (_target, payload) => {
        seen = payload;
        return Promise.resolve(SEND_OUTCOME.SENT);
      },
    });

    await service.sendTest('u1');

    expect(seen?.kind).toBe(NOTIFICATION_KIND.TEST);
    // The url must be one `parsePushPayload` accepts, or the notification would draw the
    // worker's fallback instead of itself — which is a passing test and a broken feature.
    expect(seen?.url.startsWith('/')).toBe(true);
  });
});
