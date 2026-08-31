// **How an enrichment value reads** — the display answers for what the pipe delivers (ADR-0167).
//
// Two of them so far, and they belong together because both are "the stored value is not what
// you render": the summary needs a language chosen and marked (§5), and the credit needs its
// Latin run isolated inside an RTL line (§4/§8.2).
//
// ── the summary ────────────────────────────────────────────────────────────────────────────
//
// The resolution itself is `@waypoint/shared`'s (`resolveTextVariant` over
// `SUMMARY_LANG_PREFERENCE`) because the variants map and its `he` → `en` fallback are the
// store's shape, not this app's. What lives here is the reader-facing half: the **marker**.
//
// It is not a nicety. Hebrew articles exist for 9 of 27 Tokyo places against 15 of 27 in
// English (ADR-0166 §11.5), so **most places that get a summary at all show English in a
// Hebrew RTL app** — and unmarked, that reads as a defect rather than as a fact about
// Wikipedia. One word in the row's existing tag grammar is what keeps it honest.
import {
  SUMMARY_LANG_PREFERENCE,
  resolveTextVariant,
  type DeliveredEnrichmentFields,
  type DeliveredImageValue,
} from '@waypoint/shared';
import { t } from '../i18n/he';
import { DOT_SEPARATOR } from '../constants';
import { autoIsolate, ltrIsolate } from './bidi';

/** The prose to render, plus the one word that names its language when it is not ours. */
export interface PlaceSummary {
  text: string;
  /** The variant's own language, for `lang` on the element that holds the prose. */
  lang: string;
  /** `באנגלית`, or absent when the summary is already Hebrew. */
  marker?: string;
}

/**
 * The summary for a place, or `undefined` when there is nothing to show — which is the
 * common case (ADR-0166 §11.3) and renders as nothing at all, per ADR-0109 §7.
 *
 * The marker is looked up rather than derived: a language we have no Hebrew word for gets
 * **no marker instead of an invented one**, and the pipe cannot produce one today (the
 * providers fetch `he` then `en`). If a third language ever arrives, the fix is a word in
 * `i18n/he.ts`, not a code change here.
 */
export function placeSummary(fields?: DeliveredEnrichmentFields): PlaceSummary | undefined {
  const variant = fields?.summary && resolveTextVariant(fields.summary, SUMMARY_LANG_PREFERENCE);
  if (!variant) return undefined;
  return {
    text: variant.value,
    lang: variant.lang,
    marker: t.map.know.langMarker[variant.lang],
  };
}

/* ── the credit ──────────────────────────────────────────────────────────────────────────── */

/**
 * **Photographer · license, as one RTL-safe line** (ADR-0167 §4).
 *
 * Two rules, both of which have already cost something:
 *
 *  - **The license string is rendered verbatim.** Nine distinct strings appeared across 32 files
 *    (`CC BY-SA 3.0 de`, `CC BY-SA 2.5`, CC0, PD…), which is why ADR-0166 §4 stores the string
 *    rather than an enum and why nothing here maps it to a label.
 *  - **The Latin run is isolated, and the element stays RTL** (§8.2). `dir="auto"` on a Latin
 *    credit turns the WHOLE element left-to-right: correct internal order, then aligned to the
 *    opposite edge from every other line on the card, visually detached from the image it
 *    credits. That is the mirror image of the bug ADR-0118 was written for, and its lint guard
 *    cannot see it — the guard reads `dir` attributes, and here the defect is a missing isolate.
 *
 * Absent attribution is normal, not an error: 5 of 32 files owe no credit at all, and the
 * license alone is then the whole line.
 */
export function placeCredit(image: DeliveredImageValue): string {
  const license = ltrIsolate(image.license);
  return image.attribution
    ? `${autoIsolate(image.attribution)} ${DOT_SEPARATOR} ${license}`
    : license;
}
