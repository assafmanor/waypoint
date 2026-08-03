// **The lifted hero** (ADR-0160). The board, promoted: one object that gained
// elevation, showing the HORIZON the collapsed board cannot — `עכשיו → ועוד עכשיו
// → הבא בתור → אחר כך`, with depth on the live one.
//
// It is a `Modal` (variant `lift`), and that is not negotiable however little it
// behaves like a sheet: it can be dismissed, so ADR-0103's amendments and ADR-0090
// give it no exemption, and the `✕`, the backdrop, Escape and the Android gesture
// all reach ONE handler through the primitive. What ADR-0160 §2 rejects is the
// sheet's grammar, never the back contract.
//
// Presentational, like `Board` beside it (dependency direction §12): every datum
// arrives formatted and every verb arrives as a callback. It reads no trip state,
// resolves no zone and formats no time — `screens/Home.tsx` does all three, from
// `lib/hero-horizon.ts`.
//
// PHASE 3 OF THE BUILD: this renders. It does not yet ANIMATE — the `lift`
// variant's entrance is a placeholder fade, and phase 4 replaces it with the FLIP
// off the collapsed board's measured box plus the swing. Nothing here should be
// read as the designed motion.
import type { ReactNode } from 'react';
import { Modal } from '../primitives/Modal';
import { Icon } from '../Icon';
import { ZoneShiftPill } from '../ZoneShiftPill';
import { SettleControl, type SettleOutcome } from './SettleControl';
import { t } from '../../i18n/he';
import './hero-lift.css';

/** One point on the horizon, view-ready. Mirrors `lib/hero-horizon.ts`'s `HeroPoint`
 *  with everything resolved: the title is a node (the screen passes `<EventTitle/>`,
 *  so a flight still reads as its route), times are pre-formatted in their own zone
 *  (ADR-0107), and the hand-offs are callbacks rather than hrefs the domain layer
 *  would have to know how to build. */
export interface HeroLiftPoint {
  key: string;
  title: ReactNode;
  icon?: ReactNode;
  /** `קשיח` / `גמיש`, as the collapsed board says it. */
  kind?: 'hard' | 'soft';
  /** End time, pre-formatted in this point's own end zone → `עד HH:MM`. */
  until?: string;
  /** Signed minutes for the amber zone pill, when this point's times do not read
   *  in the zone you are standing in. Absent on a single-zone trip. */
  shift?: number;
  /** Resolved place name. Absent → no `איפה` block for this point. */
  place?: string;
  /** Present → the note block. The body of the newest; `noteMore` says how many
   *  others there are, because the hero shows ONE and must not imply it is all. */
  note?: string;
  noteMore?: number;
  settled?: SettleOutcome;
  /** The way to the pin, and the hand-off out to Maps (ADR-0121's amendment §4 —
   *  the affordance that was too loud on the COLLAPSED board and is affordable
   *  here, because this is a state you asked for). */
  onMap?: () => void;
  navigateUrl?: string;
  /** The way through to the booking. */
  onBooking?: () => void;
  onDone?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
}

/** `אחר כך` — one line, and ADR-0160 §12's condition is the SHAPE: a title and a
 *  time, no place, no note, no control, nothing to press. Growing this is the
 *  request to turn the hero into the Day tab, and the answer is the Day tab. */
export interface HeroLiftThen {
  title: string;
  time: string;
}

export interface HeroLiftProps {
  /** Current time, pre-formatted — the board clock, unchanged. */
  clock: string;
  /** In-progress points, primary first. Several with no primary is the group split
   *  (ADR-0041 §6), where every equal carries the same depth because the variant
   *  exists on there being no primary — collapsing one would manufacture it. */
  now: HeroLiftPoint[];
  /** True when `now` has no primary — swaps the label for `עכשיו · במקביל`. */
  split?: boolean;
  next?: HeroLiftPoint;
  /** The `הבא בתור` transition chip (`צ׳ק-אין` / `המראה` …), already resolved. */
  nextLabel?: ReactNode;
  nextTime?: string;
  nextCode?: string;
  countdown?: { value?: string; unit: string } | null;
  then?: HeroLiftThen;
  /** The day rail, pinned as the foot — the same node the collapsed board renders,
   *  passed in rather than rebuilt so the two cannot drift. */
  rail?: ReactNode;
  onClose: () => void;
}

