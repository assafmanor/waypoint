// Exchange rates, as a shape and one derived fact (ADR-0180 §4/§7).
//
// The store is **global** — one set of rates for the whole install, not per trip —
// which puts it in exactly the category ADR-0166 §1 drew a line around: the
// trip's opinion stays trip-scoped, the world's facts go global. It therefore
// joins the snapshot as a server-owned read model, carries no `Change`, and no
// client writes it.
//
// Two things live here rather than in either app, both because both apps need
// them (`packages/shared/CLAUDE.md`): the wire shape, and `crossRate` — a pure
// function over that shape which the frontend needs to render and the backend
// needs to answer "can we price this pair at all".
import { z } from 'zod';
import { currencyCodeSchema } from './currency';

export const fxRatesSchema = z.object({
  /** The base every rate below is quoted against. One base is stored and every
   *  pair is crossed through it (`crossRate`), because a converter needs
   *  arbitrary pairs and no free source quotes all ~25,000 of them. */
  base: currencyCodeSchema,
  /** `code → units of that code per one unit of `base``. Includes the base
   *  itself at 1, so a caller never special-cases it. */
  rates: z.record(currencyCodeSchema, z.number().positive()),
  /** **The SOURCE's publication time, not our fetch time** (ADR-0180 §4). A
   *  reference rate is published on a schedule, so a set fetched five minutes
   *  ago can legitimately be a day old and still be current. This is the value
   *  the "as of" renders; `fetchedAt` stays server-side, where it belongs. */
  publishedAt: z.string(),
  /** When the source says the next set will exist. This is the field that makes
   *  ADR-0180 §4's refresh rule exact rather than inferred: "a press could
   *  change the number" is `now > nextUpdateAt`, instead of a client-side guess
   *  about which days are business days in which calendar. */
  nextUpdateAt: z.string(),
  /** Who said so. Rendered as the attribution the source's terms require, so it
   *  travels with the data rather than being hardcoded at a surface. */
  provider: z.string(),
  /** The attribution's link target, likewise carried rather than hardcoded — a
   *  second provider must not need a frontend change to be credited correctly. */
  providerUrl: z.string(),
});
export type FxRates = z.infer<typeof fxRatesSchema>;

/** The rate to convert **one unit of `from` into units of `to`**, or `undefined`
 *  when either side is not in the set.
 *
 *  `undefined` is a first-class answer and not an error: no free source prices
 *  every ISO-4217 code (the chosen one misses KPW), and the picker deliberately
 *  offers every code the runtime knows. An unpriceable pair therefore degrades
 *  exactly like a rate we have never fetched — no card, and the converter says
 *  so — rather than throwing at a render site.
 *
 *  Crossing through the base is exact enough for display: both legs come from
 *  one published set, so the only error is the source's own rounding, and the
 *  result is shown to three significant digits anyway. */
export function crossRate(fx: FxRates, from: string, to: string): number | undefined {
  if (from === to) return 1;
  const fromRate = fx.rates[from];
  const toRate = fx.rates[to];
  if (!fromRate || !toRate) return undefined;
  return toRate / fromRate;
}

/** Whether this pair can be priced at all — the question the card asks before it
 *  decides to exist. Separate from `crossRate` because "no rate" is a state a
 *  surface renders, not a number it formats. */
export const canPrice = (fx: FxRates | null | undefined, from: string, to: string): boolean =>
  !!fx && crossRate(fx, from, to) !== undefined;
