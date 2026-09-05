import 'reflect-metadata';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FRONTEND_URL } from '../common/env';
import { SPA_INDEX } from './spa-paths';
import { homeMeta, inviteMeta, liveMeta } from './share-meta';
import { escapeHtml, SpaShellService, type ShareMeta } from './spa-shell.service';

/**
 * **The half of ADR-0220 worth testing exhaustively**, because its one job is to interpolate
 * trip content a stranger typed into a document. `SpaShellController` needs a database and a
 * throttler; this needs a file.
 *
 * The built shell never exists in dev or test (ADR-0020), so the suite writes one — the same
 * `<head>` shape `frontend/index.html` has, marker included.
 */
const SHELL = [
  '<!doctype html>',
  '<html lang="he" dir="rtl">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <title>Travelive · מרכז שליטה לטיול</title>',
  '    <!--%SOCIAL_META%-->',
  '  </head>',
  '  <body><div id="root"></div></body>',
  '</html>',
].join('\n');

const FACTS = {
  name: 'יפן 2026',
  destination: 'אוסקה',
  startDate: '2026-09-11',
  endDate: '2026-09-22',
  travellers: 3,
};

describe('SpaShellService', () => {
  let shell: SpaShellService;
  const previousFrontendUrl = process.env[FRONTEND_URL];

  beforeAll(() => {
    mkdirSync(dirname(SPA_INDEX), { recursive: true });
    writeFileSync(SPA_INDEX, SHELL, 'utf8');
    delete process.env[FRONTEND_URL];
    shell = new SpaShellService();
  });

  afterAll(() => {
    rmSync(SPA_INDEX, { force: true });
    if (previousFrontendUrl === undefined) delete process.env[FRONTEND_URL];
    else process.env[FRONTEND_URL] = previousFrontendUrl;
  });

  const render = (meta: ShareMeta, origin = 'https://travelive.app') =>
    shell.render(meta, origin) ?? '';

  describe('the origin, which og:image and og:url cannot do without', () => {
    it('prefers FRONTEND_URL, so a preview never advertises the host a crawler arrived on', () => {
      process.env[FRONTEND_URL] = 'https://travelive.app';
      expect(shell.origin({ host: 'waypoint-production.up.railway.app' })).toBe(
        'https://travelive.app',
      );
      delete process.env[FRONTEND_URL];
    });

    it('strips a trailing slash from the configured origin', () => {
      process.env[FRONTEND_URL] = 'https://travelive.app/';
      expect(shell.origin({})).toBe('https://travelive.app');
      delete process.env[FRONTEND_URL];
    });

    it('falls back to the forwarded host and proto, which is what makes a preview branch work', () => {
      expect(
        shell.origin({ 'x-forwarded-host': 'staging.travelive.app', 'x-forwarded-proto': 'https' }),
      ).toBe('https://staging.travelive.app');
    });

    /** A repeated or comma-joined `X-Forwarded-Host` is one hop of spoofable input; take the
     *  first value and no more, the same posture as `trust proxy: 1`. */
    it('takes only the first forwarded host', () => {
      expect(shell.origin({ 'x-forwarded-host': 'real.example, evil.example' })).toBe(
        'https://real.example',
      );
      expect(shell.origin({ 'x-forwarded-host': ['real.example', 'evil.example'] })).toBe(
        'https://real.example',
      );
    });
  });

  describe('escaping, because every value is trip content somebody typed', () => {
    it('closes the attribute-escape a trip name could otherwise open', () => {
      const html = render(
        inviteMeta('7Fq2xKmA', { ...FACTS, name: 'Osaka" /><script>alert(1)</script>' }),
      );
      expect(html).not.toContain('<script>');
      expect(html).toContain('&quot;');
      expect(html).toContain('&lt;script&gt;');
    });

    /** `&` first, or the escapes get re-escaped — and `'` is in the set even though this
     *  renderer only emits double quotes, because relying on that is how the next edit
     *  introduces the hole. */
    it('escapes all five characters, ampersand first', () => {
      expect(escapeHtml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
      expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    });

    it('escapes the title it writes into <title> as well as the og: tags', () => {
      const html = render(inviteMeta('7Fq2xKmA', { ...FACTS, name: '<b>יפן</b>' }));
      expect(html).toContain('<title>הוזמנת ל&lt;b&gt;יפן&lt;/b&gt;</title>');
    });
  });

  describe('the three cases', () => {
    it('gives the homepage the brand cover, the promise in the title, and lets it be indexed', () => {
      const html = render(homeMeta());
      expect(html).toContain(
        '<meta property="og:title" content="Travelive - כל הטיול שלכם במסך אחד" />',
      );
      expect(html).toContain(
        '<meta property="og:image" content="https://travelive.app/og-cover.png" />',
      );
      expect(html).toContain('<meta property="og:url" content="https://travelive.app/" />');
      expect(html).not.toContain('name="robots"');
    });

    it('gives an invitation the ticket cover, the trip in the title, and refuses indexing', () => {
      const html = render(inviteMeta('7Fq2xKmA', FACTS));
      expect(html).toContain('<meta property="og:title" content="הוזמנת ליפן 2026" />');
      expect(html).toContain(
        '<meta property="og:image" content="https://travelive.app/og-invite.png" />',
      );
      expect(html).toContain(
        '<meta property="og:url" content="https://travelive.app/join/7Fq2xKmA" />',
      );
      // The code is the grant (ADR-0067), so the page must never enter an index.
      expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />');
    });

    it('gives a live share the trip and what it is, and refuses indexing', () => {
      const html = render(liveMeta('9pTb3Wx1', FACTS));
      expect(html).toContain('<meta property="og:title" content="יפן 2026 - הלו״ז החי" />');
      expect(html).toContain(
        '<meta property="og:url" content="https://travelive.app/s/9pTb3Wx1" />',
      );
      expect(html).toContain('<meta name="robots" content="noindex, nofollow, noarchive" />');
    });

    /**
     * **`הוזמנת לטיול ${name}` stuttered and the clean case could not show it.** The mockup's
     * crowded frame read `הוזמנת לטיול טיול הבוגרים של כיתה יב3 ליוון`; the wording is now the
     * bare `ל` prefix the app already uses elsewhere. Asserted with a name that starts with
     * `טיול`, since that is the only input the old form got wrong.
     */
    it('does not stutter on a trip name that begins with טיול', () => {
      const html = render(inviteMeta('7Fq2xKmA', { ...FACTS, name: 'טיול הבוגרים ליוון' }));
      expect(html).toContain('content="הוזמנת לטיול הבוגרים ליוון"');
      expect(html).not.toContain('לטיול טיול');
    });
  });

  describe('the description', () => {
    it('names the destination, the dates and the travellers, in that order', () => {
      const html = render(inviteMeta('7Fq2xKmA', FACTS));
      expect(html).toContain('אוסקה,');
      expect(html).toContain('בספטמבר');
      expect(html).toContain('3 נוסעים כבר בפנים.');
    });

    /**
     * **The date range is wrapped in U+2066/U+2069 and this is the assertion that keeps it
     * there.** `אוסקה, 11–22 בספטמבר.` leads with Hebrew, so the element resolves RTL and the
     * numeric run paints as `22–11` (ADR-0118) — measured in the mockup at Δx −18px raw
     * against +18px isolated. A meta attribute carries the isolate characters like any other
     * text; drop them and the preview lies about the dates with nothing failing.
     */
    it('isolates the numeric range, or the dates paint backwards in an RTL description', () => {
      const html = render(liveMeta('9pTb3Wx1', FACTS));
      expect(html).toContain('⁦');
      expect(html).toContain('⁩');
      expect(html).toMatch(/⁦[^⁩]*11[^⁩]*22[^⁩]*⁩/);
    });

    /** No `·` and no em dash on these surfaces (owner, 2026-09-05). The app's separator is
     *  fine on a screen and reads as debris in a chat preview. */
    it('spends neither the dot separator nor an em dash', () => {
      const html = [homeMeta(), inviteMeta('a', FACTS), liveMeta('b', FACTS)]
        .map((meta) => render(meta))
        .join('');
      expect(html).not.toContain('·');
      expect(html).not.toContain('—');
    });
  });

  describe('the tags a large card needs', () => {
    it('declares the cover size, so the first fetch renders large rather than as a thumbnail', () => {
      const html = render(homeMeta());
      expect(html).toContain('<meta property="og:image:width" content="1200" />');
      expect(html).toContain('<meta property="og:image:height" content="630" />');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    });

    /** A preview card is an image with text baked into it, so a screen reader has nothing
     *  without this — and the alt describes the COVER, never the trip: it is the same PNG
     *  for every trip. */
    it('describes the cover, not the trip', () => {
      const html = render(inviteMeta('7Fq2xKmA', FACTS));
      expect(html).toContain('<meta property="og:image:alt"');
      expect(html).not.toMatch(/og:image:alt" content="[^"]*יפן 2026/);
    });

    it('leaves the marker behind — a second render must not find it gone', () => {
      expect(render(homeMeta())).not.toContain('<!--%SOCIAL_META%-->');
      expect(render(liveMeta('9pTb3Wx1', FACTS))).toContain('og:title');
    });
  });
});
