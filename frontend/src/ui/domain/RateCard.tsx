// **The rate, on the Home, as `מבט מהיר`'s first real tenant** (ADR-0180 §3).
//
// Not `GlanceCard*`: ADR-0045 repurposed that name for the day-at-a-glance TIME
// rail, and the concept here is a glance card but the name is taken.
//
// Three shape decisions the ADR fixed and this component is not free to re-open:
//
//  - **The card is a box holding one `<button>`**, and it used to BE the button.
//    ADR-0218's 2026-09-03 amendment §A split it: the skin is `.fx-card`, the
//    press is `.fx-face`, and the source line is the button's SIBLING rather than
//    its child. ADR-0180 §3's decision survives in substance — one target for the
//    whole card, still opening the converter — and what the split buys is the one
//    thing §9 could not have: a mandatory, linked attribution *inside* the card,
//    which is where the owner asked for it. Still no `⋯`, still no second target.
//  - **Absence is keyed on existence, not age** (§4). A cached set of any age
//    gets a card; only "we have never held one", or a pair this source cannot
//    price, returns nothing. Offline-with-a-cache is indistinguishable from
//    stale here by design, and there is **no error state on this surface**.
//  - **Nothing is spent from the colour budget** (§8). The rate is a numeric run
//    and the app's mono treatment already says "technical value"; amber stays
//    the clock's. The `▲/▼` change indicator is deliberately absent — it is the
//    one element here that *would* have needed a hue, and it serves a trader
//    rather than a traveller.
import { crossRate, type FxRates } from '@waypoint/shared';
import { t } from '../../i18n/he';
import { formatMoney, rateBase, toMinor } from '../../lib/money';
import { ltrIsolate } from '../../lib/bidi';
import { Icon } from '../Icon';
import { CardSource } from './CardSource';
import './rate-card.css';

type Props = {
  fx: FxRates | null;
  /** The trip's currency — what you pay in. */
  from: string | null | undefined;
  /** The member's home currency — what you think in. */
  to: string | null | undefined;
  /** The source's publication date, already formatted by the host (it owns the
   *  trip's zone and the app's date grammar; this component owns no clock). */
  asOf: string;
  onOpen: () => void;
};

/** `¥100 = ₪2.43` — stated at a base a person can hold rather than per unit, which
 *  at 360px is the difference between the line fitting and being ellipsised (§5).
 *
 *  Both sides go through `formatMoney`, so each carries **its own** exponent: the
 *  ¥ side has no decimals and the ₪ side has two, from one call each. `rateBase`
 *  answers in MAJOR units (what a person holds), so both go through `toMinor`
 *  before they are formatted — the two units meet only at that boundary (§5). */
export function rateLine(fx: FxRates, from: string, to: string): string | null {
  const rate = crossRate(fx, from, to);
  if (rate === undefined) return null;
  const base = rateBase(rate);
  return `${formatMoney(toMinor(base, from), from)} = ${formatMoney(toMinor(base * rate, to), to)}`;
}

export function RateCard({ fx, from, to, asOf, onOpen }: Props) {
  if (!fx || !from || !to) return null;
  const line = rateLine(fx, from, to);
  if (line === null) return null;

  return (
    <div className="fx-card">
      <button type="button" className="fx-face" onClick={onOpen}>
        <span className="ic" aria-hidden="true">
          <Icon name="currency" />
        </span>
        {/* `dir="auto"` and NOT `dir="ltr"` (ADR-0118, lint-blocked): the run opens
            with a symbol or a digit either way, and forcing the base direction of
            the element would lay a Hebrew currency name out unit-first. */}
        <span className="v" dir="auto">
          {line}
        </span>
        <span className="asof">{t.fx.asOf(ltrIsolate(asOf))}</span>
      </button>
      {/* The credit the source's terms make MANDATORY and visible, in the source's
          OWN wording — carried on the data (ADR-0180 §7) so a second provider needs
          no copy change to be credited correctly. */}
      <CardSource label={fx.provider} href={fx.providerUrl} />
    </div>
  );
}
