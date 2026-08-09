// **The converter** (ADR-0180 §3/§5) — the one surface that answers "so what is
// that, really?", reached by tapping the rate card and nothing else.
//
// It is where §5's minor-unit rule becomes load-bearing rather than a convention:
// the two fields hold **major-unit text**, which is what a person types, and the
// arithmetic happens in minor-unit integers. The two units meet at exactly two
// call sites (`toMinor` on the way in, `fromMinor` on the way out) and nowhere
// else — which is what keeps ¥, ₪ and KWD (exponents 0, 2 and 3) correct from
// one code path instead of three.
//
// What it deliberately does NOT have:
//
//  - **An error state.** ADR-0180 §4: absence is keyed on existence, not age, and
//    a pair the source cannot price degrades exactly like a set we never fetched
//    — a sentence, not a failure. Offline with a cached set is indistinguishable
//    from stale here, by design.
//  - **A "convert" button.** Both sides are live; typing in either drives the
//    other, and the swap turns the pair over.
import { useCallback, useMemo, useState } from 'react';
import { crossRate, type FxRates } from '@waypoint/shared';
import { t } from '../../i18n/he';
import { ltrIsolate } from '../../lib/bidi';
import { currencyExponent, currencySymbol, fromMinor, toMinor } from '../../lib/money';
import { Icon } from '../Icon';
import { Sheet } from '../Sheet';
import { CurrencyPicker } from '../primitives/CurrencyPicker';
import { rateLine } from './RateCard';
import './converter-sheet.css';

/** Which side the person is typing in. The other is derived, always — there is
 *  no third state where both are authored, and that is what stops the pair from
 *  drifting as the value round-trips through the rate. */
const SIDE = { FROM: 'from', TO: 'to' } as const;
type Side = (typeof SIDE)[keyof typeof SIDE];

/** Major-unit text → minor-unit integer, tolerating what a phone keypad emits.
 *  A comma is a decimal separator to most of the world and a thousands separator
 *  to the rest; here the field is one amount, so a bare comma is read as the
 *  point. Returns `null` for anything that is not a number — an empty field, a
 *  lone `.` mid-typing — which the caller renders as an empty other side rather
 *  than as `0`. */
function parseAmount(text: string, currency: string): number | null {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.');
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const major = Number(cleaned);
  return Number.isFinite(major) ? toMinor(major, currency) : null;
}

/** Minor-unit integer → the text the other field shows. Plain digits, not
 *  `formatMoney`: this is the content of an `<input>` the person may edit next,
 *  and a grouped, symbol-carrying string is not something they can type back. */
function amountText(minor: number, currency: string): string {
  // `toFixed` at the currency's OWN exponent, then trailing zeros dropped — so ¥
  // shows no point at all and ₪ shows agorot only when there are any. Asking the
  // runtime rather than assuming two places is the whole of §5 in one line.
  const text = fromMinor(minor, currency).toFixed(currencyExponent(currency));
  return text.includes('.') ? text.replace(/\.?0+$/, '') || '0' : text;
}

