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
// The MOTION is `lib/useLiftFlight.ts` and it needs one thing from this file: the
// element that is the hero. That is the board below, not the modal card around it — in
// this variant the card is a transparent shell, so flying it would leave a
// content-sized board overflowing a box animating independently of it.
import { useRef, type ReactNode } from 'react';
import { useLiftFlight } from '../../lib/useLiftFlight';
import { Modal } from '../primitives/Modal';
import { Avatar, type AvatarPerson } from '../primitives/Avatar';
import { Icon } from '../Icon';
import { ZoneShiftPill } from '../ZoneShiftPill';
import { SettleControl, type SettleOutcome } from './SettleControl';
import { t } from '../../i18n/he';
import './hero-lift.css';

/** **A span you are inside**, in the collapsed board's own words (session 215).
 *
 *  The lifted hero had no in-transit shape at all: a flight in the air arrived here as
 *  an ordinary hard now-event (`קשיח` + `עד 22:15`), while the collapsed board it was
 *  lifted out of said `כרגע · בדרך` + a teal `נחיתה` chip — and the flight's own progress
 *  rail was handed in as `foot`, which pinned it BELOW the `הבא בתור` block, one full
 *  slot away from the thing it describes (258px, measured). Two of the four reports
 *  behind this change are that one gap, from two directions: the rail read as the next
 *  event's, and the collapsed board read as the better surface.
 *
 *  Nothing here is new grammar. It is the same words one elevation up, which is
 *  ADR-0160's own thesis — plus the one fact neither state carried before: how long is
 *  left. */
export interface HeroLiftTransit {
  /** The mode's slot label (`כרגע · בדרך`), in place of `קשיח`/`גמיש`. */
  label: string;
  /** The end transition chip, resolved per mode (`נחיתה` / `הגעה` / `החזרת הרכב`). */
  endLabel: ReactNode;
  /** The arrival instant, pre-formatted in the **destination's** zone (ADR-0107 §3). */
  endTime?: string;
  /** `מחר` beside it, only when the landing is not today (ADR-0160 §M) — the one case
   *  where the time alone misleads. Same token the collapsed board shows. */
  endDay?: string;
  /** How long is left, already phrased (`בעוד 1:39 שע׳`) — the answer to "when do we
   *  land", which no surface carried before this. */
  inPhrase?: string;
  code?: string;
  /** The journey's own progress, as the collapsed board's own component — rendered
   *  INSIDE this point rather than pinned to the card, because it is this point's fact
   *  and not the card's. A held span (a car hire) passes none: its end is a deadline,
   *  not a distance travelled. */
  rail?: ReactNode;
  /** A HELD span's own line instead of a rail (`אצלנו מ־11:40`) — a car you are holding
   *  has no position between two places, and its end is a deadline. */
  held?: string;
  /** The clock jump in words (`מזיזים את השעון שעה קדימה`). The amber pill stays on the
   *  collapsed board — it is the glance form of the same number, and this is the state you
   *  asked for, so it can afford a sentence. Absent on a single-zone leg, which is the
   *  pill's own gate.
   *
   *  **No "the time there" beside it**, and that is a finding rather than a cut: mid-journey
   *  the live zone IS the destination's (ADR-0107 §4 — the clock rolls at the crossing), so
   *  the card's own clock is already the time there and a second copy was the same number
   *  twice on one line. */
  clockShift?: string;
}

/** One point on the horizon, view-ready. Mirrors `lib/hero-horizon.ts`'s `HeroPoint`
 *  with everything resolved: the title is a node (the screen passes `<EventTitle/>`,
 *  so a flight still reads as its route), times are pre-formatted in their own zone
 *  (ADR-0107), and the hand-offs are callbacks rather than hrefs the domain layer
 *  would have to know how to build. */
