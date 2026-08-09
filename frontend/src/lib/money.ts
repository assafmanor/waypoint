// Money (ADR-0180 §5). Two rules, and the whole module is those two rules:
//
//  1. **An amount is a minor-unit integer.** ¥1,000 is `1000`, ₪24.31 is `2431`.
//     Nothing here or above it stores a float, and `Booking.cost` /
//     `dailyBudgetMinor`'s retired convention already said so — the `Minor`
//     suffix was the naming half of a rule the code never enforced.
//  2. **The exponent is asked of the runtime, never tabulated.** Same move as
//     `Intl.supportedValuesOf` replacing a curated IANA list (ADR-0113 §6): the
//     table exists, it ships with the engine, and it is already correct.
//
// What this replaces got (2) wrong in a way that read as a two-case problem.
// Its `ponytail:` comment said "correct for JPY … minor-unit currencies
// (ILS/USD) will need /100", and there are at least three cases:
//
//     JPY, ISK → 0        ILS, USD, EUR → 2        KWD, BHD, JOD → 3
//
// so `/100` would have been wrong for both ends of that range. The hardcoded
// `maximumFractionDigits: 0` is deleted rather than parameterised.
//
// **A rate is not an amount** and does not come through `formatMoney`: ILS
// carries two fraction digits and the rate ₪0.0243 needs four. `formatRate` is
// the other function, and it is deliberately not currency-styled.
import { APP_LOCALE } from '../constants';
import { CURRENCY_NAMES } from './currency-names';

/** Which slot of a `CURRENCY_NAMES` row to fall back to. */
const NAME = { HE: 0, EN: 1, NARROW: 2, WIDE: 3 } as const;

/** Ask the runtime, and fall back to the snapshot when it has nothing to say.
 *
 *  `Intl` signals "I don't know this currency" by handing back the CODE — which
 *  is a legitimate answer for a currency with no distinct symbol, and a data gap
 *  when it comes back for the NAME. An engine that ships without a currency does
 *  the latter for every field at once, which is how a currency can be present in
 *  the list and still unreachable by any word (ADR-0180 §6's amendment). */
function fromRuntimeOr(
  currency: string,
  slot: (typeof NAME)[keyof typeof NAME],
  read: () => string,
) {
  const value = read();
  if (value && value !== currency) return value;
  return CURRENCY_NAMES[currency]?.[slot] ?? currency;
}

/** How many decimal places this currency's minor unit implies — 0 for JPY, 2
 *  for ILS, 3 for KWD. Read from the runtime's own ISO-4217 data.
 *
 *  Throws for an ABSENT or badly-shaped currency exactly as `Intl` does, and
 *  that is deliberate: `formatMoney`'s test has guarded the `undefined` case
 *  since a currency-less trip blanked the whole screen (no ErrorBoundary), so
 *  callers check `trip.currency` before they get here. Swallowing it would move
 *  the failure somewhere quieter, not remove it.
 *
 *  It does NOT throw for a well-formed code ICU has never heard of — `ZZZ`
 *  resolves to 2 places and formats as `ZZZ`. That is why `currencyCodeSchema`
 *  validates shape only; there is no existence question ICU will answer. */
export function currencyExponent(currency: string): number {
  const { maximumFractionDigits } = new Intl.NumberFormat(APP_LOCALE, {
    style: 'currency',
    currency,
  }).resolvedOptions();
  // Typed optional because it IS optional for the other number styles; ECMA-402
  // always resolves it under `style: 'currency'`. The `?? 2` is not a shrug at
  // that — 2 is ISO-4217's own default minor unit, the value every currency
  // outside the published exception list carries, so the unreachable branch and
  // the standard's fallback happen to be the same number.
  return maximumFractionDigits ?? 2;
}

/** `1000, 'JPY'` → `¥1,000` · `2431, 'ILS'` → `₪24.31`. The input is a
 *  MINOR-UNIT INTEGER; passing major units silently under-reports by 100× in
 *  every currency that has a subunit. */
export function formatMoney(minorAmount: number, currency: string): string {
  const scale = 10 ** currencyExponent(currency);
  return new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency }).format(
    minorAmount / scale,
  );
}

