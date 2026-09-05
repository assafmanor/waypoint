// @vitest-environment jsdom
//
// Both forms read `window.location.origin` — the whole point is which host the link is
// built against — so this needs a DOM to stub one on.
//
// **The `inviteLink` alias is gone** (2026-09-05): every caller now asks for one of the two
// forms by name, because which one you want is the entire question — `publicAppLink` for a
// label, `publicAppUrl` for anything leaving the app. An alias that answered "the invite
// link" hid that choice, and four clipboard writes took the wrong one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicAppLink, publicAppUrl } from './invite-link';

const at = (origin: string) => vi.stubGlobal('location', { ...window.location, origin });

afterEach(() => vi.unstubAllGlobals());

describe('publicAppLink — the form that is shown', () => {
  it('is the page origin and the path, without the scheme', () => {
    at('https://travelive.app');
    expect(publicAppLink('/join/7Kq2mB')).toBe('travelive.app/join/7Kq2mB');
  });

  // Safe only because the apex reaches the service and ADR-0169 §2 forwards any host to
  // the canonical one, path intact — so the short form works under either canonical host.
  it('drops a www. it was served from, in the shown string and in the copied one', () => {
    at('https://www.travelive.app');
    expect(publicAppLink('/join/7Kq2mB')).toBe('travelive.app/join/7Kq2mB');
  });

  it('strips only a LEADING www., never one inside the host', () => {
    at('https://wwwtravelive.app');
    expect(publicAppLink('/join/7Kq2mB')).toBe('wwwtravelive.app/join/7Kq2mB');
    at('https://app.wwwtest.com');
    expect(publicAppLink('/join/7Kq2mB')).toBe('app.wwwtest.com/join/7Kq2mB');
  });

  it('keeps the port on a dev origin — the link still has to be reachable', () => {
    at('http://localhost:5173');
    expect(publicAppLink('/join/7Kq2mB')).toBe('localhost:5173/join/7Kq2mB');
  });
});

/**
 * **The scheme is the difference between a link and a preview** (ADR-0220's 2026-09-05
 * amendment). A pasted `travelive.app/join/<code>` is linkified by WhatsApp and **not**
 * previewed, so every `og:*` tag was invisible on the paths they were added for. What is
 * SHOWN stays short (owner: _"url previews should exclude the https prefix … but when
 * copying or sharing them it should add them"_); what LEAVES the app carries it.
 */
describe('publicAppUrl — the form that leaves the app', () => {
  it('carries the scheme, which is what makes a crawler fetch the preview', () => {
    at('https://travelive.app');
    expect(publicAppUrl('/join/7Kq2mB')).toBe('https://travelive.app/join/7Kq2mB');
    expect(publicAppUrl('/s/9pTb3Wx1')).toBe('https://travelive.app/s/9pTb3Wx1');
  });

  it('drops a leading www. here too, so the two forms name one host', () => {
    at('https://www.travelive.app');
    expect(publicAppUrl('/join/7Kq2mB')).toBe('https://travelive.app/join/7Kq2mB');
  });

  /** The page's own protocol, not a hardcoded `https:` — a link copied in dev has to stay
   *  openable on localhost, and in production the page is https anyway. */
  it('uses the page protocol, so a dev copy is still reachable', () => {
    at('http://localhost:5173');
    expect(publicAppUrl('/join/7Kq2mB')).toBe('http://localhost:5173/join/7Kq2mB');
  });

  it('keeps a query string', () => {
    at('https://travelive.app');
    expect(publicAppUrl('/s/9pTb3Wx1?from=chat')).toBe(
      'https://travelive.app/s/9pTb3Wx1?from=chat',
    );
  });

  /**
   * **The label is derived from the url, not built beside it**, which is what keeps the
   * original honesty rule alive: the shown string is exactly the copied one minus a prefix
   * that changes nothing about where it goes. Two independent builders is how the four
   * clipboard writes came to disagree with the three share-sheet calls.
   */
  it('is the shown link plus exactly the scheme, for every origin shape', () => {
    for (const origin of [
      'https://travelive.app',
      'https://www.travelive.app',
      'http://localhost:5173',
      'https://staging.travelive.app',
    ]) {
      at(origin);
      const url = publicAppUrl('/join/7Kq2mB');
      expect(url.replace(/^https?:\/\//, '')).toBe(publicAppLink('/join/7Kq2mB'));
    }
  });
});
