// **Which summary a reader sees, and whether it has to be marked** (ADR-0167 §5).
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
} from '@waypoint/shared';
import { t } from '../i18n/he';

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
