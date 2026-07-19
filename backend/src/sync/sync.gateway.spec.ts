import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { hashRefreshToken } from '../auth/token.util';
import { SyncGateway } from './sync.gateway';

// Live-WS integration test (backend-review B-02). Authenticates the upgrade with a
// real session cookie (not DEV_AUTH, which isn't set in CI) for the seeded dev user
// u-assaf, a member of the seeded trip — exercising the real upgrade + eviction path.
const SEEDED_TRIP = 'trip-japan-26';
const DEV_USER = 'u-assaf';
const REFRESH_TOKEN = 'b02-test-refresh-token';

describe('SyncGateway.disconnectUser (B-02)', () => {
  const prisma = new PrismaService();
  const gateway = new SyncGateway(prisma);
  let server: Server;
  let port: number;

  beforeAll(async () => {
    await prisma.session.create({
      data: {
        userId: DEV_USER,
        refreshTokenHash: hashRefreshToken(REFRESH_TOKEN),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    server = createServer();
    gateway.attach(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.session.deleteMany({
      where: { refreshTokenHash: hashRefreshToken(REFRESH_TOKEN) },
    });
    await prisma.$disconnect();
  });

  function connect(): Promise<WebSocket> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/trips/${SEEDED_TRIP}/stream`, {
      headers: { Cookie: `wp_refresh=${REFRESH_TOKEN}` },
    });
    // Resolve once the server has registered us (the `hello` frame follows onConnection).
    return new Promise((resolve, reject) => {
      ws.once('message', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  it("closes a removed member's live socket and delivers no further frames", async () => {
    const ws = await connect();

    const framesAfterEvict: string[] = [];
    ws.on('message', (raw: Buffer) => framesAfterEvict.push(raw.toString()));
    const closed = once(ws, 'close') as Promise<[number, Buffer]>;

    gateway.disconnectUser(SEEDED_TRIP, DEV_USER);

    const [code] = await closed;
    expect(code).toBe(1008); // policy violation — membership revoked

    // A broadcast after eviction must not reach the (now closed) socket.
    gateway.broadcast(SEEDED_TRIP, {
      id: 'x',
      seq: '999999',
      tripId: SEEDED_TRIP,
      actorUserId: DEV_USER,
      entityType: 'event',
      entityId: 'x',
      action: 'create',
      createdAt: new Date().toISOString(),
    });
    expect(framesAfterEvict).toEqual([]);
  });

  it('closes every socket on trip disconnect', async () => {
    const ws = await connect();
    const closed = once(ws, 'close') as Promise<[number, Buffer]>;
    gateway.disconnectTrip(SEEDED_TRIP);
    const [code] = await closed;
    expect(code).toBe(1008);
  });
});
