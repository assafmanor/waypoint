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
import { TRAVEL_FIT, type TravelMode, type TravelWindow } from '@waypoint/shared';
import { Icon, type IconName } from '../Icon';
import { DAY_JOURNEY_ARM, type DayJourney } from '../../lib/day-joins';
import { approxTravelTime, freeTimePhrase, hoursPhrase, shortfallPhrase } from '../../lib/duration';
import { formatDistance } from '../../lib/distance';
import { formatTime } from '../../lib/time';
import { ltrIsolate } from '../../lib/bidi';
import { SECONDS_PER_MINUTE } from '../../constants';
import { t } from '../../i18n/he';
import './day-join.css';

/** Free time between two rows, stated — and offered, where the host can act on it.
 *  `minutes` is the precise elapsed count, not Plan's rounded `gapLabel`, because a statement
 *  has to be a measurement (ADR-0159 §2); the phrase is `freeTimePhrase`'s, which is the same
 *  one the journey block uses — one fact said one way, whether or not the hole has a journey in
 *  it (ADR-0206 §AH1). It took MINUTES rather than a formatted string from that change onward,
 *  because the agreement is composed from the count.
 *
 *  `onFill` is what makes it a control. Absent it stays the `<span>` row it was — a past day
 *  is read-only (ADR-0029), and a strip that looks tappable and is not would be worse than
 *  the statement it replaced. */
export function GapStrip({ minutes, onFill }: { minutes: number; onFill?: () => void }) {
  const length = hoursPhrase(minutes);
  const body = (
    <>
      <span className="day-gap-line" />
      <span className="day-gap-lbl">{freeTimePhrase(minutes) ?? t.day.join.free(length)}</span>
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
}: {
  mode: string;
  icon: IconName;
  duration?: string;
  distance?: string;
  leave?: string;
  tone: 'time' | 'miss' | 'on-way';
  located?: string;
  action?: { label: string; onPress: () => void };
}) {
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
        {leave && (
          <span className="day-trv-meta">
            <span className="day-trv-leave">{leave}</span>
          </span>
        )}
      </span>
      {distance && <span className="day-trv-dist">{distance}</span>}
    </>
  );
  return (
    <div className={'day-trv ' + tone}>
      <div className="day-trv-face">{face}</div>
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
}

/**
 * **A journey, formatted.** One component, three hosts: Trip mode's holes, Trip mode's bookend leg
 * (which has no join above it, ADR-0206 §AD, so it renders outside the block loop), and **Plan
 * mode**, whose own column in [`where-a-route-shows-up-v1.html`](../../../../mockups/where-a-route-shows-up-v1.html)
 * §2 draws `trvBlock() + planSlot(…)` — the block AND the chip. Three assemblies of these props is
 * how the same journey would start reading three ways.
 */
export function JourneyRow({ journey, travelMode, tz, action, located }: JourneyRowProps) {
  const overrunning = journey.arm === DAY_JOURNEY_ARM.OVERRUNS;
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
      tone={
        // An overrun is a negative status about the plan, so it takes §D7's own paint — the same
        // `--miss` a passed leave-by does, because they are the same kind of fact about a journey
        // you are not going to make on time.
        overrunning || journey.arm === DAY_JOURNEY_ARM.PASSED || journey.arrivesAfterClose
          ? 'miss'
          : journey.arm === DAY_JOURNEY_ARM.ON_WAY
            ? 'on-way'
            : 'time'
      }
      located={located}
      action={action}
    />
  );
}

/**
 * **What a leg that does not fit says**, shared by the live arm and the record so the same hole
 * cannot be described two ways depending on the hour it is read at.
 *
 * With **no gap at all** the shortfall is the wrong thing to say: two rows that touch have no gap
 * for the journey to be longer THAN, and the shortfall would be the journey's own duration, which
 * the head one line up already carries. Covers an overlap too, where it is just as true.
 */
function shortfallLine(free: TravelWindow): string | undefined {
  if (free.availableSeconds <= 0) return t.travel.noTimeForTravel;
  return shortfallPhrase(free.overrunSeconds / SECONDS_PER_MINUTE) ?? undefined;
}

/**
 * **What the journey's second line says**, and each arm is a decision about what may be claimed.
 *
 * `OVERRUNS` says the **shortfall** and nothing about leaving: a leg that does not fit has a
 * leave-by behind the previous stop's own end, so an instruction to go would be advice about a
 * departure that was never possible. The number you act on is how much has to move.
 *
 * `PAST` drops the leave-by — a day read at 22:00 would otherwise print `זמן היציאה עבר` on every
 * hole of the afternoon — and keeps the **shortfall**, where there was one. That is ADR-0206 §AH1:
 * `dayJourney` checks `PAST` first on purpose, so a hole behind you that the walk never fitted was
 * falling through to `freeSeconds`, which is CLAMPED at zero, and the record it kept read
 * `פנוי לפני 0 דק׳` — nought minutes of free time, where the truth is a journey nobody could make.
 * Same sentence as the live arm, and the TONE stays `PAST`'s quiet: a finished day painted in
 * `--miss` warns about something nobody can act on, which is the opposite of §D7's reason to exist.
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
    // A window you will reach after it shuts is the same fact as a leg that does not fit it, so
    // it rides this arm — and says the thing you act on rather than the arithmetic behind it.
    if (journey.arrivesAfterClose && journey.arriveAtMs !== null) {
      return t.travel.arriveAfterClose(
        ltrIsolate(`~${formatTime(new Date(journey.arriveAtMs), tz)}`),
      );
    }
    return journey.free ? shortfallLine(journey.free) : undefined;
  }
  if (journey.arm === DAY_JOURNEY_ARM.PAST) {
    return journey.free?.fit === TRAVEL_FIT.OVERRUNS ? shortfallLine(journey.free) : undefined;
  }
  if (journey.arm === DAY_JOURNEY_ARM.ON_WAY) {
    const left = journey.remainingSeconds;
    const phrase = left === null ? null : approxTravelTime(left);
    return phrase ? `${t.actions.onWay} · ${t.travel.remaining(phrase)}` : t.actions.onWay;
  }
  // **THE ARRIVAL, WHERE A DEPARTURE MAY NOT BE STATED** (ADR-0206 §AI). `dayJourney` has already
  // decided that — a flexible destination, or a leave-by behind its own origin — so this only asks
  // which fact it was left with. Hedged, because it is an estimate carried forward.
  if (journey.leaveByMs === null) {
    if (journey.arriveAtMs === null) return undefined;
    const at = ltrIsolate(`~${formatTime(new Date(journey.arriveAtMs), tz)}`);
    return journey.arrivesAfterClose ? t.travel.arriveAfterClose(at) : t.travel.arriveAt(at);
  }
  const clock = ltrIsolate(formatTime(new Date(journey.leaveByMs), tz));
  return journey.arm === DAY_JOURNEY_ARM.PASSED
    ? t.travel.leavePassed(clock)
    : t.travel.leaveAtDay(clock);
}