function Where({ point }: { point: HeroLiftPoint }) {
  if (!point.place) return null;
  return (
    <div className="hero-part">
      <span className="hero-lbl">{t.hero.where}</span>
      <div className="hero-row">
        <span className="hero-where-nm" dir="auto">
          {point.place}
        </span>
        {point.onMap && (
          <button type="button" className="hero-act loc" onClick={point.onMap}>
            <Icon name="pin" /> {t.hero.onMap}
          </button>
        )}
        {/* An anchor, not a button: the hand-off out to Maps is a real link, so
            long-press and share work and no popup blocker is involved — the same
            choice Home's navigate tile and the day cards already make (ADR-0106 §F). */}
        {point.navigateUrl && (
          <a
            className="hero-act loc"
            href={point.navigateUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="navigate" /> {t.hero.navigate}
          </a>
        )}
      </div>
    </div>
  );
}

function Note({ point }: { point: HeroLiftPoint }) {
  if (!point.note) return null;
  return (
    <div className="hero-part">
      <span className="hero-lbl">{t.hero.note}</span>
      <div className="hero-note">
        {/* The mark notes already ship on five hosts (ADR-0153 §4) — one clipboard
            silhouette, not a glyph invented for this surface. */}
        <span className="hero-note-ic" aria-hidden="true">
          <Icon name="clipboard" />
        </span>
        <span className="hero-note-tx">{point.note}</span>
      </div>
      {/* The hero shows ONE note and must not imply it is the only one. */}
      {!!point.noteMore && (
        <span className="hero-note-more">{t.hero.moreNotes(point.noteMore)}</span>
      )}
    </div>
  );
}

/** The way THROUGH to the booking — depth on any point that has one, not a
 *  property of the `next` slot. Wiring it only on `next` left a now point's booking
 *  unreachable while `canLift` counted it, which is the shape of bug that makes a
 *  lift open onto less than it promised. */
function Reach({ point }: { point: HeroLiftPoint }) {
  if (!point.onBooking) return null;
  return (
    <div className="hero-part">
      <div className="hero-row">
        <button type="button" className="hero-act time" onClick={point.onBooking}>
          <Icon name="ticket" /> {t.hero.toBooking}
        </button>
      </div>
    </div>
  );
}

function Settle({ point }: { point: HeroLiftPoint }) {
  if (!point.onDone || !point.onSkip) return null;
  return (
    <div className="hero-part">
      <SettleControl
        variant="board"
        outcome={point.settled}
        onDone={point.onDone}
        onSkip={point.onSkip}
        onUndo={point.onUndo}
      />
    </div>
  );
}

/** A point with its depth. The head line is the point's own identity; everything
 *  under it is what the collapsed board could not carry. */
function Point({ point, lead }: { point: HeroLiftPoint; lead?: boolean }) {
  return (
    <div className={lead ? 'hero-point lead' : 'hero-point'}>
      {lead ? (
        <div className="hero-part">
          {point.kind && (
            <div className="wp-board-now-label">
              {point.kind === 'hard' ? (
                <>
                  <Icon name="lock" /> {t.event.hard}
                </>
              ) : (
                t.event.soft
              )}
            </div>
          )}
          <div className="wp-board-now-title">
            {point.icon && <span className="wp-board-ic">{point.icon}</span>}
            {point.title}
          </div>
          {point.until && (
            <div className="wp-board-now-meta">
              {t.board.until} <span dir="auto">{point.until}</span>
              {point.shift != null && <ZoneShiftPill minutes={point.shift} className="on-dark" />}
            </div>
          )}
        </div>
      ) : (
        <div className="hero-equal-hd">
          {point.icon && <span className="ic">{point.icon}</span>}
          <span className="nm">{point.title}</span>
          {point.until && (
            <span className="tm">
              {t.board.until} <span dir="auto">{point.until}</span>
            </span>
          )}
          {point.shift != null && <ZoneShiftPill minutes={point.shift} className="on-dark" />}
        </div>
      )}
      <Where point={point} />
      <Note point={point} />
      <Reach point={point} />
      <Settle point={point} />
    </div>
  );
}

export function HeroLift(props: HeroLiftProps) {
  const { clock, now, split, next, nextLabel, nextTime, nextCode, countdown, then, rail } = props;

  return (
    <Modal variant="lift" ariaLabel={t.hero.title} onClose={props.onClose}>
      {(close) => (
        <div className="wp-board hero-lifted">
          <div className="hero-head">
            <div className="wp-board-top">
              <div className="wp-board-live">
                <span className="blip" />
                {t.common.now}
              </div>
              <div className="hero-head-end">
                <div className="wp-board-clock" dir="auto">
                  {clock}
                </div>
                {/* Bound to the primitive's OWN animated close, not to the caller's
                    `onClose` — the same path the backdrop, a back and Escape take.
                    Calling the caller directly would snap past the exit, which is
                    what makes ADR-0140 half-true (Modal's own note says so). */}
                <button type="button" className="hero-x" onClick={close} aria-label={t.hero.close}>
                  <Icon name="close" />
                </button>
              </div>
            </div>
          </div>

          {/* ONE scroller, with the head and the foot pinned around it — ADR-0148
              §1's bounded card, reached for the same reason it was there: a card
              that is as tall as its content still has to stop at the screen. */}
          <div className="hero-scroll">
            {split && (
              <div className="hero-part">
                <div className="wp-board-now-label">{t.board.concurrentNow}</div>
              </div>
            )}
            {now.map((p, i) => (
              <Point key={p.key} point={p} lead={!split && i === 0} />
            ))}

            {next && (
              <>
                <div className="wp-board-divider" />
                <div className="hero-part">
                  <div className="wp-board-next-row">
                    <div>
                      <div className="wp-board-next-label">{t.board.nextLabel}</div>
                      <div className="wp-board-next-title">
                        {next.icon && <span className="wp-board-ic">{next.icon}</span>}
                        {next.title}
                      </div>
                      <div className="wp-board-next-meta">
                        {nextLabel && <span className="tlabel">{nextLabel}</span>}
                        {nextTime && <span dir="auto">{nextTime}</span>}
                        {next.shift != null && (
                          <ZoneShiftPill minutes={next.shift} className="on-dark" />
                        )}
                        {next.kind === 'hard' && (
                          <span className="lockmini">
                            <Icon name="lock" /> {t.event.hard}
                          </span>
                        )}
                        {nextCode && (
                          <span className="code" dir="auto">
                            {nextCode}
                          </span>
                        )}
                      </div>
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
                </div>
                {/* The same parts as any point: what the horizon adds to NEXT is the
                    way through and the where, not a second printing of the code the
                    collapsed board already shows above. */}
                <Where point={next} />
                <Note point={next} />
                <Reach point={next} />
              </>
            )}

            {then && (
              <div className="hero-part hero-then">
                <span className="hero-lbl hero-then-lbl">{t.hero.then}</span>
                <span className="tm" dir="auto">
                  {then.time}
                </span>
                <span className="hero-then-nm">{then.title}</span>
              </div>
            )}
          </div>

          {rail && <div className="hero-foot">{rail}</div>}
        </div>
      )}
    </Modal>
  );
}
