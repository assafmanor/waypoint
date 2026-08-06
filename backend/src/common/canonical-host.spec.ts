import { describe, expect, it } from 'vitest';
import { canonicalRedirectTarget } from './canonical-host';

const CANONICAL = 'https://travelive.app';

const req = (over: Partial<Parameters<typeof canonicalRedirectTarget>[1]> = {}) => ({
  method: 'GET',
  originalUrl: '/',
  headers: { host: 'www.travelive.app' },
  ...over,
});

describe('canonicalRedirectTarget (ADR-0169)', () => {
  it('sends another host to the canonical one', () => {
    expect(canonicalRedirectTarget(CANONICAL, req())).toBe('https://travelive.app/');
  });

  it('keeps the path and query — an invite deep link must survive the hop', () => {
    expect(canonicalRedirectTarget(CANONICAL, req({ originalUrl: '/join/7Kq2mB?x=1' }))).toBe(
      'https://travelive.app/join/7Kq2mB?x=1',
    );
  });

  it('serves the canonical host itself', () => {
    expect(canonicalRedirectTarget(CANONICAL, req({ headers: { host: 'travelive.app' } }))).toBe(
      null,
    );
  });

  it('compares the host case-insensitively', () => {
    expect(canonicalRedirectTarget(CANONICAL, req({ headers: { host: 'Travelive.App' } }))).toBe(
      null,
    );
  });

  it('leaves the healthcheck alone on any host — a redirect there fails the deploy', () => {
    for (const originalUrl of ['/health', '/health/ready']) {
      expect(canonicalRedirectTarget(CANONICAL, req({ originalUrl }))).toBe(null);
    }
  });

  it('redirects only GET/HEAD — a 301/302 turns a POST into a GET and drops its body', () => {
    expect(canonicalRedirectTarget(CANONICAL, req({ method: 'POST' }))).toBe(null);
    expect(canonicalRedirectTarget(CANONICAL, req({ method: 'HEAD' }))).toBe(
      'https://travelive.app/',
    );
  });

  it('does nothing when no canonical host is configured', () => {
    expect(canonicalRedirectTarget(undefined, req())).toBe(null);
    expect(canonicalRedirectTarget('not a url', req())).toBe(null);
  });

  it('ignores a path on the canonical URL — only its origin is the destination', () => {
    expect(canonicalRedirectTarget('https://travelive.app/app', req({ originalUrl: '/x' }))).toBe(
      'https://travelive.app/x',
    );
  });

  it('serves a request with no Host header rather than guessing', () => {
    expect(canonicalRedirectTarget(CANONICAL, req({ headers: {} }))).toBe(null);
  });
});
