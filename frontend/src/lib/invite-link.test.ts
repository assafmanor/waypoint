// @vitest-environment jsdom
//
// `inviteLink` reads `window.location.origin` — the whole point is which host the
// invite is built against — so it needs a DOM to stub one on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inviteLink } from './invite-link';

const at = (origin: string) => vi.stubGlobal('location', { ...window.location, origin });

afterEach(() => vi.unstubAllGlobals());

describe('inviteLink', () => {
  it('builds an absolute url from the page origin and a short label from it', () => {
    at('https://travelive.app');
    expect(inviteLink('/join/7Kq2mB')).toEqual({
      url: 'https://travelive.app/join/7Kq2mB',
      label: 'travelive.app/join/7Kq2mB',
    });
  });

  it('drops the www. from the label but never from the url that gets pasted', () => {
    at('https://www.travelive.app');
    expect(inviteLink('/join/7Kq2mB')).toEqual({
      url: 'https://www.travelive.app/join/7Kq2mB',
      label: 'travelive.app/join/7Kq2mB',
    });
  });

  it('keeps the port on a dev origin — the label still has to be reachable', () => {
    at('http://localhost:5173');
    expect(inviteLink('/join/7Kq2mB')).toEqual({
      url: 'http://localhost:5173/join/7Kq2mB',
      label: 'localhost:5173/join/7Kq2mB',
    });
  });
});
