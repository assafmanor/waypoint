// Board (design-language: the departure-board hero) — the app's signature
// surface and its "one loud element": the only dark, glowing, pulsing surface.
// Extracted faithfully from screens/Home.tsx's inline board (~249), preserving
// every state: now (hard/soft), in-transit (a flight in the air — teal "where
// you are"), group-split (concurrent soft events as equals), and free/empty,
// plus the next-row + day-progress rail (hidden in transit, when the flight IS
// the current activity) and the quiet "ועוד N עכשיו" concurrency readout.
//
// Presentational only (dependency direction, §12): all data + title nodes come
// via props; no trip-state, no derivations. Domain UI may use the shared
// copy/label helpers (not state) — it does for the fixed board copy + transition
// labels. The board is rationed to one per screen (design-language).
//
// HERO 2.0, PHASE 1 (ADR-0160 §4). The board is becoming a tap target, and that
// forced a change with nothing to do with taste: a tappable board is a
// `<button>`, and the `ועוד N עכשיו` expander was a `<button>` INSIDE it. Chrome
// does not merely call that invalid — it closes the outer element at the nested
// one and reparents everything after it, so the divider, the next row and the day
// rail land outside the board (measured in `mockups/hero-horizon-v1.html`: 1 of 4
// children left inside). So the expander is gone, replaced by a READOUT — the
// count must stay legible without a tap — and its rows move to the lifted hero in
// phase 3. This was the board's only interactive child, so it now has none.
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { TitleLabel } from '../TitleLabel';
import { ZoneShiftPill } from '../ZoneShiftPill';
import { transitionLabel } from '../../lib/transitions';
import { t } from '../../i18n/he';
import './board.css';

export type BoardVariant = 'now' | 'in-transit' | 'group-split' | 'free';

/** Signed time-shift in minutes (`EventZones.deltaMinutes`) for a slot whose
 *  times don't read in the zone you're standing in — the board renders it as the
 *  shared amber pill (ADR-0107). Undefined → no pill, which is every slot on a
 *  single-zone trip. Times themselves arrive pre-formatted in their own zone. */
type ZoneShift = number | undefined;

/** A concurrent/also-now row (a group-split equal, or an item under "ועוד N"). */
export interface BoardRow {
  key: string;
  icon?: ReactNode;
  /** Title node (screen passes <EventTitle/>). */
  title: ReactNode;
  /** End time (pre-formatted, in this row's own end zone) → "עד HH:MM". */
  until?: string;
  hard?: boolean;
  shift?: ZoneShift;
}

export interface BoardTransit {
  /** Transition label key (departure/arrival/…) resolved via transitionLabel. */
  labelKey: string;
  /** The live badge and the slot label, **resolved per mode** by the screen from
   *  `eventMidSpanWords` (`בטיסה`/`בדרך`, `כרגע · בדרך`). They were `t.board`
   *  literals here, which is how a train in motion read as a flight: this state fires
   *  for any bracketed transport between its ends, not only for aviation. */
  liveWord: string;
  label: string;
  /** The travelling mark on the rail — **the event's own glyph**, not a mark this
   *  component picks. It was a hard-coded `Icon name="flight"`, so a train crossed its
   *  rail behind a plane; and there is no `train`/`bus` icon to reach for, which is the
   *  second reason the answer is the glyph the user can already change. */
  mark?: ReactNode;
  /** Emphasize the label (an arrival is imminent). */
  arriving?: boolean;
  /** Landing time (pre-formatted) — in the **destination's** zone (ADR-0107 §3). */
  endTime?: string;
  code?: string;
  /** Flight progress 0..1 (drives the fill + plane). */
  progress: number;
  /** Departure time (pre-formatted) — in the **origin's** zone. */
  startTime?: string;
  fromPlace?: string;
  toPlace?: string;
  /** How long is left, pre-phrased on the shared ladder (`1:39 שע׳`) → the rail's
   *  middle slot reads `נותרו 1:39 שע׳`.
   *
   *  That slot used to print `עד HH:MM` — the arrival time the **end** label prints two
   *  inches away, on the same 10.5px line. The middle is the only place on the rail that
   *  can say something its two ends cannot, so it says what is left. */
  remaining?: string;
  /** Destination clock minus origin clock — the pill beside the landing time, so
   *  the two ends can't misread as a 3h45 flight when they're 6h45 apart. */
  shift?: ZoneShift;
}

export interface BoardNext {
  /** Title node; absent → "end of day". */
  title?: ReactNode;
  icon?: ReactNode;
  /** Transition label key (המראה / צ׳ק-אין …) if the next is bracketed. */
  labelKey?: string;
  /** Instant (pre-formatted) — in the zone that instant happens in. */
  time?: string;
  hard?: boolean;
  code?: string;
  /** That zone vs where you are now → the pill beside the time. */
  shift?: ZoneShift;
}

export interface BoardProps {
  variant: BoardVariant;
  /** Current time (pre-formatted) — the board clock. */
  clock: string;