export interface HeroLiftPoint {
  key: string;
  title: ReactNode;
  icon?: ReactNode;
  /** `קשיח` / `גמיש`, as the collapsed board says it. Absent on a point carrying
   *  `transit`, whose label is the mode's instead. */
  kind?: 'hard' | 'soft';
  /** Present → you are inside this span, and it takes the mid-span grammar. */
  transit?: HeroLiftTransit;
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
  /** **The files attached to this point** (ADR-0174 §6), each with the tap that opens it in
   *  the app's one viewer. The board is where a boarding pass is actually needed and the one
   *  surface that never showed one — so the reach is a chip in this point's OWN action row,
   *  which already reads "every way out of a point, in ONE row". */
  documents?: { key: string; title: string; onOpen: () => void }[];
  /** **The task this stop is carrying** (ADR-0160 §U) — ONE, with `taskMore` saying how many
   *  others there are, which is `פתק`'s rule and for the same reason.
   *
   *  A READ: no tick, no menu, nothing pressable at all. That is what brief §13 settled (the
   *  owner was offered the tickable version and declined), and it also pays §A's hard
   *  constraint at zero cost — §4's parser finding binds a real nested `<button>`, and a block
   *  with no control cannot reach it. */
  task?: HeroLiftTask;
  taskMore?: number;
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

/** **A task on a point** (ADR-0160 §U), view-ready — the deadline already phrased in its own
 *  zone and the assignee already resolved, exactly as every other datum on this card arrives.
 *
 *  No id and no callbacks, and that is the type carrying the decision rather than a comment
 *  asking for it: there is nothing here to resolve something from and nothing to fire, so the
 *  read cannot quietly become a completion. `HeroThen` encodes §12's condition the same way. */
export interface HeroLiftTask {
  title: string;
  important?: boolean;
  /** `עד היום 20:00` / `באיחור · אתמול 18:00`, already built with its numeric run isolated. */
  due?: { text: string; late: boolean };
  /** The face at the end of the title line (ADR-0190 §6 as amended). `name` is rendered into a
   *  visually-hidden span, because `Avatar`'s non-interactive form is `aria-hidden` and the row
   *  would otherwise say nothing at all about who owes this. */
  assignee?: { person: AvatarPerson; name: string };
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
  /** The live badge, when you are inside a span: the mode's word (`בטיסה` / `בדרך` /
   *  `הרכב אצלנו`) with the teal "where you are" blip, exactly as the collapsed board
   *  shows it. Absent → `עכשיו` and the amber blip, which is every other state. */
  liveWord?: string;
  /** In-progress points, primary first. Several with no primary is the group split
   *  (ADR-0041 §6), where every equal carries the same depth because the variant
   *  exists on there being no primary — collapsing one would manufacture it.
   *
   *  **Empty is a real state, not an absence** — it is the collapsed board's `free`
   *  variant, and the hero says so in that board's own words. */
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
  /** Whatever the collapsed board pins at its bottom, pinned here too — the day rail
   *  normally, and **the flight's own progress in transit**, which is ADR-0059 §2's rule
   *  that the transit progress replaces the rail (ADR-0160 §10).
   *
   *  Named `foot` rather than `rail` because it carries either, and the screen passes the
   *  same COMPONENT the board renders rather than a copy of its markup. Phase 3 called this
   *  `rail` and claimed exactly that, while `Home` hand-wrote a duplicate beside it. */
  foot?: ReactNode;
  /** The collapsed board this was lifted out of — the box the flight starts from and
   *  descends back to (ADR-0160 §5). Absent → no flight, and the hero is simply there,
   *  which is the correct static state under reduced motion anyway. */
  origin?: HTMLElement | null;
  onClose: () => void;
}

/** `איפה` and every way out of this point: the place on its own line, the chips in ONE
 *  row under it.
 *
 *  **It was a single wrapping row and could not hold one** (session 215). `.hero-row` is
 *  `flex-wrap: wrap`, and flex breaks lines by each item's HYPOTHETICAL size — the
 *  decision is made before `flex-shrink` runs, so `.hero-where-nm`'s `min-width: 0` and
 *  its `text-overflow: ellipsis` were unreachable code and the CHIPS were what moved.
 *  Measured on the reported flight: the name wants 247px and the two chips 153px against
 *  308px (360px phone) or 338px (390px) of row, so it is 70-100px short at every phone
 *  width — and it failed differently at each, which is why one report read as two bugs.
 *
 *  Giving the name its own line makes its ellipsis reachable and leaves the chips a row
 *  of their own, where all THREE fit: 247px against 308px. That is also why the booking
 *  reach moved in here — as its own `hero-part` it was a third stacked chip line under a
 *  wrap that had already made two. `flex-wrap` stays on the chip row as the safety net
 *  for a translation nobody has measured, but at 344px it is not reached. */
function Where({ point }: { point: HeroLiftPoint }) {
  const docs = point.documents ?? [];
  const acts = [point.onMap, point.navigateUrl, point.onBooking].some(Boolean) || docs.length > 0;
  if (!point.place && !acts) return null;
  return (
    <div className="hero-part">
      {point.place && (
        <>
          <span className="hero-lbl">{t.hero.where}</span>
          <span className="hero-where-nm" dir="auto">
            {point.place}
          </span>
        </>
      )}
      {acts && (
        <div className="hero-acts">
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
          {/* The way THROUGH to the booking — depth on any point that has one, not a
              property of the `next` slot. Wiring it only on `next` left a now point's
              booking unreachable while `canLift` counted it, which is the shape of bug
              that makes a lift open onto less than it promised. */}
          {point.onBooking && (
            <button type="button" className="hero-act time" onClick={point.onBooking}>
              <Icon name="ticket" /> {t.hero.toBooking}
            </button>
          )}
          {/* **A document is NEUTRAL, and the neutral chip was already here.** `.hero-act`'s
              base rule is a white 7% fill under `--on-dark`, and every call site above
              passes `.loc` (teal, a place) or `.time` (amber, a commitment) — so the base
              had no consumer at all until a content type arrived that rule 4 has no hue to
              lend. What `.doc` adds is a width cap and an ellipsis, because a document's
              TITLE is the only stored content in this row: a density on the shared chip,
              not a second chip (ADR-0139's rule, one surface over). */}
          {docs.map((doc) => (
            <button type="button" className="hero-act doc" key={doc.key} onClick={doc.onOpen}>
              <Icon name="documents" />
              <span className="nm" dir="auto">
                {doc.title}
              </span>
            </button>
          ))}
        </div>
      )}
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

/** `משימה` — a READ beside `פתק`, in `Note`'s own geometry (ADR-0160 §U1).
 *
 *  **The lead is the only difference between the two blocks, and that is the decision.**
 *  ADR-0191 §5 wrote the opposite down for the host surface, called it "the decision rather
 *  than an accident", shipped, and was reversed on the owner's first look at a 40px indent
 *  the measurement could have given anyone. Here it is 0px before the build, not after.
 *
 *  **The deadline gets its own line** — ADR-0191 §8's shipped answer to the identical
 *  crowding, and the render is what chose it: on one wrapping line the assignee's face
 *  landed alone underneath at 360px, which is §O's finding recurring in this very file (flex
 *  breaks lines by HYPOTHETICAL size, so `min-width: 0` and the ellipsis never run). */
function Tasks({ point }: { point: HeroLiftPoint }) {
  const task = point.task;
  if (!task) return null;
  return (
    <div className="hero-part">
      <span className="hero-lbl">{t.hero.task}</span>
      <div className="hero-task">
        {/* The glyph the tick, the mark and the section header all use — non-interactive at
            two of those three already, which is what makes this the same role rather than a
            new one. The risk that a checkbox reads as pressable on a read-only surface is
            named in §U3 and belongs to the device pass, not to a second glyph here. */}
        <span className="hero-task-ic" aria-hidden="true">
          <Icon name="checkbox" />
        </span>
        <span className="hero-task-main">
          <span className="hero-task-hd">
            {task.important && (
              <span className="hero-task-star" aria-hidden="true">
                <Icon name="star" />
              </span>
            )}
            <span className="hero-task-nm">{task.title}</span>
            {task.assignee && (
              <>
                <Avatar person={task.assignee.person} size="inherit" />
                <span className="visually-hidden">{task.assignee.name}</span>
              </>
            )}
          </span>
          {task.due && (
            <span className={task.due.late ? 'hero-task-due late' : 'hero-task-due'}>
              <Icon name="clock" /> {task.due.text}
            </span>
          )}
        </span>
      </div>
      {/* The hero shows ONE and must not imply it is all — `Note`'s rule, one block over. */}
      {!!point.taskMore && (
        <span className="hero-task-more">{t.hero.moreTasks(point.taskMore)}</span>
      )}
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
    // `data-lead`, NOT a `lead` class: `.lead` is already a GLOBAL class in
    // `screens.css` (the Glance card's row — `display: flex; align-items: baseline;
    // justify-content: space-between`), so `className="hero-point lead"` silently
    // inherited it and laid the point's parts out in a ROW. Found on a device, not in
    // review. An attribute cannot collide with a class, which is why this is one.
    <div className="hero-point" data-lead={lead || undefined}>
      {lead ? (
        <div className="hero-part">
          {/* A span you are inside keeps the collapsed board's grammar; anything else
              keeps the ordinary now-grammar. The two are exclusive by construction: a
              point with `transit` carries no `kind`, because `קשיח` on a flight you are
              sitting in says nothing you can act on. */}
          {point.transit ? (
            <>
              <div className="wp-board-now-label loc">{point.transit.label}</div>
              <div className="wp-board-now-title">
                {point.icon && <span className="wp-board-ic">{point.icon}</span>}
                {point.title}
              </div>
              <div className="wp-board-now-meta">
                <span className="tlabel loc">{point.transit.endLabel}</span>
                {point.transit.endTime && <span dir="auto">{point.transit.endTime}</span>}
                {point.transit.endDay && <span>{point.transit.endDay}</span>}
                {point.transit.inPhrase && (
                  <span className="hero-eta" dir="auto">
                    {point.transit.inPhrase}
                  </span>
                )}
                {point.transit.code && (
                  <span className="code" dir="auto">
                    {point.transit.code}
                  </span>
                )}
              </div>
              {/* The rail, INSIDE the point whose journey it draws. As the `foot` it sat
                  under `הבא בתור` and read as that event's progress. */}
              {point.transit.rail && <div className="hero-transit">{point.transit.rail}</div>}
              {/* …and a held span's line where that rail would be. */}
              {point.transit.held && (
                <div className="wp-board-held" dir="auto">
                  {point.transit.held}
                </div>
              )}
              {/* The zone crossing, said out loud. Amber: a clock jump is time (rule 4). */}
              {point.transit.clockShift && (
                <div className="hero-clockshift">
                  <Icon name="clock" />
                  {point.transit.clockShift}
                </div>
              )}
            </>
          ) : (
            <>
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
                  {point.shift != null && (
                    <ZoneShiftPill minutes={point.shift} className="on-dark" />
                  )}
                </div>
              )}
            </>
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
      <Tasks point={point} />
      <Settle point={point} />
    </div>
  );
}

export function HeroLift(props: HeroLiftProps) {
  const {
    clock,
    liveWord,
    now,
    split,
    next,
    nextLabel,
    nextTime,
    nextCode,
    countdown,
    then,
    foot,
  } = props;

  return (
    <Modal variant="lift" ariaLabel={t.hero.title} onClose={props.onClose}>
      {(close, closing) => (
        // `transit` takes the same gate as the live badge: a mid-span state wears the
        // board's transit costume on both elevations.
        <Lifted origin={props.origin ?? null} closing={closing} transit={!!liveWord}>
          <div className="hero-head">
            <div className="wp-board-top">
              {/* The live badge says what you are inside, teal, exactly as the board
                  below it does — it used to print `עכשיו` in amber while the board it was
                  lifted out of said `בטיסה` in teal. */}
              <div className={'wp-board-live' + (liveWord ? ' loc' : '')}>
                <span className="blip" />
                {liveWord ?? t.common.now}
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
            {/* **Nothing in progress still says so.** The lift opens in a GAP since
                ADR-0160's amendment §A — and a gap is exactly the state with no now
                point, so the hero's first block was `הבא בתור` and the `פנוי` /
                `זמן חופשי` the board was showing a frame earlier vanished on the way
                up. Reported from a device. Same words one elevation up, which is what
                every other state on this card already does. */}
            {now.length === 0 && (
              <div className="hero-part">
                <div className="wp-board-now-label">{t.board.freeLabel}</div>
                <div className="wp-board-now-title">{t.board.freeTitle}</div>
              </div>
            )}
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
                <Tasks point={next} />
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

          {foot && <div className="hero-foot">{foot}</div>}
        </Lifted>
      )}
    </Modal>
  );
}

/** The hero itself, and the one component that holds a ref to it.
 *
 *  Split out for a reason that is not tidiness: the flight is a hook, and inside
 *  `HeroLift` it would have to be called above the `Modal` — where the card, and so the
 *  hero, does not exist yet. A component rendered as the Modal's child mounts with the
 *  hero, so its layout effect runs with a real box to measure. */
function Lifted({
  origin,
  closing,
  transit,
  children,
}: {
  origin: HTMLElement | null;
  closing: boolean;
  /** Wear the board's in-transit costume — the teal glow. */
  transit: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLiftFlight({ subject: ref, origin, closing });
  return (
    // **`transit` is part of being the same object.** `.wp-board.transit::before` shifts the
    // top-right glow amber → teal (location), and the lifted hero was not carrying the class
    // — so mid-flight the promoted card glowed amber over a board glowing teal, which is
    // visible in the gap between them. Reported from a device: nothing else in this file
    // paints, precisely because the hero IS `.wp-board`, and that only holds if it also
    // takes the board's variant classes.
    <div className={'wp-board hero-lifted' + (transit ? ' transit' : '')} ref={ref}>
      {children}
    </div>
  );
}
