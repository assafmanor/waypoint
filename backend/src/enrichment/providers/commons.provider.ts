// Wikimedia Commons — the image, and **the per-file license that makes storing it lawful**
// (ADR-0166 §11.1 / §12.1–§12.2).
//
// This provider exists because of the amendment that would otherwise have caused a licensing
// breach. The naive path — take the image the Wikipedia REST summary hands back — returned a
// **non-free logo** for the Eiffel Tower and **a map** for Canal Saint-Martin. So the image is
// resolved through Wikidata `P18` (the pointer this provider matches on) and then has its own
// license read here, on the file, before anything is stored. No amount of per-file license
// *storage* would have helped if the file itself was the wrong one.
//
// Two things it does NOT do:
//
//  - **It does not resize.** `iiurlwidth` hands back a thumbnail Commons already generated, so
//    there is no image-processing dependency anywhere in the backend (§12.1).
//  - **It does not store.** A provider stays pure (§5.3): this returns the bucket's URL plus
//    the facts about it, and the orchestrator materializes the bytes through the
//    subject-agnostic image pipeline.
import { Injectable } from '@nestjs/common';
import {
  ENRICHMENT_FIELD,
  ENRICHMENT_IMAGE_NOMINAL_WIDTH_PX,
  ENRICHMENT_SOURCE,
  MATCH_METHOD,
  SOURCE_POLICY,
  type EnrichmentField,
  type EnrichmentSource,
} from '@waypoint/shared';
import {
  inheritedConfidence,
  type EnrichmentProvider,
  type PlaceIdentity,
  type ProviderFieldValues,
  type ProviderMatch,
  type ProviderValue,
} from '../enrichment.provider';
import { EnrichmentFetcher } from '../outbound-fetch';

const API = 'https://commons.wikimedia.org/w/api.php';

/** `extmetadata` keys we read. Commons exposes these per file, which is the whole reason this
 *  provider owns the image rather than Wikidata (whose own CC0 says nothing about the file). */
const META_LICENSE_SHORT = 'LicenseShortName';
const META_USAGE_TERMS = 'UsageTerms';
const META_ARTIST = 'Artist';
const META_CREDIT = 'Credit';
const META_ATTRIBUTION_REQUIRED = 'AttributionRequired';

interface ImageInfo {
  url?: string;
  descriptionurl?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
  extmetadata?: Record<string, { value?: unknown }>;
}

interface ImageInfoResponse {
  query?: {
    pages?: Record<string, { title?: string; missing?: string; imageinfo?: ImageInfo[] }>;
  };
}

@Injectable()
export class CommonsProvider implements EnrichmentProvider {
  readonly id: EnrichmentSource = ENRICHMENT_SOURCE.COMMONS;
  readonly provides: readonly EnrichmentField[] = [ENRICHMENT_FIELD.IMAGE];
  readonly policy = SOURCE_POLICY.commons;

  constructor(private readonly fetcher: EnrichmentFetcher) {}

  /**
   * Matched entirely on the `P18` filename Wikidata settled — an exact pointer, so there is
   * no fuzzy matching here at all and no second chance to pick the wrong file.
   *
   * The confidence is **inherited**, not claimed: reaching the file is exact, but the item
   * that named it may itself have been matched by name and proximity, and a photograph must
   * not launder that away.
   */
  async match(identity: PlaceIdentity): Promise<ProviderMatch | null> {
    const filename = identity.commonsFilename;
    if (!filename) return null;

    return {
      ref: filename,
      method: MATCH_METHOD.SETTLED_ID,
      confidence: inheritedConfidence(identity),
      evidence: { label: filename },
      settled: { commonsFilename: filename },
    };
  }