  // NOW slot (variant 'now' / 'in-transit').
  nowIcon?: ReactNode;
  nowTitle?: ReactNode;
  /** Drives the hard-lock vs soft now-label (variant 'now'). */
  nowKind?: 'hard' | 'soft';
  /** "until" end time for a now event (pre-formatted, in its own end zone). */
  nowUntil?: string;
  /** The now event's shift → the pill beside `nowUntil`. */
  nowShift?: ZoneShift;
  conflict?: { title: string; atLabel: string };

  // in-transit hero.
  transit?: BoardTransit;

  // group-split equals + the also-now expander items.
  splitRows?: BoardRow[];
  alsoNow?: BoardRow[];

  // NEXT slot + progress (hidden in transit).
  next?: BoardNext | null;
  countdown?: { value?: string; unit: string } | null;
  /** Day progress 0..100. */
  progress?: number;
  windowStartHour?: string;
  windowEndHour?: string;

  /** Press the whole board to lift it (ADR-0160 §1). Present → the board renders
   *  as a `<button>` and takes the large press step; absent → a plain `<div>`, as
   *  it shipped. The CALLER decides which variants are liftable and whether there
   *  is anything to lift — the board stays presentational and asks neither.
   *
   *  Hands back the element that was pressed, because the lift is a FLIP off this
   *  board's box and a landing position may never be a constant (`frontend/CLAUDE.md`
   *  records three bugs from writing one). Reporting what was pressed is still
   *  presentational: the board measures nothing and decides nothing. */
  onLift?: (board: HTMLElement) => void;

  /** The hero is currently lifted out of this board (ADR-0160 §1). Hides it without
   *  giving up its box — it is the same object one elevation up, and two of them on
   *  screen is the overlay grammar the promotion exists to avoid. */
  lifted?: boolean;
}

/**
 * **The day rail**, and the transit progress that replaces it (ADR-0059 §2, ADR-0160 §10).
 *
 * Both are exported because the LIFTED hero pins one of them as its foot, and phase 3
 * shipped the day rail as a hand-written copy in `Home.tsx` — beside a `rail` prop whose
 * own comment claimed it was "the same node the collapsed board renders, passed in rather
 * than rebuilt so the two cannot drift". It was rebuilt. Rule 8's answer is to generalize
 * the one-off rather than add a second one beside it, so the copy is gone and there is one
 * of each.
 */
export function DayRail({
  progress,
  startHour,
  endHour,
}: {
  /** Day progress, 0..100. */
  progress: number;
  startHour?: string;
  endHour?: string;
}) {
  return (
    <div className="wp-board-progress" aria-hidden="true">
      <div className="track">
        <div className="fill" style={{ width: `${progress}%` }} />
        <div className="knob" style={{ insetInlineStart: `${progress}%` }} />
      </div>
      <div className="ends">
        <span dir="auto">{startHour}</span>
        <span>{t.common.now}</span>
        <span dir="auto">{endHour}</span>
      </div>
    </div>
  );
}

/** The flight in the air: a track, a plane at the progress point, and the two ends with
 *  their own times. Absent unless both ends are known — a progress bar between one time and
 *  nothing is a bar that cannot say where it is. */
export function TransitProgress({ transit }: { transit: BoardTransit }) {
  if (!transit.startTime || !transit.endTime) return null;
  return (
    <div className="wp-board-transit-prog">
      <div className="tp-track">
        <div className="tp-fill" style={{ width: `${transit.progress * 100}%` }} />
        <div className="tp-plane" style={{ insetInlineStart: `${transit.progress * 100}%` }}>
          {transit.mark}
        </div>
      </div>
      <div className="tp-ends">
        <span className="tp-end">
          <span className="mono" dir="auto">
            {transit.startTime}
          </span>
          {transit.fromPlace && <span className="pl">{transit.fromPlace}</span>}
        </span>
        {transit.remaining && (
          <span className="tp-left">
            {t.board.remaining}{' '}
            <span className="mono" dir="auto">
              {transit.remaining}
            </span>
          </span>
        )}
        <span className="tp-end end">
          {transit.toPlace && <span className="pl">{transit.toPlace}</span>}
          <span className="mono" dir="auto">
            {transit.endTime}
          </span>
          {/* The two ends are in their own zones now (ADR-0107), so the shift has to sit
              where they're read together — otherwise a 07:15 → 11:00 flight reads as 3h45
              instead of 6h45. */}
          {transit.shift != null && <ZoneShiftPill minutes={transit.shift} className="on-dark" />}
        </span>
      </div>
    </div>
  );
}

function AlsoRow({ row }: { row: BoardRow }) {
  return (
    <div className="wp-board-also-row">
      {row.icon && <span className="ic">{row.icon}</span>}
      <span className="nm">{row.title}</span>
      {row.hard && (
        <span className="mini-lock" aria-hidden="true">
          <Icon name="lock" />
        </span>
      )}
      {row.until && (
        <span className="tm">
          {t.board.until} <span dir="auto">{row.until}</span>
        </span>
      )}
      {row.shift != null && <ZoneShiftPill minutes={row.shift} className="on-dark" />}
    </div>
  );
}

