// **What the day says between two rows** (ADR-0159) — two components, because the two
// facts are opposites and must not share a shape.
//
// `GapStrip` is Plan mode's `.gap` slot with the CONTROL taken out of it: the same flex row,
// the same dashed hairline, the same 9px rhythm. It was a `<span>` where Plan has a
// `<button>` — and ADR-0161 §9 amended that, because ADR-0025's Tier-1 list already contains
// "schedule-from-shelf onto today", so filling a hole on the ground is on-the-ground work and
// the one shipped surface that STATES the hole was the one place it could not be done.
//
// So the strip keeps its measurement and gains one tap: same words, same hue (none), a
// trailing `＋` at the touch floor, and no violet and no `שבץ` — those are Plan's. The two
// modes differ in POSTURE now, which was ADR-0159 §1's actual claim, rather than in
// capability: Plan offers, Trip answers when asked.
//
// `ConnectionBand` is not a mark between two cards at all — it is a band INSIDE the
// journey block that holds both legs (`.journey`, painted by the day view). The first
// draft was a dotted rail in the badge column and it did not survive a phone: a rail is
// a connector, so it has to touch both things it connects, and one that keeps the list's
// rhythm floats between them — then a now-line lands in the middle and cuts it. A block
// has nothing to sit between.
//
// Amber, because a connection is time inside a COMMITMENT (rule 4's own words) — but
// amber-deep TEXT on a tinted ground, never a filled pill: an amber pill on a line is
// `.nowline`, and the app gets one live mark.
//
// `ui/domain/`: presentational, every value via props.
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import './day-join.css';

/** Free time between two rows, stated — and offered, where the host can act on it.
 *  `length` is the shared elapsed phrase (`hoursPhrase`, ADR-0114): the precise one, not
 *  Plan's rounded `gapLabel`, because a statement has to be a measurement (ADR-0159 §2).
 *
 *  `onFill` is what makes it a control. Absent it stays the `<span>` row it was — a past day
 *  is read-only (ADR-0029), and a strip that looks tappable and is not would be worse than
 *  the statement it replaced. */
export function GapStrip({ length, onFill }: { length: string; onFill?: () => void }) {
  const body = (
    <>
      <span className="day-gap-line" />
      <span className="day-gap-lbl">{t.day.join.free(length)}</span>
      <span className="day-gap-line" />
      {onFill && (
        <span className="day-gap-add" aria-hidden="true">
          <Icon name="plus" />
        </span>
      )}
    </>
  );
  if (!onFill) return <div className="day-gap">{body}</div>;
  return (
    <button
      type="button"
      className="day-gap"
      onClick={onFill}
      aria-label={t.day.join.fillFree(length)}
    >
      {body}
    </button>
  );
}

export function ConnectionBand({
  /** The transport mode's own word: a flight stops over, a train changes. */
  word,
  length,
  placeName,
  tight,
}: {
  word: string;
  length: string;
  placeName?: string;
  tight: boolean;
}) {
  return (
    <div className={'journey-stop' + (tight ? ' tight' : '')}>
      <Icon name="clock" />
      <span>{t.day.join.text(tight ? t.day.join.short(word) : word, length, placeName)}</span>
    </div>
  );
}