  async fetch(
    match: ProviderMatch,
    fields: readonly EnrichmentField[],
  ): Promise<ProviderFieldValues> {
    if (!fields.includes(ENRICHMENT_FIELD.IMAGE)) return {};
    const filename = match.settled?.commonsFilename ?? match.ref;

    const info = await this.imageInfo(filename);
    if (!info) return {};

    // The thumbnail bucket, never the original: the spike found originals up to 26.3 MB, and
    // `thumburl` is a working server-generated thumbnail at 36–250 KB for every file it tried.
    const url = info.thumburl;
    if (!url) return {};

    const license = licenseOf(info);
    // No license means an obligation of unknown size. Returned anyway rather than dropped, so
    // the storability guard is the single place that decides what may be kept — and so the
    // recorded refusal reason says *why* rather than just "nothing found".
    const value: ProviderValue = {
      // The file page, so a credit line has somewhere to point (ADR-0167 §4).
      value: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${filename}`,
      license: license ?? undefined,
      attribution: attributionOf(info),
      attributionRequired: attributionRequiredOf(info),
      binary: {
        url,
        // **The bucket's own dimensions, not the original's.** §11.4 said to store the
        // original's, written when §7 still assumed we would resize ourselves; §12.1 replaced
        // that with "fetch the bucket Commons already generated", so the honest successor is
        // the dimensions of the bytes we actually hold. The aspect ratio §11.4 needs for a
        // layout that survives a 0.54 portrait is identical either way.
        width: info.thumbwidth ?? info.width ?? 0,
        height: info.thumbheight ?? info.height ?? 0,
      },
    };
    return { [ENRICHMENT_FIELD.IMAGE]: value };
  }

  private async imageInfo(filename: string): Promise<ImageInfo | null> {
    const url = new URL(API);
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('titles', titleOf(filename));
    url.searchParams.set('iiprop', 'url|size|mime|extmetadata');
    // A nominal ask: MediaWiki rounds up to its own buckets (§12.1), so whatever comes back is
    // the answer and `thumbwidth` is what the bytes actually are.
    url.searchParams.set('iiurlwidth', String(ENRICHMENT_IMAGE_NOMINAL_WIDTH_PX));

    const body = await this.fetcher.fetchJson<ImageInfoResponse>(url.toString());
    const pages = Object.values(body.query?.pages ?? {});
    // A missing file comes back as a page with `missing: ''` (and often id `-1`) rather than
    // an error, so "no image" reads as a normal absence here too.
    const page = pages.find((p) => !p.missing && p.imageinfo?.length);
    return page?.imageinfo?.[0] ?? null;
  }
}

/** Commons titles are `File:`-namespaced; Wikidata's `P18` gives the bare filename. */
function titleOf(filename: string): string {
  return filename.startsWith('File:') ? filename : `File:${filename}`;
}

/** `extmetadata` values arrive as HTML — `Artist` is very often an `<a>` to a user page — so
 *  every one is reduced to text before it can reach a credit line. Not cosmetic: these
 *  strings are third-party content rendered into our UI, and stripping at the door means no
 *  surface downstream has to remember to. */
function metaText(info: ImageInfo, key: string): string | undefined {
  const raw = info.extmetadata?.[key]?.value;
  if (typeof raw !== 'string') return undefined;
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
}

/** The license **string**, verbatim — never a normalized enum. Nine distinct strings appeared
 *  across 32 files, including regional ports (`CC BY-SA 3.0 de`) and older versions
 *  (`CC BY-SA 2.5`), and ADR-0167 §4 renders what is stored. `LicenseShortName` is the one a
 *  credit line wants; `UsageTerms` is the fallback for a file whose short name is missing —
 *  which is how the GFDL-only case presents (§12.2: an empty machine-readable `License`). */
function licenseOf(info: ImageInfo): string | undefined {
  return metaText(info, META_LICENSE_SHORT) ?? metaText(info, META_USAGE_TERMS);
}

/** Who to credit: the author, else whatever `Credit` says. */
function attributionOf(info: ImageInfo): string | undefined {
  return metaText(info, META_ARTIST) ?? metaText(info, META_CREDIT);
}

/** Whether *this file* demands visible credit. Per file, not per source: 27 of 32 do and 5
 *  genuinely do not (§12.2). Absent → fall back to the source policy, which says yes, because
 *  assuming credit is owed is the safe direction. */
function attributionRequiredOf(info: ImageInfo): boolean | undefined {
  const raw = metaText(info, META_ATTRIBUTION_REQUIRED);
  if (raw === undefined) return undefined;
  return raw.toLowerCase() !== 'false';
}
