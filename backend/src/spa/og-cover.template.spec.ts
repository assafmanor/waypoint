import { describe, expect, it } from 'vitest';
import { INVITE_AVATARS } from '@waypoint/shared';
import { coverHtml, coverSignature, type CoverKind } from './og-cover.template';
import type { TripPreviewFacts } from './share-meta';

const FACTS: TripPreviewFacts = {
  name: 'יפן 2026',
  destination: 'אוסקה',
  startDate: '2026-09-11',
  endDate: '2026-09-22',
  travellers: 3,
  icon: '🗻',
};

const KINDS: CoverKind[] = ['invite', 'live'];

/** `coverHtml` reads the templates and the app's sheets off disk. In a checkout they are
 *  where they are authored; in the image they are copied (`Dockerfile`). A null here means
 *  the lookup broke, which is a real failure rather than a reason to skip. */
const html = (kind: CoverKind, facts: TripPreviewFacts = FACTS): string => {
  const out = coverHtml(kind, facts);
  expect(out, 'cover assets not found — check COVER_ROOTS/SHEET_ROOTS').not.toBeNull();
  return out as string;
};

describe('coverHtml', () => {
  /**
   * **The one failure the templates cannot report themselves.** Two programs fill them —
   * this module and `scripts/gen-app-icons.mjs` — so a slot added for the cutter and not
   * here ships as a literal `{{name}}` baked into a PNG that a chat app then caches.
   */
  it.each(KINDS)('leaves no slot unfilled on the %s cover', (kind) => {
    // Slot-SHAPED braces only. A bare `/\{\{/` also matches the templates' own comments,
    // which name the convention as `{{…}}`, and a test that fails on its own documentation
    // teaches people to delete the documentation.
    expect(html(kind)).not.toMatch(/\{\{\{?\w/);
  });

  it.each(KINDS)('draws the trip on the %s cover, not a generic line', (kind) => {
    const out = html(kind);
    expect(out).toContain('יפן 2026');
    expect(out).toContain('🗻');
  });

  /** The whole of the owner's report: the covers were one picture per surface, so the icon
   *  a trip chose never appeared. A trip with no icon still gets one — the join screen's own
   *  `preview.icon ?? DEFAULT_TRIP_ICON` rule, so the ticket is never missing its glyph. */
  it('falls back to the default glyph when a trip chose none', () => {
    const out = html('invite', { ...FACTS, icon: undefined });
    expect(out).toContain('🧳');
  });

  /**
   * **A trip name is content somebody typed, and this document is then run in a browser.**
   * The renderer aborts the network, so the worst case is bounded — but an unescaped `<`
   * would still let a member's trip name rewrite the artwork of the link they send out.
   */
  it('escapes trip content rather than letting it reach the renderer as markup', () => {
    const out = html('invite', { ...FACTS, name: '<img src=x onerror=alert(1)>יפן' });
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  /**
   * **The count and the row of faces are the same fact** (owner, on a render: three faces
   * beside `נוסע אחד כבר בפנים`). The row is capped where the join screen caps it, and the
   * sentence carries the real number past that.
   */
  it.each([
    [1, 1],
    [3, 3],
    [9, INVITE_AVATARS.MAX],
  ])('draws %i travellers as %i faces', (travellers, faces) => {
    const out = html('invite', { ...FACTS, travellers });
    expect(out.split('class="ticket-av"').length - 1).toBe(faces);
  });

  it('says the traveller count in the app screen’s own words', () => {
    expect(html('invite', { ...FACTS, travellers: 1 })).toContain('נוסע אחד כבר בפנים');
    expect(html('invite', { ...FACTS, travellers: 4 })).toContain('4 נוסעים כבר בפנים');
  });

  /** The mark has to arrive as bytes: the renderer aborts every request before the content
   *  is set, so a `src="/icon-mark-bright.svg"` would draw a broken box. */
  it('inlines the brand mark on the live cover', () => {
    expect(html('live')).toContain('src="data:image/svg+xml;base64,');
  });
});

describe('coverSignature', () => {
  /** Content-addressed, which is what lets the cache and every crawler's cache be correct
   *  with no invalidation path: a different picture is a different URL. */
  it('changes with anything the cover draws', () => {
    const base = coverSignature('invite', FACTS);
    expect(coverSignature('invite', { ...FACTS })).toBe(base);
    for (const changed of [
      { ...FACTS, name: 'איסלנד' },
      { ...FACTS, icon: '🗺️' },
      { ...FACTS, destination: 'טוקיו' },
      { ...FACTS, startDate: '2026-09-12' },
      { ...FACTS, endDate: '2026-09-23' },
      { ...FACTS, travellers: 4 },
    ]) {
      expect(coverSignature('invite', changed), JSON.stringify(changed)).not.toBe(base);
    }
  });

  /** The two surfaces draw different artwork from the same facts, so they must not collide
   *  in a cache keyed on this. */
  it('separates the two surfaces', () => {
    expect(coverSignature('invite', FACTS)).not.toBe(coverSignature('live', FACTS));
  });
});
