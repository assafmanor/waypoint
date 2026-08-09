// Where rates come from (ADR-0180 §7).
//
// **A declared provider behind a registry-shaped interface, with exactly one
// implementation today.** That is deliberate and it is the shape ADR-0166 §5
// already established for enrichment, not a speculative abstraction: the ADR's
// coverage amendment leaves the ECB on the table as a *second* provider for the
// majors it is authoritative on, and the whole point of the measured comparison
// was that the choice is data-dependent and could move. One interface makes that
// a file; no interface makes it a rewrite.
//
// What is NOT copied from enrichment: the field-level precedence machinery. Rates
// are one indivisible set from one publisher — there is no merging two sources
// per-field, because a EUR/USD from one and a JPY/USD from another would not
// cross-rate consistently. So the registry here is "which provider answered",
// not "which provider won this field".
import { z } from 'zod';
import { currencyCodeSchema, type FxRates } from '@waypoint/shared';
import { EnrichmentFetcher } from '../enrichment/outbound-fetch';
import { FX_FETCH_TIMEOUT_MS } from '../common/env';

/** DI token — Nest cannot inject a TypeScript interface. */
export const FX_PROVIDER = Symbol('FX_PROVIDER');

export interface FxProvider {
  readonly id: string;
  /** Rendered as the attribution the source requires, and carried on the row so
   *  a second provider needs no frontend change to be credited. */
  readonly attribution: string;
  readonly attributionUrl: string;
  /** Fetch the current set, or throw. The caller never lets a throw escape. */
  fetch(): Promise<FxRates>;
}

/** The Open Access response, validated rather than trusted — this is a third
 *  party's JSON reaching a global row that every trip reads. Only the fields we
 *  use are described; the rest is ignored by zod's default stripping. */
const openAccessResponseSchema = z.object({
  result: z.literal('success'),
  base_code: currencyCodeSchema,
  /** Unix seconds. Both timestamps come from the SOURCE — using our clock for
   *  either is the mistake §4 exists to prevent. */
  time_last_update_unix: z.number().int().positive(),
  time_next_update_unix: z.number().int().positive(),
  /** Deliberately `unknown` per entry rather than `number`. A strict record
   *  rejects the WHOLE document when one value is odd, which is the opposite of
   *  the intent below — a set of 160 good rates must survive one bad one. The
   *  filtering happens after the parse, where it can drop per entry. */
  rates: z.record(z.string(), z.unknown()),
});

/**
 * ExchangeRate-API's Open Access endpoint — chosen on measured coverage
 * (151 of the app's 152 codes, against the ECB's 30) plus two things the
 * coverage column does not show: it publishes `time_next_update_unix`, which
 * turns §4's refresh rule from a client-side inference about business days into
 * a comparison; and its terms name our exact use, expressly permitting caching
 * and commercial end-use while prohibiting only re-exposing the raw rates as a
 * data service, which this app does not do.
 *
 * The attribution below is **mandatory and visible** under those terms, which is
 * why it is data on the row rather than a string at a surface.
 */
export class ExchangeRateApiProvider implements FxProvider {
  readonly id = 'exchangerate-api';
  readonly attribution = 'Rates By Exchange Rate API';
  readonly attributionUrl = 'https://www.exchangerate-api.com';

  /** USD base. Any base works — every pair is crossed through it — and USD is
   *  the one this endpoint serves without a key. */
  private readonly base = 'USD';

  constructor(private readonly fetcher: EnrichmentFetcher) {}

  async fetch(): Promise<FxRates> {
    const raw = await this.fetcher.fetchJson<unknown>(
      `https://open.er-api.com/v6/latest/${this.base}`,
      { timeoutMs: FX_FETCH_TIMEOUT_MS },
    );
    const res = openAccessResponseSchema.parse(raw);

    // Drop anything that is not a well-formed code, and anything non-positive —
    // the wire schema requires both, and one bad entry must not reject a set of
    // 160 good ones. The provider's own list has included non-ISO entries before
    // (`CNH`, `XDR`), which are harmless to keep and harmless to lose.
    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(res.rates)) {
      if (
        /^[A-Z]{3}$/.test(code) &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value > 0
      ) {
        rates[code] = value;
      }
    }
    // The base is always priceable against itself, whatever the response says.
    rates[res.base_code] = 1;

    return {
      base: res.base_code,
      rates,
      publishedAt: new Date(res.time_last_update_unix * 1000).toISOString(),
      nextUpdateAt: new Date(res.time_next_update_unix * 1000).toISOString(),
      provider: this.attribution,
      providerUrl: this.attributionUrl,
    };
  }
}
