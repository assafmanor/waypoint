import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SpaFallbackFilter } from './spa-fallback.filter';

function hostFor(req: { method: string; headers: Record<string, string> }) {
  const res = {
    sendFile: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

const HTML_NAV = { method: 'GET', headers: { accept: 'text/html,application/xhtml+xml' } };

describe('SpaFallbackFilter', () => {
  const filter = new SpaFallbackFilter();

  it('serves the SPA shell for a document navigation the router 404d', () => {
    const { host, res } = hostFor(HTML_NAV);
    filter.catch(new NotFoundException(), host);
    expect(res.sendFile).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  // /trips collides with the guarded GET /trips API route: a refresh 401s
  // (cookie, no bearer) and must still load the shell, not raw JSON.
  it('serves the SPA shell for a document navigation the auth guard 401d', () => {
    const { host, res } = hostFor(HTML_NAV);
    filter.catch(new UnauthorizedException('Missing access token'), host);
    expect(res.sendFile).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes a real 401 through as JSON for a programmatic fetch', () => {
    const { host, res } = hostFor({ method: 'GET', headers: { accept: '*/*' } });
    filter.catch(new UnauthorizedException('Missing access token'), host);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Missing access token' }),
    );
  });

  it('passes non-GET requests through as JSON even when they accept html', () => {
    const { host, res } = hostFor({ method: 'POST', headers: { accept: 'text/html' } });
    filter.catch(new NotFoundException(), host);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
