import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { SHARE_DETAIL_LEVEL } from '@waypoint/shared';
import type { Response } from 'express';
import {
  applyPublicShareHeaders,
  isBearerLinkPath,
  PUBLIC_SHARE_HEADERS,
} from './public-response-headers';
import { PublicSharingController } from './public-sharing.controller';
import type { SharingService } from './sharing.service';

function fakeResponse(): Response & { headers: Record<string, string>; body?: unknown } {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    send: (body: unknown) => {
      (res as { body?: unknown }).body = body;
    },
  };
  return res as unknown as Response & { headers: Record<string, string>; body?: unknown };
}

describe('public share response headers', () => {
  it('refuses caching, referrer leakage and indexing', () => {
    const res = fakeResponse();
    applyPublicShareHeaders(res);

    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers['X-Robots-Tag']).toBe('noindex, nofollow, noarchive');
  });

  // The SPA fallback branches on this, so a change to the public route shape must not
  // quietly leave those navigations indexable.
  it.each([
    '/s/7Kq2mB9x',
    '/s/7Kq2mB9x?from=chat',
    // The invite joined the set in ADR-0220, when its shell started carrying the trip's
    // name. Before that it was a content-free document at a secret URL.
    '/join/7Kq2mB9x',
    '/join/7Kq2mB9x?utm_source=whatsapp',
  ])('recognises %s as a bearer-link navigation', (path) => {
    expect(isBearerLinkPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/trips',
    '/settings',
    '/shared-itineraries/7Kq2mB9x',
    // A bare prefix is not a credential — `/s` and `/join` with no code carry nothing to
    // protect, and matching them would put `no-store` on paths that are not shares.
    '/s',
    '/join',
    // …and neither is a path that merely STARTS with one of the words.
    '/settings/share',
    '/joins/7Kq2mB9x',
  ])('leaves %s on the ordinary policy', (path) => {
    expect(isBearerLinkPath(path)).toBe(false);
  });
});

describe('PublicSharingController', () => {
  const projection = {
    status: 'live' as const,
    detailLevel: SHARE_DETAIL_LEVEL.FULL,
    generatedAt: '2026-08-29T08:10:00.000Z',
    shareUrl: '/s/7Kq2mB9x',
    trip: {
      name: 'איסלנד',
      destination: 'Iceland',
      startDate: '2026-08-29',
      endDate: '2026-08-30',
      dayCount: 2,
      eventCount: 0,
      routeLabels: [],
    },
    narrative: { source: 'deterministic' as const, title: 'איסלנד', summary: '' },
    days: [],
  };

  it('sets the privacy headers on the JSON read', async () => {
    const sharing = { byCode: vi.fn().mockResolvedValue(projection) } as unknown as SharingService;
    const res = fakeResponse();

    await new PublicSharingController(sharing).read('7Kq2mB9x', res);

    for (const [name, value] of Object.entries(PUBLIC_SHARE_HEADERS)) {
      expect(res.headers[name]).toBe(value);
    }
  });

  it('serves a selected document as an attachment, never inline', async () => {
    const sharing = {
      publicDocument: vi.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-1.4'),
        mimeType: 'application/pdf',
        title: 'הזמנת הדירה.pdf',
      }),
    } as unknown as SharingService;
    const res = fakeResponse();

    await new PublicSharingController(sharing).document('7Kq2mB9x', 'doc-1', res);

    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Content-Disposition']).toMatch(/^attachment;/);
    // A Hebrew filename rides `filename*`, percent-encoded, with an ASCII fallback.
    expect(res.headers['Content-Disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
});
