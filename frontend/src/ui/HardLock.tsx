// **The hard-commitment lock, once** (ADR-0011 · ADR-0178 §4 · ADR-0179 §3).
//
// ADR-0178 moved this mark out of two rows' title lines and into their when lines, on the
// reasoning that a hard event is a commitment about its TIME. It landed as two byte-identical
// rules — `.wp-event-timelock` and `.bld-timelock` — plus two copies of the same markup, and
// ADR-0179 was about to add a third for the Index booking row. Three copies of a mark is the
// shape ADR-0139 already paid for once: three settle affordances drifted on four axes before
// `SettleControl` collected them, and every one of those axes was the VOCABULARY (the words,
// the marks, the hues) rather than the geometry the copies were made for.
//
// So the mark is one object with one name: the glyph, its 12px size, the amber it spends
// (`--amber-deep`, the clock's — ADR-0028), and the label a screen reader gets. What each host
// still owns is where it sits and what it sits beside, which is layout, not vocabulary.
//
// Deliberately NOT the whole when line. The three lines genuinely differ: Plan's is a `button`
// carrying ADR-0161 §7's chip and ADR-0177's `ValueToken`, the day card's is a readout with a
// zone pill and a next-day superscript, the booking row's is a sentence with a transition verb.
// Collecting those would be a restructure of both day rows rather than an extraction — see
// ADR-0179's Consequences, where that is flagged rather than silently taken on.
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './when-line.css';

export function HardLock({ className }: { className?: string }) {
  return (
    <span
      className={'hard-lock' + (className ? ` ${className}` : '')}
      aria-label={t.event.hard}
      title={t.event.hard}
    >
      <Icon name="lock" />
    </span>
  );
}
