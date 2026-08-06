// @vitest-environment jsdom
//
// `inviteLink` reads `window.location.origin` — the whole point is which host the
// invite is built against — so it needs a DOM to stub one on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inviteLink } from './invite-link';

const at = (origin: string) => vi.stubGlobal('location', { ...window.location, origin });

afterEach(() => vi.unstubAllGlobals());

describe('inviteLink', () => {
  it('is the page origin and the path, without the scheme', () => {
    at('https://travelive.app');
    expect(inviteLink('/join/7Kq2mB')).toBe('travelive.app/join/7Kq2mB');
  });

  // Safe only because the apex reaches the service and ADR-0169 §2 forwards any host to
  // the canonical one, path intact — so the short form works under either canonical host.
  it('drops a www. it was served from, in the copied string and not only the label', () => {
    at('https://www.travelive.app');
    expect(inviteLink('/join/7Kq2mB')).toBe('travelive.app/join/7Kq2mB');
  });

  it('strips only a LEADING www., never one inside the host', () => {
    at('https://wwwtravelive.app');
    expect(inviteLink('/join/7Kq2mB')).toBe('wwwtravelive.app/join/7Kq2mB');
    at('https://app.wwwtest.com');
    expect(inviteLink('/join/7Kq2mB')).toBe('app.wwwtest.com/join/7Kq2mB');
  });

  it('keeps the port on a dev origin — the link still has to be reachable', () => {
    at('http://localhost:5173');
    expect(inviteLink('/join/7Kq2mB')).toBe('localhost:5173/join/7Kq2mB');
  });
});
