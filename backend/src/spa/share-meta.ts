import { heTripRange, SHARE_META_COPY } from '../sharing/hebrew.copy';
import { coverSignature, type CoverKind } from './og-cover.template';
import type { ShareMeta } from './spa-shell.service';

/**
 * **Three covers, one per shared URL** (ADR-0220 §2-3 and its 2026-09-05 amendment), rendered
 * from the app's real CSS in `scripts/og-covers/` and cut by `scripts/gen-app-icons.mjs`.
 *
 * Each one is the surface its link opens: the mark and the wordmark for the homepage, the
 * join screen's own boarding pass for an invitation, the reader page's own masthead for a
 * live itinerary. The live cover exists because sharing the brand one made an itinerary sent
 * to family indistinguishable from a marketing link (owner, 2026-09-05).
 *
 * **None of them carries the paper band the first cut had**, and the reason is a measurement
 * error worth naming: §2 justified the band by comparing `--paper` to the chat BUBBLE, but
 * what sits under the image is the card's own TEXT PANEL, which is near-white in a light
 * chat — `1.04:1`. The band and the panel were one light block, so it destroyed the boundary
 * it was added to draw. The live cover's bright half is the reader page's own body, i.e.
 * content rather than a device, which is why it keeps one.
 */
const COVER = { brand: '/og-cover.png' } as const;

/**
 * **The route prefix each per-trip cover is served from**, named once because the controller
 * mounts it and `coverImagePath` writes it into `og:image`; two spellings of the same path
 * would be a broken picture in every chat card, and nothing in a test suite looks at both.
 */
export const OG_COVER_PREFIX: Record<CoverKind, string> = {
  invite: 'og/join',
  live: 'og/s',
};

/**
 * **`og:image` for one trip** (ADR-0220's 2026-09-06 amendment).
 *
 * `?v=` is the cover's own content hash, so the URL changes exactly when the picture does.
 * That is what makes a crawler's cache correct without an invalidation path: WhatsApp holds
 * a preview against the URL it fetched, and a renamed trip is simply a different URL.
 *
 * `.png` is decoration for readers that sniff an extension — the response's `Content-Type`
 * is what actually decides, and the controller strips the suffix back off.
 */
function coverImagePath(kind: CoverKind, code: string, facts: TripPreviewFacts): string {
  return `/${OG_COVER_PREFIX[kind]}/${encodeURIComponent(code)}.png?v=${coverSignature(kind, facts)}`;
}

/** `og:image:alt`. **It names the trip now**, and it did not before for a reason that has
 *  stopped being true: the cover was one PNG served to every crawler, so an alt text naming a
 *  trip was a caption for a picture that was not there. The per-trip cover draws the name, so
 *  the alt text describing it has to say the same word (ADR-0220's 2026-09-06 amendment). */
const COVER_ALT = {
  brand: 'הלוגו של Travelive על רקע כהה',
  invite: (name: string) => `כרטיס הזמנה ל${name}, בסגנון כרטיס עלייה למטוס`,
  live: (name: string) => `ראש העמוד של הלו״ז החי של ${name} ב-Travelive`,
} as const;

/**
 * **The trip facts a preview is allowed to say**, and the shape both code routes resolve to.
 * Deliberately the four fields the two card texts use and nothing else — a preview that
 * could reach for more of a trip would eventually be asked to.
 */
export interface TripPreviewFacts {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  travellers: number;
  /** The trip's chosen glyph (ADR-0038 §5), absent when nobody picked one. It reaches no
   *  `<meta>` tag — it is drawn on the COVER, which is what the 2026-09-06 amendment made
   *  per-trip, and the fifth field is here because the cover is filled from these facts. */
  icon?: string;
}

/** The homepage, and every in-app route that is not a bearer link. */
export function homeMeta(): ShareMeta {
  return {
    title: SHARE_META_COPY.home.title,
    description: SHARE_META_COPY.home.description,
    imagePath: COVER.brand,
    imageAlt: COVER_ALT.brand,
    path: '/',
    indexable: true,
  };
}

/** `/join/<code>` — an invitation to a trip. */
export function inviteMeta(code: string, facts: TripPreviewFacts): ShareMeta {
  return {
    title: SHARE_META_COPY.invite.title(facts.name),
    description: SHARE_META_COPY.invite.description(
      facts.destination,
      dateRange(facts),
      facts.travellers,
    ),
    imagePath: coverImagePath('invite', code, facts),
    imageAlt: COVER_ALT.invite(facts.name),
    path: `/join/${code}`,
    // The code IS the grant (ADR-0067), so this page must never enter a search index.
    indexable: false,
  };
}

/** `/s/<code>` — the read-only live itinerary, and the one surface with its own cover since
 *  the 2026-09-05 amendment. */
export function liveMeta(code: string, facts: TripPreviewFacts): ShareMeta {
  return {
    title: SHARE_META_COPY.live.title(facts.name),
    description: SHARE_META_COPY.live.description(facts.destination, dateRange(facts)),
    imagePath: coverImagePath('live', code, facts),
    imageAlt: COVER_ALT.live(facts.name),
    path: `/s/${code}`,
    // Same rule, stated once more because it is the whole of ADR-0213 §5.
    indexable: false,
  };
}

/**
 * **The range, and the isolate is NOT here** (ADR-0220's 2026-09-06 amendment).
 *
 * It was: `dateRange` wrapped the whole of `heTripRange` in `ltrIsolate`, on a measurement
 * taken against the same-month shape (`11–22 בספטמבר`, where a neutral sits between two
 * numbers and really does paint reversed). Applied to the whole string it forced a
 * left-to-right layout on Hebrew as well, and a real preview read
 * `גאורגיה, באוגוסט 5 – בספטמבר 28` (owner screenshot, 2026-09-05) — the month ahead of its
 * own day, in both halves.
 *
 * `heTripRange` now isolates the run that needs it and nothing else, which is the rule
 * `lib/bidi.ts` states: the isolate goes around the numeric island, never around the
 * sentence holding it.
 */
function dateRange(facts: TripPreviewFacts): string {
  return heTripRange(facts.startDate, facts.endDate);
}
