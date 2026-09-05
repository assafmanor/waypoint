import { ltrIsolate } from '@waypoint/shared';
import { heTripRange, SHARE_META_COPY } from '../sharing/hebrew.copy';
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
const COVER = {
  brand: '/og-cover.png',
  invite: '/og-invite.png',
  live: '/og-live.png',
} as const;

/** `og:image:alt`. Describes the cover, never the trip — the image is the same PNG for every
 *  trip, and an alt text that named one would be a caption for a picture that is not there. */
const COVER_ALT = {
  brand: 'הלוגו של Travelive על רקע כהה',
  invite: 'כרטיס הזמנה לטיול על רקע כהה, בסגנון כרטיס עלייה למטוס',
  live: 'ראש העמוד של לו״ז חי ב-Travelive, עם סימון שהמסלול מתעדכן',
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
    imagePath: COVER.invite,
    imageAlt: COVER_ALT.invite,
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
    imagePath: COVER.live,
    imageAlt: COVER_ALT.live,
    path: `/s/${code}`,
    // Same rule, stated once more because it is the whole of ADR-0213 §5.
    indexable: false,
  };
}

/**
 * **The range, isolated — and this is the one line in the file that came out of rendering
 * the mockup rather than reading anything.**
 *
 * `אוסקה, 11–22 בספטמבר.` leads with Hebrew, so the element resolves RTL and the numeric run
 * inside it paints as `22–11` (ADR-0118; the same defect
 * `day-scheduling-grammar-v1.html` found shipped). Measured, not eyeballed: the two numbers'
 * painted x differ by −18px raw and +18px isolated.
 *
 * `ltrIsolate` emits U+2066/U+2069, which a `<meta>` attribute carries like any other text —
 * the tag is a string, not markup, and the consumer's own text layout honours the controls.
 * It is the app's own helper, not a local copy, for the reason the sweep in ADR-0213 exists.
 */
function dateRange(facts: TripPreviewFacts): string {
  return ltrIsolate(heTripRange(facts.startDate, facts.endDate));
}
