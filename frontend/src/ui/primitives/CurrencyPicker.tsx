// The shared currency picker (ADR-0180 §6) — `ZonePicker`'s sibling over
// `Intl.supportedValuesOf('currency')`, the runtime's own ISO-4217 set.
//
// The set is ~160 codes against the five `CURRENCY_OPTIONS` this replaces, and
// it needs no dataset shipped and none maintained — exactly the argument ADR-0113
// §6 made for zones, one `supportedValuesOf` argument over.
//
// Both call sites choose a currency the same way: the trip's (trip settings) and
// the person's own (user settings). Neither owns the sheet — `CodePicker` does.
import { currencyName, currencySymbol } from '../../lib/money';
import { t } from '../../i18n/he';
import { CodePicker } from './CodePicker';

/** The runtime's complete ISO-4217 set, read once. Empty on a runtime without
 *  `supportedValuesOf` — search then only matches suggested, same as zones. */
const ALL_CURRENCIES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : [];

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
      matches={(currency, q) =>
        currency.toLowerCase().includes(q) ||
        currencyName(currency).toLowerCase().includes(q) ||
        currencySymbol(currency).toLowerCase().includes(q)
      }
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
