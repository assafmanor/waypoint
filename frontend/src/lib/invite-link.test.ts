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

  it('keeps a www. it was served from — dropping it could point at nothing', () => {
    at('https://www.travelive.app');
    expect(inviteLink('/join/7Kq2mB')).toBe('www.travelive.app/join/7Kq2mB');
  });

  it('keeps the port on a dev origin — the link still has to be reachable', () => {
    at('http://localhost:5173');
    expect(inviteLink('/join/7Kq2mB')).toBe('localhost:5173/join/7Kq2mB');
  });
});
