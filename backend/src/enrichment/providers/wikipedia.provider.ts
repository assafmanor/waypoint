// Wikipedia — the summary, `he` → `en` (ADR-0166 §11.5).
//
// The fallback is the whole point and it is a product-voice decision with a design
// obligation attached: Hebrew articles exist for **9 of 27** Tokyo places against 15 of 27 in
// English, so **most places that get a summary at all will show English prose in a
// Hebrew-first RTL app**. The owner kept summaries in Phase 1 and chose the fallback over
// dropping them; ADR-0167 §5's `באנגלית` marker is what keeps that honest. Storing the
// language on the value (§11.6) is what lets the marker exist at all.
//
// CC BY-SA, so **every value carries attribution** — the article URL — and a summary that
// arrived without one is refused by the storability guard rather than stored as an obligation
// we cannot discharge.
//
// **The REST summary's own image is never read.** §11.1: `thumbnail`/`originalimage` is not
// reliably a free photograph of the place — it returned a non-free logo for the Eiffel Tower
// and a map for Canal Saint-Martin. The image comes from Wikidata `P18` via Commons.
import { Injectable } from '@nestjs/common';
import {
  ENRICHMENT_FIELD,
  ENRICHMENT_SOURCE,
  MATCH_METHOD,
  SOURCE_POLICY,
  SUMMARY_LANG_PREFERENCE,
  type EnrichmentField,
  type EnrichmentSource,
} from '@waypoint/shared';
import type {
  EnrichmentProvider,
  PlaceIdentity,
  ProviderFieldValues,
  ProviderMatch,
} from '../enrichment.provider';
import { EnrichmentFetcher } from '../outbound-fetch';

/** The REST summary endpoint, per language edition. */
const summaryUrl = (lang: string, title: string) =>
  `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

/** `type` values that are not an article about the subject. A disambiguation page describes
 *  a *list of things called this*, which is the summary-shaped version of §11.2's wrong
 *  granularity. */
const NON_ARTICLE_TYPES = ['disambiguation', 'no-extract', 'mainpage'];

interface RestSummary {
  type?: string;
  title?: string;
  lang?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** The match `ref` encodes which article, per language, so `fetch` needs no second lookup and
 *  the stored provenance says exactly what was read. */
interface ArticleRefs {
  [lang: string]: string;
}

@Injectable()
export class WikipediaProvider implements EnrichmentProvider {
  readonly id: EnrichmentSource = ENRICHMENT_SOURCE.WIKIPEDIA;
  readonly provides: readonly EnrichmentField[] = [ENRICHMENT_FIELD.SUMMARY];
  readonly policy = SOURCE_POLICY.wikipedia;

  constructor(private readonly fetcher: EnrichmentFetcher) {}

  /**
   * Wikipedia does **no matching of its own**, and that is deliberate rather than a gap.
   *
   * The article titles arrive already settled, from the Wikidata item's sitelinks — so this
   * provider inherits the exact identity join the Wikidata pass established instead of
   * running a second, fuzzier name search of its own and risking a different answer for the
   * same place. If Wikidata refused, there is nothing here to be confident about.
   *
   * The confidence and method are carried over from the settling match for the same reason:
   * how much we trust this summary is exactly how much we trust that it is this place's
   * article.
   */
  async match(identity: PlaceIdentity): Promise<ProviderMatch | null> {
    const titles = identity.articleTitles;
    if (!titles || Object.keys(titles).length === 0) return null;
    const qid = identity.wikidataQid;
    if (!qid) return null;

    return {
      ref: qid,
      // The article title came from the item's sitelinks, which is an identity join —
      // never a guess about which page this is.
      method: MATCH_METHOD.SETTLED_ID,
      confidence: 1,
      evidence: { label: titles.he ?? titles.en },
      settled: { articleTitles: titles },
    };
  }

  async fetch(
    match: ProviderMatch,
    fields: readonly EnrichmentField[],
  ): Promise<ProviderFieldValues> {
    if (!fields.includes(ENRICHMENT_FIELD.SUMMARY)) return {};
    const titles = (match.settled?.articleTitles ?? {}) as ArticleRefs;

    // `he` then `en` — the first that yields a real extract wins, and the variants map means a
    // second language (or a translation) is one more entry later, not a migration (§11.6).
    for (const lang of SUMMARY_LANG_PREFERENCE) {
      const title = titles[lang];
      if (!title) continue;
      const summary = await this.summary(lang, title);
      if (!summary) continue;
      return { [ENRICHMENT_FIELD.SUMMARY]: summary };
    }
    return {};
  }

  private async summary(lang: string, title: string) {
    const body = await this.fetcher.fetchJson<RestSummary>(summaryUrl(lang, title));
    const extract = body.extract?.trim();
    if (!extract) return null;
    if (body.type && NON_ARTICLE_TYPES.includes(body.type)) return null;

    const page = body.content_urls?.desktop?.page;
    return {
      value: extract,
      // Required on prose (§11.6). The response's own `lang` is preferred over the edition we
      // asked, since an article can be served from a redirect in another edition.
      lang: body.lang ?? lang,
      license: SOURCE_POLICY.wikipedia.license ?? undefined,
      // CC BY-SA's credit is owed to the article's authors, and the article page is where the
      // history that names them lives — which is the attribution CC accepts for this medium.
      attribution: page,
    };
  }
}
