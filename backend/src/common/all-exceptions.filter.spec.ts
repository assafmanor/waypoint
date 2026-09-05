import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { REVALIDATE } from './static-cache';

function hostFor(req: {
  method: string;
  url?: string;
  path?: string;
  headers: Record<string, string>;
}) {
  const res = {
    sendFile: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/x', path: req.path ?? '/x', ...req }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

/** The filter no longer takes a PATH — it takes the one service that knows how to build the
 *  shell (ADR-0220), so `/trips` and `/day/…` carry the app's own preview tags instead of a
 *  tag-less document. Faked here down to the two methods it calls. */
const SHELL_HTML = '<!doctype html><html><head><title>Travelive</title></head></html>';
function fakeShell(html: string | null = SHELL_HTML) {
  return {
    render: vi.fn().mockReturnValue(html),
    origin: vi.fn().mockReturnValue('https://travelive.app'),
  } as unknown as ConstructorParameters<typeof AllExceptionsFilter>[0];
}

const HTML_NAV = { method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } };
const FETCH = { method: 'GET', headers: { accept: '*/*' } };

describe('AllExceptionsFilter — error envelope', () => {
  const filter = new AllExceptionsFilter(); // no SPA index -> JSON for everything

  it('wraps a guard 404 in the documented envelope', () => {
    const { host, res } = hostFor(FETCH);
    filter.catch(new NotFoundException('Member not found'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Member not found' },
    });
  });

  it('wraps a 403 in the envelope', () => {
    const { host, res } = hostFor(FETCH);
    filter.catch(new ForbiddenException('Admin only'), host);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'Admin only' } });
  });

  it('passes through an already-enveloped exception (e.g. the zod pipe)', () => {
    const { host, res } = hostFor(FETCH);
    const enveloped = { error: { code: 'VALIDATION_ERROR', message: 'bad', details: { a: 1 } } };
    filter.catch(new BadRequestException(enveloped), host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(enveloped);
  });

  it('maps Prisma P2002 to a 409 CONFLICT without leaking the message', () => {
    const { host, res } = hostFor(FETCH);
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on tripId', {
      code: 'P2002',
      clientVersion: 'x',
    });
    filter.catch(err, host);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'CONFLICT', message: 'Resource already exists' },
    });
  });

  it('maps Prisma P2025 to a 404 NOT_FOUND', () => {
    const { host, res } = hostFor(FETCH);
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'x',
    });
    filter.catch(err, host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });

  it('turns an unexpected error into a 500 without leaking its message', () => {
    const { host, res } = hostFor(FETCH);
    filter.catch(new Error('secret db dsn leaked here'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});

describe('AllExceptionsFilter — SPA fallback (production)', () => {
  it('serves the SPA shell for a document navigation that 404d', () => {
    const { host, res } = hostFor(HTML_NAV);
    new AllExceptionsFilter(fakeShell()).catch(new NotFoundException(), host);
    // Never cached past a revalidation: the shell names the current build's
    // hashed chunks and a deploy deletes the previous ones (ADR-0185).
    expect(res.send).toHaveBeenCalledWith(SHELL_HTML);
    expect(res.set).toHaveBeenCalledWith({ 'Cache-Control': REVALIDATE });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('serves the SPA shell for a document navigation the auth guard 401d', () => {
    const { host, res } = hostFor(HTML_NAV);
    new AllExceptionsFilter(fakeShell()).catch(
      new UnauthorizedException('Missing access token'),
      host,
    );
    expect(res.send).toHaveBeenCalledOnce();
  });

  /**
   * **A bearer-link path keeps the no-store set even in the fallback** (ADR-0213 §5,
   * ADR-0220). `SpaShellController` owns `/s/<code>` and `/join/<code>` now, so this branch
   * is reached only by the shapes routing does not match — a trailing segment, a HEAD — and
   * that is exactly why it stays: the protection is matched by PATH, and losing it on the
   * way through here would be silent.
   */
  it.each(['/s/7Kq2mB9x', '/join/7Kq2mB9x'])('refuses caching and indexing for %s', (path) => {
    const { host, res } = hostFor({ ...HTML_NAV, path });
    new AllExceptionsFilter(fakeShell()).catch(new NotFoundException(), host);
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      }),
    );
  });

  it('passes a programmatic fetch through as the JSON envelope', () => {
    const { host, res } = hostFor(FETCH);
    new AllExceptionsFilter(fakeShell()).catch(
      new UnauthorizedException('Missing access token'),
      host,
    );
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Missing access token' },
    });
  });

  it('passes non-GET html-accepting requests through as JSON', () => {
    const { host, res } = hostFor({ method: 'POST', headers: { accept: 'text/html' } });
    new AllExceptionsFilter(fakeShell()).catch(new NotFoundException(), host);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  /**
   * **A rate-limited navigation gets the app, not our error envelope.** ADR-0220 put a
   * 20/min cap on `/join/<code>`, which had none before it started reaching the database —
   * so without this a few friends behind one NAT opening the same invite would see raw JSON
   * where the join screen used to be.
   */
  it('serves the shell for a document navigation the throttler 429d', () => {
    const { host, res } = hostFor({ ...HTML_NAV, path: '/join/7Kq2mB9x' });
    new AllExceptionsFilter(fakeShell()).catch(
      new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      host,
    );
    expect(res.send).toHaveBeenCalledWith(SHELL_HTML);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  /** …but a programmatic fetch that is throttled still gets the documented envelope, so the
   *  offline outbox can tell a retryable rejection from a permanent one. */
  it('still gives a throttled fetch the JSON envelope', () => {
    const { host, res } = hostFor(FETCH);
    new AllExceptionsFilter(fakeShell()).catch(
      new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      host,
    );
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'RATE_LIMITED', message: 'ThrottlerException: Too Many Requests' },
    });
  });

  /** No built shell (the service returns `null`) must fall through to the JSON envelope
   *  rather than sending an empty document — a broken deploy has to look broken. */
  it('falls back to JSON when there is no shell to render', () => {
    const { host, res } = hostFor(HTML_NAV);
    new AllExceptionsFilter(fakeShell(null)).catch(new NotFoundException(), host);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledOnce();
  });
});
