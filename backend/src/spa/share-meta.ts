import { ltrIsolate } from '@waypoint/shared';
import { heTripRange, SHARE_META_COPY } from '../sharing/hebrew.copy';
import type { ShareMeta } from './spa-shell.service';

/**
 * **The two covers** (ADR-0220 §2-3), cut from
 * `frontend/public/og-cover.svg` / `og-invite.svg` by `scripts/gen-app-icons.mjs`.
 *
 * Both are board-plus-a-paper-band rather than the plain board tile the app icon is, and
 * that is a measurement rather than a preference: against a WhatsApp bubble the board alone
 * is 17.9:1 in a light chat and **1.25:1** in a dark one, paper alone is 1.15:1 and 12.48:1,
 * so neither single ground clears the 3:1 graphic floor in both. A two-region cover needs
 * only one region with an edge (`mockups/the-app-is-seen-before-it-is-opened-v1.html` §2).
 */
const COVER = {
  brand: '/og-cover.png',
  invite: '/og-invite.png',
} as const;

/** `og:image:alt`. Describes the cover, never the trip — the image is the same PNG for every
 *  trip, and an alt text that named one would be a caption for a picture that is not there. */
const COVER_ALT = {
  brand: 'הלוגו של Travelive על רקע כהה, ומתחתיו הכיתוב מרכז שליטה לטיול',
  invite: 'כרטיס הזמנה לטיול על רקע כהה, עם הלוגו של Travelive',
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

/** `/s/<code>` — the read-only live itinerary. */
export function liveMeta(code: string, facts: TripPreviewFacts): ShareMeta {
  return {
    title: SHARE_META_COPY.live.title(facts.name),
    description: SHARE_META_COPY.live.description(facts.destination, dateRange(facts)),
    imagePath: COVER.brand,
    imageAlt: COVER_ALT.brand,
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
