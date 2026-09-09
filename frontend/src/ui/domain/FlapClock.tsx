// **The departure-board clock, in split-flap cells** (ADR-0221 §3). `HH:MM:SS` to an
// instant, ticking; a cell whose digit changed remounts (its key carries the digit) and so
// turns again, with no stagger — the stagger belongs to the first mount alone.
//
// One component, two hosts, which is the whole point of it: the prep hero's headline on the
// eve, and the board's countdown tile on the morning of departure until the first timed
// thing starts. The clock hands over from one hero to the other without a gap, and it is
// one clock rather than two because it is one component (rule 8).
//
// `dir="auto"` on the row, never `dir="ltr"` (ADR-0118): digits and colons carry no strong
// direction, so the row resolves LTR by itself. A `role="timer"` READ, not a control — the
// prep hero is a `<button>` and Chrome closes a `<button>` at a nested one (ADR-0160 §4).
import { useRef, type CSSProperties } from 'react';
import { flapClock } from '../../lib/prep-tier';
import { formatCountdown } from '../../lib/time';
import { MINUTES_PER_HOUR } from '../../constants';
import { t } from '../../i18n/he';

export function FlapClock({
  nowMs,
  targetMs,
  className,
}: {
  nowMs: number;
  targetMs: number;
  /** The host's own class beside `prep-flaps` — the board's tile sizes its cells down. */
  className?: string;
}) {
  const clock = flapClock(nowMs, targetMs);
  // The first render staggers the cells in; every later render is a tick, and a tick's
  // fresh cell must not wait its slot's stagger before turning.
  const mounted = useRef(false);
  const staggered = !mounted.current;
  mounted.current = true;
  const minutesLeft = Math.max(0, Math.floor((targetMs - nowMs) / 60000));
  const spoken =
    minutesLeft < MINUTES_PER_HOUR
      ? `${minutesLeft} ${t.planHome.prep.minutes}`
      : `${formatCountdown(minutesLeft).value} ${formatCountdown(minutesLeft).unit}`;
  const cell = (ch: string, i: number, sec: boolean) => (
    <span
      key={`${i}-${ch}`}
      className={sec ? 'prep-flap sec' : 'prep-flap'}
      style={{ '--i': staggered ? i : 0 } as CSSProperties}
    >
      {ch}
    </span>
  );
  const group = (digits: string, offset: number, sec = false) =>
    [...digits].map((ch, j) => cell(ch, offset + j, sec));
  return (
    <div
      className={'prep-flaps' + (className ? ` ${className}` : '')}
      dir="auto"
      role="timer"
      aria-label={t.board.inPhrase(spoken)}
    >
      {group(clock.hours, 0)}
      <span className="prep-flap-sep" aria-hidden="true">
        :
      </span>
      {group(clock.minutes, 3)}
      <span className="prep-flap-sep" aria-hidden="true">
        :
      </span>
      {group(clock.seconds, 6, true)}
    </div>
  );
}
