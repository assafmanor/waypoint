import {
  BadRequestException,
  ForbiddenException,
  type ArgumentsHost,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';

function hostFor(req: { method: string; url?: string; headers: Record<string, string> }) {
  const res = {
    sendFile: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ url: '/x', ...req }), getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
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
  const filter = new AllExceptionsFilter('/build/index.html');

  it('serves the SPA shell for a document navigation that 404d', () => {
    const { host, res } = hostFor(HTML_NAV);
    filter.catch(new NotFoundException(), host);
    expect(res.sendFile).toHaveBeenCalledWith('/build/index.html');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('serves the SPA shell for a document navigation the auth guard 401d', () => {
    const { host, res } = hostFor(HTML_NAV);
    filter.catch(new UnauthorizedException('Missing access token'), host);
    expect(res.sendFile).toHaveBeenCalledOnce();
  });

  it('passes a programmatic fetch through as the JSON envelope', () => {
    const { host, res } = hostFor(FETCH);
    filter.catch(new UnauthorizedException('Missing access token'), host);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Missing access token' },
    });
  });

  it('passes non-GET html-accepting requests through as JSON', () => {
    const { host, res } = hostFor({ method: 'POST', headers: { accept: 'text/html' } });
    filter.catch(new NotFoundException(), host);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
