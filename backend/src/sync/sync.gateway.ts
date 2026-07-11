import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import type { Change } from '@waypoint/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { DEV_PRINCIPAL } from '../auth/dev-auth.guard';
import type { Principal } from '../auth/principal';
import { PrismaService } from '../prisma/prisma.service';

// `ws`'s built-in `path` match is an exact string, so a dynamic `:tripId` segment
// needs manual upgrade handling instead of the `path` option (sync-and-offline.md).
const STREAM_PATH_RE = /^\/trips\/([^/?]+)\/stream(?:\?.*)?$/;

type ServerMessage =
  | { type: 'hello'; serverTime: string; latestSeq: string }
  | { type: 'change'; seq: string; change: Change }
  | { type: 'presence'; members: { userId: string; connected: boolean }[] }
  | { type: 'pong' };

/** WS /trips/:tripId/stream — realtime fan-out (ADR-0019, sync-and-offline.md). */
@Injectable()
export class SyncGateway {
  private readonly logger = new Logger(SyncGateway.name);
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly channels = new Map<string, Map<WebSocket, string>>(); // tripId -> (socket -> userId)

  constructor(private readonly prisma: PrismaService) {}

  attach(httpServer: HttpServer): void {
    httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      this.handleUpgrade(req, socket, head).catch((err: unknown) => {
        this.logger.error('WS upgrade failed', err);
        socket.destroy();
      });
    });
  }

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const match = STREAM_PATH_RE.exec(req.url ?? '');
    if (!match) return; // not our route

    const tripId = match[1];
    // ponytail: dev-auth stub only, same as DevAuthGuard — real cookie/JWT session lands with T-007.
    const principal = this.authenticate();
    if (!principal) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const membership = await this.prisma.membership.findUnique({
      where: { tripId_userId: { tripId, userId: principal.userId } },
    });
    if (!membership) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (client) => {
      this.onConnection(client, tripId, principal.userId);
    });
  }

  private authenticate(): Principal | null {
    return process.env.DEV_AUTH === '1' ? DEV_PRINCIPAL : null;
  }

  private onConnection(client: WebSocket, tripId: string, userId: string): void {
    let channel = this.channels.get(tripId);
    if (!channel) {
      channel = new Map();
      this.channels.set(tripId, channel);
    }
    channel.set(client, userId);

    this.latestSeq(tripId)
      .then((latestSeq) => {
        this.send(client, { type: 'hello', serverTime: new Date().toISOString(), latestSeq });
        this.broadcastPresence(tripId);
      })
      .catch((err: unknown) => this.logger.error('WS hello failed', err));

    client.on('message', (raw: Buffer) => {
      if (parseMessageType(raw) === 'ping') this.send(client, { type: 'pong' });
    });
    client.on('close', () => {
      channel?.delete(client);
      if (channel?.size === 0) this.channels.delete(tripId);
      this.broadcastPresence(tripId);
    });
  }

  /** Called by ChangeService after a mutation commits — never before (ADR-0019). */
  broadcast(tripId: string, change: Change): void {
    const channel = this.channels.get(tripId);
    if (!channel) return;
    for (const client of channel.keys()) {
      this.send(client, { type: 'change', seq: change.seq, change });
    }
  }

  private broadcastPresence(tripId: string): void {
    const channel = this.channels.get(tripId);
    if (!channel) return;
    const members = [...new Set(channel.values())].map((userId) => ({
      userId,
      connected: true,
    }));
    for (const client of channel.keys()) {
      this.send(client, { type: 'presence', members });
    }
  }

  private async latestSeq(tripId: string): Promise<string> {
    const latest = await this.prisma.change.findFirst({
      where: { tripId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return latest ? latest.seq.toString() : '0';
  }

  private send(client: WebSocket, message: ServerMessage): void {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  }
}

function parseMessageType(raw: Buffer): string | undefined {
  try {
    return (JSON.parse(raw.toString()) as { type?: string }).type;
  } catch {
    return undefined;
  }
}
