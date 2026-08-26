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
import type { TravelMode } from '@waypoint/shared';
import { Icon, type IconName } from '../Icon';
import { DAY_JOURNEY_ARM, type DayJourney } from '../../lib/day-joins';
import { approxTravelTime, hoursPhrase } from '../../lib/duration';
import { formatDistance } from '../../lib/distance';
import { formatTime } from '../../lib/time';
import { ltrIsolate } from '../../lib/bidi';
import { SECONDS_PER_MINUTE } from '../../constants';
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

/**
 * **THE JOURNEY, AS AN OBJECT IN THE DAY** (ADR-0206 §V1.1 / §V1.3 / §V1.4, drawn in
 * [`a-travel-time-between-two-points-v2.html`](../../../../mockups/a-travel-time-between-two-points-v2.html) §1).
 *
 * It **replaces** `GapStrip` in a hole that has a journey in it rather than sitting beside it —
 * owner's review, round 1: _"much more route oriented … a real visual thing … we need this
 * crystal clear."_ The first draft of that was a run of text inside the strip and it was measured
 * against the wrong thing (how much dashed rule survived); what the day owes is to read
 * `place · journey · place`, which is §V1.3's own sentence.
 *
 * **And it absorbs the free-time statement rather than adding a second row**, which is what keeps
 * ADR-0159's one-slot rule: measured at ⁦58px⁩ against ⁦87px⁩ for a strip plus a block, with both of
 * `freeAfterTravel`'s numbers still said. It also **ignores `GAP_MIN_MINUTES`**, for
 * `ConnectionBand`'s own reason — a 45-minute hole holding a 40-minute walk is exactly the one
 * the day must not stay silent about, and no free-time threshold would ever surface it.
 *
 * Every value arrives formatted, isolated and hedged, like every other `ui/domain/` component:
 * `duration` is `approxDuration`'s (the `~` INSIDE the bidi isolate — outside it renders `23~`),
 * `distance` is `formatDistance` over the ROUTED metres, and `leave` is `t.travel`'s.
 *
 * **The mode row is deliberately absent and M8 owns it** (§AA4): the four chips and the declared
 * תחב״צ state ride the per-leg override, and `.day-trv-acts`' `margin-inline-start: auto` is the
 * slot they land in — a one-line addition rather than a reshape.
 */