/** Major → minor at the one boundary where a person's typing becomes storage.
 *
 *  The `toPrecision(15)` is not superstition and it is not the usual "floats are
 *  broken" hand-wave — it was measured. A bare `Math.round(major * scale)` is
 *  correct for **every** exactly-representable input (all 200,000 two-decimal
 *  values from 0.00 to 1,999.99 round-trip), so it is not losing agorot on real
 *  amounts. Where it differs is input carrying MORE precision than the currency
 *  has, and there it is not wrong-by-much, it is **arbitrary**: `1.005 → 100`
 *  but `1.015 → 102`, because which side of the halfway point the binary value
 *  lands on has nothing to do with the number the person typed. Rounding the
 *  decimal string first makes over-precise input round half-up consistently,
 *  which is the behaviour anyone typing it would predict. */
export function toMinor(majorAmount: number, currency: string): number {
  const scaled = majorAmount * 10 ** currencyExponent(currency);
  return Math.round(Number(scaled.toPrecision(15)));
}

/** Minor → major, for a field a person edits. The inverse of `toMinor`, and the
 *  only other place the two units are allowed to meet. */
export function fromMinor(minorAmount: number, currency: string): number {
  return minorAmount / 10 ** currencyExponent(currency);
}

/** A rate, which is a ratio and not money: significant digits rather than a
 *  currency's fraction digits, and no currency style at all. `0.024314` → `0.0243`. */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat(APP_LOCALE, { maximumSignificantDigits: 3 }).format(rate);
}

/** The base a person can hold in their head: the smallest power of ten whose
 *  converted value clears 1, so a rate reads `¥100 = ₪2.43` rather than
 *  `¥1 = ₪0.0243` (ADR-0180 §5). Not a formatting nicety — at 360px it is the
 *  difference between the line fitting and being ellipsised.
 *
 *  Capped at 100,000 so a collapsed currency cannot run the label off the card,
 *  and floored at 1 so an already-large rate is stated per unit. */
export function rateBase(rate: number): number {
  let base = 1;
  while (rate > 0 && rate * base < 1 && base < 100_000) base *= 10;
  return base;
}

/** The narrow symbol a price tag would use (`¥`, `₪`, `$`), falling back to the
 *  code itself for a currency that has none — which `Intl` signals by returning
 *  the code, so a caller comparing the two can tell.
 *
 *  The bidi marks `Intl` wraps a symbol in inside an RTL locale are STRIPPED.
 *  They are invisible, they make `symbol === code` false for every currency
 *  without a distinct symbol, and isolation belongs to `ltrIsolate` at the
 *  render site (ADR-0118) rather than smuggled inside a value. */
export function currencySymbol(currency: string): string {
  return fromRuntimeOr(currency, NAME.NARROW, () => symbolPart(currency, 'narrowSymbol'));
}

/** The **wide** symbol, which is a different string often enough to matter:
 *  `A$` vs `$`, `ISK` vs `kr`, `CN¥` vs `¥`. Not shown anywhere — it exists so a
 *  person can find a currency by the thing printed on a price tag. */
export function currencyWideSymbol(currency: string): string {
  return fromRuntimeOr(currency, NAME.WIDE, () => symbolPart(currency, 'symbol'));
}

function symbolPart(currency: string, display: 'narrowSymbol' | 'symbol'): string {
  try {
    const part = new Intl.NumberFormat(APP_LOCALE, {
      style: 'currency',
      currency,
      currencyDisplay: display,
    })
      .formatToParts(1)
      .find((p) => p.type === 'currency');
    return stripBidi(part?.value ?? currency);
  } catch {
    return currency;
  }
}

/** The currency's display name in the app locale — "ין יפני", "שקלים חדשים".
 *  From the runtime, so there is no name table to translate or age. */
export function currencyName(currency: string, locale: string = APP_LOCALE): string {
  return fromRuntimeOr(currency, locale === APP_LOCALE ? NAME.HE : NAME.EN, () => {
    try {
      const part = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'name',
      })
        .formatToParts(1)
        .find((p) => p.type === 'currency');
      return part?.value ?? currency;
    } catch {
      return currency;
    }
  });
}

/** LRM / RLM / ALM and the isolate pair — see `currencySymbol`. */
const stripBidi = (value: string): string => value.replace(/[‎‏؜⁦-⁩]/g, '').trim();
