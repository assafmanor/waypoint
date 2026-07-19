// Board (design-language: the departure-board hero) — the app's signature
// surface and its "one loud element": the only dark, glowing, pulsing surface.
// Extracted faithfully from screens/Home.tsx's inline board (~249), preserving
// every state: now (hard/soft), in-transit (a flight in the air — teal "where
// you are"), group-split (concurrent soft events as equals), and free/empty,
// plus the next-row + day-progress rail (hidden in transit, when the flight IS
// the current activity) and the quiet "ועוד N עכשיו" concurrency expander.
//
// Presentational only (dependency direction, §12): all data + title nodes come
// via props; no trip-state, no derivations. Domain UI may use the shared
// copy/label helpers (not state) — it does for the fixed board copy + transition
// labels. The board is rationed to one per screen (design-language).
import { useState, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { transitionLabel } from '../../lib/transitions';
import { ICONS } from '../../constants';
import { t } from '../../i18n/he';
import './board.css';

export type BoardVariant = 'now' | 'in-transit' | 'group-split' | 'free';

/** A concurrent/also-now row (a group-split equal, or an item under "ועוד N"). */
export interface BoardRow {
  key: string;
  icon?: ReactNode;
  /** Title node (screen passes <EventTitle/>). */
  title: ReactNode;
  /** End time (pre-formatted) → "עד HH:MM". */
  until?: string;
  hard?: boolean;
}

export interface BoardTransit {
  /** Transition label key (departure/arrival/…) resolved via transitionLabel. */
  labelKey: string;
  /** Emphasize the label (an arrival is imminent). */
  arriving?: boolean;
  /** Landing time (pre-formatted). */
  endTime?: string;
  code?: string;
  /** Flight progress 0..1 (drives the fill + plane). */
  progress: number;
  startTime?: string;
  fromPlace?: string;
  toPlace?: string;
  /** Show the middle "עד HH:MM" countdown-to-landing. */
  showCountdown?: boolean;
}

export interface BoardNext {
  /** Title node; absent → "end of day". */
  title?: ReactNode;
  icon?: ReactNode;
  /** Transition label key (המראה / צ׳ק-אין …) if the next is bracketed. */
  labelKey?: string;
  /** Instant (pre-formatted). */
  time?: string;
  hard?: boolean;
  code?: string;
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
  /** "until" end time for a now event (pre-formatted). */
  nowUntil?: string;
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
}

function AlsoRow({ row }: { row: BoardRow }) {
  return (
    <div className="wp-board-also-row">
      {row.icon && <span className="ic">{row.icon}</span>}
      <span className="nm">{row.title}</span>
      {row.hard && (
        <span className="mini-lock" aria-hidden="true">
          {ICONS.lock}
        </span>
      )}
      {row.until && (
        <span className="tm">
          {t.board.until} <span dir="ltr">{row.until}</span>
        </span>
      )}
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
    conflict,
    transit,
    splitRows,
    alsoNow,
    next,
    countdown,
    progress = 0,
    windowStartHour,
    windowEndHour,
  } = props;
  const inTransit = variant === 'in-transit';
  const [alsoOpen, setAlsoOpen] = useState(false);

  return (
    <div className={'wp-board' + (inTransit ? ' transit' : '')}>
      <div className="wp-board-top">
        <div className={'wp-board-live' + (inTransit ? ' loc' : '')}>
          <span className="blip" />
          {inTransit ? t.board.inTransitLive : t.common.now}
        </div>
        <div className="wp-board-clock" dir="ltr">
          {clock}
        </div>
      </div>

      {inTransit && transit ? (
        <>
          <div className="wp-board-now-label loc">{t.board.inTransitLabel}</div>
          <div className="wp-board-now-title">
            {nowIcon && <span className="wp-board-ic">{nowIcon}</span>}
            {nowTitle}
          </div>
          <div className="wp-board-now-meta">
            <span className={'tlabel loc' + (transit.arriving ? ' emph' : '')}>
              {transitionLabel(transit.labelKey)}
            </span>
            {transit.endTime && <span dir="ltr">{transit.endTime}</span>}
            {transit.code && (
              <span className="code" dir="ltr">
                {transit.code}
              </span>
            )}
          </div>
          {transit.startTime && transit.endTime && (
            <div className="wp-board-transit-prog">
              <div className="tp-track">
                <div className="tp-fill" style={{ width: `${transit.progress * 100}%` }} />
                <div
                  className="tp-plane"
                  style={{ insetInlineStart: `${transit.progress * 100}%` }}
                >
                  ✈️
                </div>
              </div>
              <div className="tp-ends">
                <span className="tp-end">
                  <span className="mono" dir="ltr">
                    {transit.startTime}
                  </span>
                  {transit.fromPlace && <span className="pl">{transit.fromPlace}</span>}
                </span>
                {transit.showCountdown && (
                  <span className="tp-left">
                    {t.board.until}{' '}
                    <span className="mono" dir="ltr">
                      {transit.endTime}
                    </span>
                  </span>
                )}
                <span className="tp-end end">
                  {transit.toPlace && <span className="pl">{transit.toPlace}</span>}
                  <span className="mono" dir="ltr">
                    {transit.endTime}
                  </span>
                </span>
              </div>
            </div>
          )}
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
            {nowKind === 'hard' ? `${ICONS.lock} ${t.event.hard}` : t.event.soft}
          </div>
          <div className="wp-board-now-title">
            {nowIcon && <span className="wp-board-ic">{nowIcon}</span>}
            {nowTitle}
          </div>
          {nowUntil && (
            <div className="wp-board-now-meta">
              {t.board.until} <span dir="ltr">{nowUntil}</span>
            </div>
          )}
          {conflict && (
            <div className="wp-board-now-conflict">
              {ICONS.warn} {t.event.conflictWarn(conflict.title, conflict.atLabel)}
            </div>
          )}
          {alsoNow && alsoNow.length > 0 && (
            <div className="wp-board-also-now">
              <button
                type="button"
                className="wp-board-also-toggle"
                onClick={() => setAlsoOpen((v) => !v)}
                aria-expanded={alsoOpen}
              >
                <span className="dot" aria-hidden="true" />
                {t.board.alsoNow(alsoNow.length)}
                <span className="chev" aria-hidden="true">
                  <Icon name="caret" dir={alsoOpen ? 'up' : 'down'} />
                </span>
              </button>
              {alsoOpen && (
                <div className="wp-board-also-list">
                  {alsoNow.map((r) => (
                    <AlsoRow key={r.key} row={r} />
                  ))}
                </div>
              )}
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
                  {next.time && <span dir="ltr">{next.time}</span>}
                  {next.hard && (
                    <span className="lockmini">
                      {ICONS.lock} {t.event.hard}
                    </span>
                  )}
                  {next.code && (
                    <span className="code" dir="ltr">
                      {next.code}
                    </span>
                  )}
                </div>
              )}
            </div>
            {countdown && (
              <div className="wp-board-countdown">
                {countdown.value && (
                  <div className="t" dir="ltr">
                    {countdown.value}
                  </div>
                )}
                <div className="u">{countdown.unit}</div>
              </div>
            )}
          </div>

          <div className="wp-board-progress" aria-hidden="true">
            <div className="track">
              <div className="fill" style={{ width: `${progress}%` }} />
              <div className="knob" style={{ insetInlineStart: `${progress}%` }} />
            </div>
            <div className="ends">
              <span dir="ltr">{windowStartHour}</span>
              <span>{t.common.now}</span>
              <span dir="ltr">{windowEndHour}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