export function JourneyBlock({
  /** The mode's noun, leading the line as the M3 mockup drew it — §D10's dodge (`הליכה · ~40 דק׳`
   *  rather than `~40 דקות הליכה`, which disagrees), and what makes the number mean anything. */
  mode,
  /** The glyph for that mode (ADR-0206 §AA3). Passed rather than derived, because this component
   *  takes every value via props and a `TravelMode`→`IconName` map at a presentational host is
   *  the branching `frontend/CLAUDE.md` asks to keep beside the type it feeds. */
  icon,
  /** `~40 דק׳`. Absent on a leg with no duration, which nothing produces until M8's declared
   *  תחב״צ — the shape is here so that leg has somewhere to land. */
  duration,
  /** `2.4 ק״מ`, the routed distance. Absent where the estimate carries none. */
  distance,
  /** `יציאה 17:15`, or `זמן היציאה עבר ב־17:15`, or the `בדרך` line. Absent on a hole that is
   *  behind you and on one whose origin claim was denied (ADR-0208 §2) — both are journeys the
   *  day may still MEASURE and may not give advice about. */
  leave,
  /** What is free once the journey is counted (§V1.1) — the correction this epic leads with.
   *  Absent on the day's first leg, which has no window to measure against (§AD). */
  free,
  /** `time` is amber (§D1). `miss` is the leave-by gone by, in `--miss` — **ink and word only**,
   *  no fill on the block, no glow and no pulse, because the app has one live mark and `.nowline`
   *  is it (§D6/§D7). `on-way` is teal, because somebody said they are moving and that is a
   *  location claim (rule 4, ADR-0141's journey grammar). */
  tone,
  /** **What a device position adds, when there is one** (ADR-0207 §2) — `עדיין כאן` beside a
   *  passed leave-by, which is the app saying it checked rather than assumed. */
  located,
  /** **The one control on the block**, and the tone decides what it means: `בדרך` on `miss`
   *  (answer the mark), `ביטול סימון` on `on-way` (take it back — ADR-0207 §7, because a toast is
   *  transient and a mark is not). */
  action,
  /** What a tap on the block opens (ADR-0161 §9) — the same fill the strip it replaces offers,
   *  because absorbing the free-time statement must not delete the free time's one affordance.
   *  Absent on a read-only archive, exactly as on `GapStrip`. */
  onFill,
  /** The accessible name for that tap. */
  fillLabel,
}: {
  mode: string;
  icon: IconName;
  duration?: string;
  distance?: string;
  leave?: string;
  free?: string;
  tone: 'time' | 'miss' | 'on-way';
  located?: string;
  action?: { label: string; onPress: () => void };
  onFill?: () => void;
  fillLabel?: string;
}) {
  // Each run carries its own tone rather than being matched back to the prop it came from: the
  // leave-by is the clock's (amber, or `--miss` once it has gone by) and the free time has no hue
  // at all, because free time is neither commitment nor location and rule 4 has no fourth colour.
  const meta = [
    { text: leave, cls: 'day-trv-leave' },
    { text: free, cls: 'day-trv-free' },
  ].filter((run): run is { text: string; cls: string } => !!run.text);
  const face = (
    <>
      <span className="day-trv-ic">
        <Icon name={icon} />
      </span>
      <span className="day-trv-main">
        <span className="day-trv-hd">
          <span>{mode}</span>
          {duration && (
            <>
              <span className="sep">·</span>
              <span>{duration}</span>
            </>
          )}
        </span>
        {meta.length > 0 && (
          <span className="day-trv-meta">
            {meta.map((run, i) => (
              // `·` is the app's separator and it is a NODE rather than part of a string, so a
              // dimmed dot needs no second copy of the runs around it (§D10: never an em dash).
              <span key={run.cls} className={run.cls}>
                {i > 0 && <span className="sep">· </span>}
                {run.text}
              </span>
            ))}
          </span>
        )}
      </span>
      {distance && <span className="day-trv-dist">{distance}</span>}
      {onFill && (
        <span className="day-trv-add" aria-hidden="true">
          <Icon name="plus" />
        </span>
      )}
    </>
  );
  return (
    <div className={'day-trv ' + tone}>
      {onFill ? (
        <button type="button" className="day-trv-face" onClick={onFill} aria-label={fillLabel}>
          {face}
        </button>
      ) : (
        <div className="day-trv-face">{face}</div>
      )}
      {(action || located) && (
        // **`עדיין כאן` sits on the ACTS row, not on the meta line**, and the reason is a
        // measurement rather than a preference: beside `זמן היציאה עבר ב־17:15` it is ⁦187.09px⁩ of
        // ink in a ⁦180.75px⁩ box at 360, so `text-overflow: ellipsis` ate the end of it. Here it
        // costs zero extra height — the row already exists on every arm that can earn the mark —
        // and it is also where the mark BELONGS: the app saying it checked, beside the verb that
        // answers it, which is the pairing the hero's own row already makes.
        <div className="day-trv-acts">
          {located && (
            <span className="day-trv-here">
              <Icon name="pin" />
              <span>{located}</span>
            </span>
          )}
          {action && (
            <button type="button" className="day-trv-act" onClick={action.onPress}>
              <Icon name="navigate" />
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Everything a journey row needs, so the two day surfaces and the day's bookend leg cannot
 *  assemble it three different ways. */
export interface JourneyRowProps {
  journey: DayJourney;
  travelMode: TravelMode;
  /** The DAY's own zone, which is what the leave-by is read in: it is a moment on the wrist of
   *  whoever is leaving, and this list is that day's. */
  tz: string;
  /** The live hole's one control — `בדרך`, or `ביטול סימון` to take that back (ADR-0207 §7).
   *  **Trip mode's alone**: Plan has no inline settle pair (ADR-0159 §1 / ADR-0171 §10e), and the
   *  coverage mockup's Plan column draws the block with no action row for the same reason. */
  action?: { label: string; onPress: () => void };
  /** `עדיין כאן` — what a fix at the leg's origin lets the app say that the clock could not
   *  (ADR-0207 §2). Trip mode's, for the same reason as `action`. */
  located?: string;
  onFill?: () => void;
  /** The length the fill's accessible name states — the NARROWED slot's, not the hole's. */
  fillMinutes?: number;
}

/**
 * **A journey, formatted.** One component, three hosts: Trip mode's holes, Trip mode's bookend leg
 * (which has no join above it, ADR-0206 §AD, so it renders outside the block loop), and **Plan
 * mode**, whose own column in [`where-a-route-shows-up-v1.html`](../../../../mockups/where-a-route-shows-up-v1.html)
 * §2 draws `trvBlock() + planSlot(…)` — the block AND the chip. Three assemblies of these props is
 * how the same journey would start reading three ways.
 */
export function JourneyRow({
  journey,
  travelMode,
  tz,
  action,
  located,
  onFill,
  fillMinutes,
}: JourneyRowProps) {
  const overrunning = journey.arm === DAY_JOURNEY_ARM.OVERRUNS;
  // **THE FREE TIME RIDES THE QUIET ARMS ONLY**, which is what the v2 mockup's §1 drew and what
  // the render then insisted on. Three independent reasons, and the last is why it is not a taste
  // call: on a passed leave-by "what is free before the walk" is a number about a departure you
  // have already missed, so the urgent fact should have the line to itself; the drawing carries
  // the mark alone on both urgent states; and measured at 360 in Chromium the two runs together
  // are ⁦219.70px⁩ of ink in a ⁦180.75px⁩ box — `text-overflow: ellipsis` was eating the free time on
  // exactly the arm that matters, and pushing `עדיין כאן` out of the block's own edge.
  const quiet = journey.arm === DAY_JOURNEY_ARM.AHEAD || journey.arm === DAY_JOURNEY_ARM.PAST;
  const freeSeconds = quiet ? journey.free?.freeSeconds : undefined;
  return (
    <JourneyBlock
      mode={t.travelMode[travelMode]}
      // **The warn glyph REPLACES the mode mark on an infeasible leg**, as the coverage mockup's
      // `tight` state draws it: the badge column is where the day says what kind of thing this
      // row is, and what this row is is a problem. The mode is still named in the head beside the
      // duration, so nothing is lost.
      icon={overrunning ? 'warn' : travelMode}
      duration={approxTravelTime(journey.travelSeconds) ?? undefined}
      distance={
        journey.distanceMeters === null ? undefined : formatDistance(journey.distanceMeters)
      }
      leave={journeyMetaLine(journey, tz)}
      free={
        freeSeconds === undefined
          ? undefined
          : t.travel.freeBefore(hoursPhrase(Math.round(freeSeconds / SECONDS_PER_MINUTE)))
      }
      tone={
        // An overrun is a negative status about the plan, so it takes §D7's own paint — the same
        // `--miss` a passed leave-by does, because they are the same kind of fact about a journey
        // you are not going to make on time.
        overrunning || journey.arm === DAY_JOURNEY_ARM.PASSED
          ? 'miss'
          : journey.arm === DAY_JOURNEY_ARM.ON_WAY
            ? 'on-way'
            : 'time'
      }
      located={located}
      action={action}
      onFill={onFill}
      fillLabel={
        fillMinutes === undefined ? undefined : t.day.join.fillFree(hoursPhrase(fillMinutes))
      }
    />
  );
}

/**
 * **What the journey's second line says**, and each arm is a decision about what may be claimed.
 *
 * `OVERRUNS` says the **shortfall** and nothing about leaving: a leg that does not fit has a
 * leave-by behind the previous stop's own end, so an instruction to go would be advice about a
 * departure that was never possible. The number you act on is how much has to move.
 *
 * `PAST` says nothing at all: a hole whose next row has already started is a record, and without
 * this a day read at 22:00 prints `זמן היציאה עבר` on every hole of the afternoon.
 *
 * `ON_WAY` reports what is LEFT rather than the leg's total (ADR-0207 §6), because the stale total
 * reads as "44 minutes still to walk" two minutes from the door — not more honest but less. It
 * refuses when the crow ratio is noise, and then carries the mark alone.
 *
 * The clock is read in the DAY's own zone and isolated: it is a digit run inside Hebrew and the
 * maqaf before it is a strong RTL character (ADR-0118).
 */
function journeyMetaLine(journey: DayJourney, tz: string): string | undefined {
  if (journey.arm === DAY_JOURNEY_ARM.OVERRUNS) {
    // No gap to be longer than, so the shortfall is not what to say — and with a zero gap it is
    // the journey's own duration, which the head already carries.
    if ((journey.free?.availableSeconds ?? 0) <= 0) return t.travel.noTimeForTravel;
    const over = journey.overrunSeconds;
    return over === null
      ? undefined
      : t.travel.tooLongBy(hoursPhrase(Math.max(1, Math.round(over / SECONDS_PER_MINUTE))));
  }
  if (journey.arm === DAY_JOURNEY_ARM.ON_WAY) {
    const left = journey.remainingSeconds;
    const phrase = left === null ? null : approxTravelTime(left);
    return phrase ? `${t.actions.onWay} · ${t.travel.remaining(phrase)}` : t.actions.onWay;
  }
  if (journey.leaveByMs === null) return undefined;
  const clock = ltrIsolate(formatTime(new Date(journey.leaveByMs), tz));
  return journey.arm === DAY_JOURNEY_ARM.PASSED
    ? t.travel.leavePassed(clock)
    : t.travel.leaveAtDay(clock);
}
