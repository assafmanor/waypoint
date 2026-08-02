// **What the day says between two rows** (ADR-0159) — two components, because the two
// facts are opposites and must not share a shape.
//
// `GapStrip` is Plan mode's `.gap` slot with the control taken out of it: the same flex
// row, the same dashed hairline, the same 9px rhythm, a `<span>` where Plan has a
// `<button>`. Trip mode STATES the hole; Plan mode offers to fill it (ADR-0116 §5), and
// that difference is the only one there should be.
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

/** Free time between two rows, stated. `length` is the shared elapsed phrase
 *  (`hoursPhrase`, ADR-0114) — the precise one, not Plan's rounded `gapLabel`: a
 *  statement has to be a measurement. */
export function GapStrip({ length }: { length: string }) {
  return (
    <div className="day-gap">
      <span className="day-gap-line" />
      <span className="day-gap-lbl">{t.day.join.free(length)}</span>
      <span className="day-gap-line" />
    </div>
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