export function Board(props: BoardProps) {
  const {
    variant,
    clock,
    nowIcon,
    nowTitle,
    nowKind,
    nowUntil,
    nowShift,
    conflict,
    transit,
    splitRows,
    alsoNow,
    next,
    countdown,
    progress = 0,
    windowStartHour,
    windowEndHour,
    onLift,
    lifted,
  } = props;
  const inTransit = variant === 'in-transit';

  const body = (
    <>
      <div className="wp-board-top">
        <div className={'wp-board-live' + (inTransit ? ' loc' : '')}>
          <span className="blip" />
          {inTransit && transit ? transit.liveWord : t.common.now}
        </div>
        <div className="wp-board-clock" dir="auto">
          {clock}
        </div>
      </div>

      {inTransit && transit ? (
        <>
          <div className="wp-board-now-label loc">{transit.label}</div>
          <div className="wp-board-now-title">
            {nowIcon && <span className="wp-board-ic">{nowIcon}</span>}
            {nowTitle}
          </div>
          <div className="wp-board-now-meta">
            <span className={'tlabel loc' + (transit.arriving ? ' emph' : '')}>
              {transitionLabel(transit.labelKey)}
            </span>
            {transit.endTime && <span dir="auto">{transit.endTime}</span>}
            {transit.code && (
              <span className="code" dir="auto">
                {transit.code}
              </span>
            )}
          </div>
          <TransitProgress transit={transit} />
        </>
      ) : variant === 'group-split' ? (
        <div className="wp-board-now-split">
          <div className="wp-board-now-label">{t.board.concurrentNow}</div>
          <div className="wp-board-also-list">
            {splitRows?.map((r) => (
              <AlsoRow key={r.key} row={r} />
            ))}
          </div>
        </div>
      ) : variant === 'now' ? (
        <>
          <div className="wp-board-now-label">
            {nowKind === 'hard' ? (
              <>
                <Icon name="lock" /> {t.event.hard}
              </>
            ) : (
              t.event.soft
            )}
          </div>
          <div className="wp-board-now-title">
            {nowIcon && <span className="wp-board-ic">{nowIcon}</span>}
            {nowTitle}
          </div>
          {nowUntil && (
            <div className="wp-board-now-meta">
              {t.board.until} <span dir="auto">{nowUntil}</span>
              {nowShift != null && <ZoneShiftPill minutes={nowShift} className="on-dark" />}
            </div>
          )}
          {conflict && (
            <div className="wp-board-now-conflict">
              <Icon name="warn" /> {t.event.conflictWarn.before}
              <TitleLabel title={conflict.title} /> {t.event.conflictWarn.after(conflict.atLabel)}
            </div>
          )}
          {/* The concurrency READOUT (ADR-0160 §4) — the count, not a control.
              Same dot and same words as the expander it replaces; what is gone is
              the chevron, the press target and the open state. The rows live in
              the lifted hero from phase 3. */}
          {alsoNow && alsoNow.length > 0 && (
            <div className="wp-board-also-read">
              <span className="dot" aria-hidden="true" />
              {t.board.alsoNow(alsoNow.length)}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="wp-board-now-label">{t.board.freeLabel}</div>
          <div className="wp-board-now-title">{t.board.freeTitle}</div>
        </>
      )}

      {/* In transit the progress bar replaces the next-row + day rail (the flight
          IS the current activity). */}
      {!inTransit && (
        <>
          <div className="wp-board-divider" />
          <div className="wp-board-next-row">
            <div>
              <div className="wp-board-next-label">{t.board.nextLabel}</div>
              <div className="wp-board-next-title">
                {next?.icon && <span className="wp-board-ic">{next.icon}</span>}
                {next?.title ?? t.board.endOfDay}
              </div>
              {next && (
                <div className="wp-board-next-meta">
                  {next.labelKey && (
                    <span className="tlabel">{transitionLabel(next.labelKey)}</span>
                  )}
                  {next.time && <span dir="auto">{next.time}</span>}
                  {next.shift != null && <ZoneShiftPill minutes={next.shift} className="on-dark" />}
                  {next.hard && (
                    <span className="lockmini">
                      <Icon name="lock" /> {t.event.hard}
                    </span>
                  )}
                  {next.code && (
                    <span className="code" dir="auto">
                      {next.code}
                    </span>
                  )}
                </div>
              )}
            </div>
            {countdown && (
              <div className="wp-board-countdown">
                {countdown.value && (
                  <div className="t" dir="auto">
                    {countdown.value}
                  </div>
                )}
                <div className="u">{countdown.unit}</div>
              </div>
            )}
          </div>

          <DayRail progress={progress} startHour={windowStartHour} endHour={windowEndHour} />
        </>
      )}
    </>
  );

  const cls = 'wp-board' + (inTransit ? ' transit' : '') + (lifted ? ' is-lifted' : '');

  // A `<button>` only when there is somewhere to go. `is-tappable` carries the
  // element reset and the large press step (ADR-0140 §2: a full-width card at the
  // control step reads as collapsing), and it is one class rather than a bespoke
  // transform.
  return onLift ? (
    <button type="button" className={cls + ' is-tappable'} onClick={(e) => onLift(e.currentTarget)}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