export function ConverterSheet({
  fx,
  from,
  to,
  asOf,
  canRefresh,
  onRefresh,
  onChangeFrom,
  onChangeTo,
  onSwap,
  onClose,
}: {
  fx: FxRates | null;
  from: string;
  to: string;
  /** The source's publication date, formatted by the host — this owns no clock. */
  asOf: string;
  /** §4: the control exists **only when a press could change the number**. The
   *  host computes it (`now > fx.nextUpdateAt`), because it owns the clock. */
  canRefresh: boolean;
  onRefresh: () => Promise<void>;
  onChangeFrom: (currency: string) => void;
  onChangeTo: (currency: string) => void;
  onSwap: () => void;
  onClose: () => void;
}) {
  const rate = fx ? crossRate(fx, from, to) : undefined;
  const priceable = rate !== undefined;

  const [side, setSide] = useState<Side>(SIDE.FROM);
  const [text, setText] = useState('1');
  const [picking, setPicking] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);

  const typedCurrency = side === SIDE.FROM ? from : to;
  const otherCurrency = side === SIDE.FROM ? to : from;
  /** The rate in the direction being typed. Crossing the other way is a second
   *  division, so it is taken from the same set rather than inverted by hand. */
  const typedRate = fx ? crossRate(fx, typedCurrency, otherCurrency) : undefined;

  const otherText = useMemo(() => {
    if (typedRate === undefined) return '';
    const minor = parseAmount(text, typedCurrency);
    if (minor === null) return '';
    return amountText(
      toMinor(fromMinor(minor, typedCurrency) * typedRate, otherCurrency),
      otherCurrency,
    );
  }, [text, typedRate, typedCurrency, otherCurrency]);

  /** Typing in the derived side makes it the authored one, carrying its current
   *  text across — so the switch is invisible rather than a reset to empty. */
  const type = useCallback(
    (which: Side, value: string) => {
      if (which !== side) setSide(which);
      setText(value);
    },
    [side],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }, [onRefresh]);

  const sideProps = (which: Side) => ({
    value: which === side ? text : otherText,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => type(which, e.target.value),
    'aria-label': which === SIDE.FROM ? t.fx.amountTrip : t.fx.amountHome,
    disabled: !priceable,
  });

  return (
    <Sheet title={t.fx.converterTitle} onClose={onClose}>
      <div className="cv">
        <div className={`cv-side${side === SIDE.FROM ? ' on' : ''}`}>
          <input className="cv-amt" inputMode="decimal" {...sideProps(SIDE.FROM)} />
          <CurrencyTrigger currency={from} onOpen={() => setPicking(SIDE.FROM)} />
        </div>

        {/* The swap sits ON the seam between the two sides, so the gesture reads
            as "turn this over" rather than as a third control. */}
        <div className="cv-swap-row">
          <span className="cv-rule" />
          <button type="button" className="cv-swap" aria-label={t.fx.swap} onClick={onSwap}>
            <Icon name="swap" />
          </button>
          <span className="cv-rule" />
        </div>

        <div className={`cv-side${side === SIDE.TO ? ' on' : ''}`}>
          <input className="cv-amt" inputMode="decimal" {...sideProps(SIDE.TO)} />
          <CurrencyTrigger currency={to} onOpen={() => setPicking(SIDE.TO)} />
        </div>

        <div className="cv-rate">
          {!priceable || !fx ? (
            <span>{fx ? t.fx.pairUnpriceable : t.fx.noRateYet}</span>
          ) : (
            <>
              <span className="mono" dir="auto">
                {rateLine(fx, from, to)}
              </span>
              <AsOf
                asOf={asOf}
                actionable={canRefresh}
                busy={busy}
                onRefresh={() => void refresh()}
              />
            </>
          )}
        </div>
      </div>

      {picking && (
        <CurrencyPicker
          value={picking === SIDE.FROM ? from : to}
          suggested={[from, to]}
          onChange={(currency) => {
            (picking === SIDE.FROM ? onChangeFrom : onChangeTo)(currency);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Sheet>
  );
}

/** The currency itself is a value that opens a picker, so it wears the hairline
 *  chip rather than inventing a box of its own (ADR-0177's grammar). Not the
 *  `ValueToken` component: that one is built for a value **inside a sentence**,
 *  and this is a form control in a row. */
function CurrencyTrigger({ currency, onOpen }: { currency: string; onOpen: () => void }) {
  const symbol = currencySymbol(currency);
  return (
    <button type="button" className="cv-cur" onClick={onOpen}>
      {symbol !== currency && <span dir="auto">{symbol}</span>}
      <span className="code" dir="auto">
        {currency}
      </span>
      <Icon name="caret" />
    </button>
  );
}

/**
 * **The "as of" IS the refresh** (ADR-0180 §4, mockup §8). Not a button beside
 * the date and not a second word: the date is the only thing a refresh changes,
 * so pressing it *is* the gesture, and the glyph is what says it is pressable.
 *
 * It renders as **plain text** when a press could not change the number — the
 * common case, where we hold the current set. A control that reliably does
 * nothing is what ADR-0133 §7 named, and worse, it implies the number is live
 * and so contradicts the date beside it. `ErrorState`'s "the retry button only
 * renders when the caller can actually recover" is the same rule at a dead end;
 * this applies it to a value.
 */
function AsOf({
  asOf,
  actionable,
  busy,
  onRefresh,
}: {
  asOf: string;
  actionable: boolean;
  busy: boolean;
  onRefresh: () => void;
}) {
  const label = t.fx.asOf(ltrIsolate(asOf));
  if (!actionable) return <span className="cv-asof">{label}</span>;
  return (
    <button
      type="button"
      className="cv-asof"
      // In flight the MARK spins and the DATE does not move or get replaced —
      // never a spinner where a fact used to be (ADR-0166 §6.4).
      data-busy={busy || undefined}
      disabled={busy}
      onClick={onRefresh}
    >
      <Icon name="reset" />
      <span>{label}</span>
    </button>
  );
}
