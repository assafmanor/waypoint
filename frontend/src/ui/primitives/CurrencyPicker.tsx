// The shared currency picker (ADR-0180 §6) — `ZonePicker`'s sibling over
// `Intl.supportedValuesOf('currency')`, the runtime's own ISO-4217 set.
//
// The set is ~160 codes against the five `CURRENCY_OPTIONS` this replaces, and
// it needs no dataset shipped and none maintained — exactly the argument ADR-0113
// §6 made for zones, one `supportedValuesOf` argument over.
//
// Both call sites choose a currency the same way: the trip's (trip settings) and
// the person's own (user settings). Neither owns the sheet — `CodePicker` does.
import { COUNTRY_CURRENCY } from '@waypoint/shared';
import { currencyMatchesQuery } from '../../lib/currency-search';
import { currencyName, currencySymbol } from '../../lib/money';
import { t } from '../../i18n/he';
import { CodePicker } from './CodePicker';

/**
 * **The runtime's set, UNIONED with our own** — and the union is not belt-and-
 * braces, it is the fix for a currency that could not be reached at all.
 *
 * ADR-0180 §6 chose `Intl.supportedValuesOf('currency')` over a shipped list, and
 * that choice stands: it is ~160 codes that need no maintenance. What the ADR
 * assumed, and what the comment here used to assert outright, is that the answer
 * is **complete**. It is not. On a real phone the list came back without `ISK`,
 * which is how an Iceland trip could not pick the Icelandic króna by its code, by
 * `איסלנד`, or by anything else — and the tell was that `כתר` returned the Danish,
 * Norwegian and Swedish krónur and not the Icelandic one, i.e. the row was absent
 * rather than unmatched. Node's full-ICU build does answer `ISK`, which is exactly
 * why this survived every check that was not made on the device.
 *
 * So the runtime is still the source for BREADTH, and `COUNTRY_CURRENCY` is the
 * floor for the currencies this app can actually need: every one of its 152 codes
 * was validated against `Intl` when the table was written, and a destination the
 * app offers must never be un-pickable because an engine trimmed its data. The
 * old degenerate case (no `supportedValuesOf` at all) stops being special — it is
 * just the union with an empty first half.
 *
 * A code the engine does not know still renders and still works: `currencyName`
 * and `currencySymbol` fall back to the code, `currencyExponent` answers
 * ISO-4217's default of 2, and the search reaches it by code, by country and by
 * alias.
 */
const ALL_CURRENCIES: string[] = [
  ...new Set([
    ...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : []),
    ...Object.values(COUNTRY_CURRENCY),
  ]),
].sort();

/** The one-line label a trigger shows: "ין יפני · ¥ · JPY". The symbol is
 *  dropped when the runtime has none for this currency and hands back the code
 *  instead, which would otherwise print the code twice in one label. */
export function currencyLabel(currency: string): string {
  const symbol = currencySymbol(currency);
  return symbol === currency
    ? `${currencyName(currency)} · ${currency}`
    : `${currencyName(currency)} · ${symbol} · ${currency}`;
}

export function CurrencyPicker({
  value,
  onChange,
  onClose,
  suggested = [],
}: {
  /** The current currency (highlighted + always surfaced in the suggested group). */
  value?: string;
  onChange: (currency: string) => void;
  onClose: () => void;
  /** Currencies to surface first — the destination's, the member's own, the
   *  device region's — before the full list. */
  suggested?: string[];
}) {
  return (
    <CodePicker
      kind="currency"
      all={ALL_CURRENCIES}
      suggested={suggested}
      value={value}
      onChange={onChange}
      onClose={onClose}
      row={(currency) => {
        const symbol = currencySymbol(currency);
        return {
          primary: currencyName(currency),
          secondary: currency,
          // `Intl` returns the CODE when a currency has no distinct symbol, so
          // an unconditional trailing slot printed "ALL ALL" on one row.
          trailing: symbol === currency ? undefined : symbol,
        };
      }}
      // Every name the currency has, not only CLDR's one — `lib/currency-search.ts`
      // holds what that covers and why the first version's three terms were a much
      // narrower door than they read like.
      matches={currencyMatchesQuery}
      copy={{
        title: t.currencyPicker.title,
        searchPlaceholder: t.currencyPicker.searchPlaceholder,
        suggested: t.currencyPicker.suggested,
        all: t.currencyPicker.allCurrencies,
        noResults: t.currencyPicker.noResults,
      }}
    />
  );
}
