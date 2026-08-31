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
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  isRoutableMode,
  LEG_TRAVEL_MODES,
  TRAVEL_FIT,
  type LegTravelMode,
  type TravelWindow,
} from '@waypoint/shared';
import { Icon, type IconName } from '../Icon';
import { Collapsible } from '../primitives/Collapsible';
import { Skeleton } from '../feedback/Skeleton';
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
/**
 * **THE DISTANCE, AND ONE TAP TO THE MAP** — the owner's call on the block's trailing slot
 * (2026-08-27): _"No shape on the day row · I prefer מרחק, ומגע אל המפה, and it's what we mostly
 * have today (minus the touch for map)."_ The route thumbnail was measured out of the day list in
 * `a-travel-time-between-two-points-v2.html` §1d — four real legs read as four wiggly lines at
 * 46×26, one bit repeated at every hole of the densest surface in the app — and the distance in
 * that same 46px is a fact you can act on. This is the half of §1e that was drawn and never built.
 *
 * **A `role="button"` span and not a `<button>`, for `PlaceBadge`'s own documented reason:** the
 * face is itself a `<button>` once the mode disclosure is offered (§AL10), and nested buttons are
 * invalid HTML. The propagation stop is the other half of it — a tap here must reach the map, not
 * expand the mode row underneath it. Same idiom, same file's-worth of reasoning, not a second one.
 */
function DistanceToMap({
  children,
  onShowOnMap,
}: {
  children: ReactNode;
  onShowOnMap: () => void;
}) {
  const fire = (e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onShowOnMap();
  };
  return (
    <span
      className="day-trv-dist day-trv-map"
      role="button"
      tabIndex={0}
      aria-label={t.actions.showOnMap}
      title={t.actions.showOnMap}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      }}
    >
      {children}
      <span className="day-trv-map-mark" aria-hidden="true">
        <Icon name="pin" />
      </span>
    </span>
  );
}

export function JourneyBlock({
  /** The mode's noun, leading the line as the M3 mockup drew it — §D10's dodge (`הליכה · ~40 דק׳`
   *  rather than `~40 דקות הליכה`, which disagrees), and what makes the number mean anything. */
  mode,
  /** The glyph for that mode (ADR-0206 §AA3). Passed rather than derived, because this component
   *  takes every value via props and a `LegTravelMode`→`IconName` map at a presentational host is
   *  the branching `frontend/CLAUDE.md` asks to keep beside the type it feeds. */
  icon,
  /** **The composited warning mark** (ADR-0206 §AK2/§AL4) — `warn` at the tile's corner, over
   *  whatever mode glyph is there. Not a glyph per mode per state: that is 8 assets and doubles
   *  with every mode, where this is one mark that already exists. */
  flag,
  /** `~40 דק׳`. Absent on a leg with no duration, which nothing produces until M8's declared
   *  תחב״צ — the shape is here so that leg has somewhere to land. */
  duration,
  /** `2.4 ק״מ`, the routed distance. Absent where the estimate carries none. */
  distance,
  /** **The number is being computed right now** (ADR-0206 §AU1). Given, the head's duration slot
   *  holds a `Skeleton` where the `~40 דק׳` will land, so the row keeps the height it is about to
   *  have and the reader sees the shape of the answer rather than a gap. It is a placeholder and
   *  not a live mark: `.nowline` is the app's one of those (§D6), so this neither pulses nor
   *  glows — `Skeleton`'s own shimmer is the shared idle treatment every other loading surface in
   *  `ui/feedback/` already uses, which is the point of taking it from there. */
  pending,
  /** **The way from this leg to the same leg on the canvas** (owner, 2026-08-27). Given, the
   *  distance carries a small pin and becomes tappable; absent, it is the plain read-out it
   *  has always been ("absent, not broken", ADR-0121 §8). */
  onShowOnMap,
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
  /** **The mode control, behind a disclosure** (ADR-0206 §AL10). Absent where the surface offers
   *  no switch — a read-only archive (ADR-0029), and Plan's own posture. Given, the face becomes a
   *  `<button>` and the caret appears: `button.day-trv-face` has been in `day-join.css` all along
   *  and was dead code, and the docblock above explains why the acts row is a SIBLING of the face
   *  rather than a child — this is the shape that comment was holding open. */
  modes,
}: {
  mode: string;
  icon: IconName;
  flag?: boolean;
  duration?: string;
  distance?: string;
  pending?: boolean;
  onShowOnMap?: () => void;
  leave?: string;
  tone: 'time' | 'miss' | 'on-way';
  located?: string;
  action?: { label: string; onPress: () => void };
  modes?: {
    current: LegTravelMode;
    onPick: (mode: LegTravelMode) => void;
    /** Open state is the HOST's, not this component's: the day owns which hole is expanded, so
     *  two holes cannot both be open and a re-render cannot forget. */
    open: boolean;
    onToggle: () => void;
  };
}) {
  const face = (
    <>
      <span className="day-trv-ic">
        <Icon name={icon} />
      </span>
      <span className="day-trv-main">
        <span className="day-trv-hd">
          {/* **THE MARK LEFT THE GLYPH, TO KEEP §AK1'S OWN PROMISE** (owner, 2026-08-28: _"the
              warning icon is hiding the car glyph"_).

              §AK1 is the rule and it still stands: the mode mark keeps its slot, because swapping
              it for `warn` made a day of five stops read as _"three journeys and two errors"_.
              §AK2's CORNER geometry was only that rule's implementation, and it assumed the ⁦38px⁩
              tile ADR-0210 removed. A ⁦15px⁩ badge on the ⁦19px⁩ glyph that replaced it is 79% of its
              host — measured, it covers 23% of the glyph outright and its `--card` halo hides most
              of the rest — so the corner mark had begun defeating the very rule it was serving.

              Inline at the head is where §AK1 survives with no tile: the mode keeps the column, the
              warning sits with the words that say what is wrong, and it is still ONE mark taking no
              hue of its own (§AK3.1) — the head is already `--miss-deep` on this arm. */}
          {flag && (
            <span className="day-trv-flag">
              <Icon name="warn" />
            </span>
          )}
          <span>{mode}</span>
          {duration && (
            <>
              <span className="sep">·</span>
              <span>{duration}</span>
            </>
          )}
          {!duration && pending && (
            <>
              <span className="sep">·</span>
              <Skeleton className="day-trv-wait" />
            </>
          )}
        </span>
        {leave && (
          <span className="day-trv-meta">
            <span className="day-trv-leave">{leave}</span>
          </span>
        )}
      </span>
      {distance &&
        (onShowOnMap ? (
          <DistanceToMap onShowOnMap={onShowOnMap}>{distance}</DistanceToMap>
        ) : (
          <span className="day-trv-dist">{distance}</span>
        ))}
    </>
  );
  return (
    <div className={'day-trv ' + tone + (modes?.open ? ' open' : '')}>
      {modes ? (
        <button
          type="button"
          className="day-trv-face"
          aria-expanded={modes.open}
          onClick={modes.onToggle}
        >
          {face}
          <span className="day-trv-chev">
            <Icon name="caret" />
          </span>
        </button>
      ) : (
        <div className="day-trv-face">{face}</div>
      )}
      {modes && (
        // `Collapsible` rather than a hand-rolled height animation (rule 8): max-height + opacity,
        // children always rendered, reduced motion handled globally by `App.css`'s wildcard. NOT a
        // `Modal` — this is a pane OF the row, not a layer over it, so it registers no back layer
        // (`frontend/CLAUDE.md`'s `SnapSheet` distinction: back navigates, it does not close a
        // disclosure).
        <Collapsible expanded={modes.open}>
          <div className="day-trv-modes">
            {LEG_TRAVEL_MODES.map((m) => (
              <button
                key={m}
                type="button"
                // `.touch` is the shipped answer to "this chip is its surface's primary control,
                // so it owes 44px" (ADR-0017) — reached for, not re-derived.
                className={'wp-chip accent touch' + (m === modes.current ? ' on' : '')}
                aria-pressed={m === modes.current}
                // **The word moves to the accessible name; it does not disappear** (§AL7). A
                // labelled chip paints 29–31px against ADR-0017's 44px floor, and glyph-only is
                // the only shape that both fits the block's 308px inner box and reaches it.
                aria-label={t.travelMode[m]}
                onClick={() => modes.onPick(m)}
              >
                <Icon name={m} />
              </button>
            ))}
          </div>
        </Collapsible>
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

/** **Which zone each of the block's two clocks reads in** — `legDisplayZones` answers it, once,
 *  for both day surfaces. Two fields rather than one because a leg that crosses a zone has two
 *  answers, and the pair is then deliberately not subtractable: each clock agrees with the card it
 *  names, which is ADR-0107's grammar and what the row above and below this block already do. */
export interface JourneyZones {
  /** Where you are standing when you leave — the origin row's own end zone. */
  depart: string;
  /** Where the clock reads when you arrive — the destination's start zone. */
  arrive: string;
}

/** Everything a journey row needs, so the two day surfaces and the day's bookend leg cannot
 *  assemble it three different ways. */
export interface JourneyRowProps {
  journey: DayJourney;
  /** **The LEG's mode** (ADR-0206 §AM) — `transit` included, which is why this is a
   *  `LegTravelMode` and not a `TravelMode`: a declared leg is a thing this row must be able to
   *  say, and a thing no provider may be asked. */
  travelMode: LegTravelMode;
  /** **The leg's own two zones** (`legDisplayZones`, ADR-0206 §AQ) — the departure read where
   *  the traveller is standing when they go, the arrival where they get to.
   *
   *  It was one `tz`, and both hosts handed it `trip.timezone`: the trip's PRIMARY zone, which
   *  is not the day's and not the leg's. On a trip whose primary sits an hour off its events —
   *  a Georgia trip whose stops are all in Israel — the block advised `יציאה 20:31` for an event
   *  that starts at 20:00, a departure after the arrival it was counted back from. Same instant,
   *  two zones, and the row was the only clock on the screen not reading in the itinerary's. */
  zones: JourneyZones;
  /** The live hole's one control — `בדרך`, or `ביטול סימון` to take that back (ADR-0207 §7).
   *  **Trip mode's alone**: Plan has no inline settle pair (ADR-0159 §1 / ADR-0171 §10e), and the
   *  coverage mockup's Plan column draws the block with no action row for the same reason. */
  action?: { label: string; onPress: () => void };
  /** `עדיין כאן` — what a fix at the leg's origin lets the app say that the clock could not
   *  (ADR-0207 §2). Trip mode's, for the same reason as `action`. */
  located?: string;
  /** **The mode control** (ADR-0206 §AL10). Absent where the surface offers no switch. */
  modes?: {
    current: LegTravelMode;
    onPick: (mode: LegTravelMode) => void;
    open: boolean;
    onToggle: () => void;
  };
  /** **One tap to this leg on the canvas** (owner, 2026-08-27) — `legShowOnMap`, so the host does
   *  not decide which of the leg's two ends the map should light. **Both day surfaces**, because a
   *  way to the map is not a posture: ADR-0159 §1 forbids them differing about a fact, and where
   *  a leg is on the ground is one. */
  onShowOnMap?: () => void;
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
  zones,
  action,
  located,
  modes,
  onShowOnMap,
}: JourneyRowProps) {
  const overrunning = journey.arm === DAY_JOURNEY_ARM.OVERRUNS;
  /** **A declared תחב״צ leg has no duration by nature** (ADR-0206 §AA4). Not "missing" and not
   *  "loading": the whole point of the declaration is silence where the app would otherwise print
   *  a walking number for a journey nobody will walk.
   *
   *  Read off BOTH the mode and the absent number, because they are two answers to the same
   *  question and the compiler only knows about the second: `DECLARED` is the one arm carrying no
   *  `travelSeconds`, so a caller that has the arm and a caller that has the mode agree. */
  const seconds = journey.travelSeconds;
  /** **A mode the gate refuses is the OTHER reason there is no number** (ADR-0206 §AM10), and it
   *  must not borrow the declaration's words: `בלי הערכת זמן` is a statement about US, and this is
   *  a statement about the leg — nothing is coming, and the fix is to pick another mode. Read off
   *  the arm rather than off the absent number, because the absent number is now ambiguous between
   *  the two. */
  const tooFar = journey.arm === DAY_JOURNEY_ARM.TOO_FAR;
  /** **And the THIRD reason there is no number is that it has not arrived yet** (ADR-0206 §AU1).
   *  Read off the arm for `tooFar`'s exact reason, and asked BEFORE `declared` below, which infers
   *  a declaration from the absent number — an inference that was safe while `DECLARED` and
   *  `TOO_FAR` were the only two arms carrying one, and would now label a leg the server is still
   *  computing as one nobody is estimating. */
  const warming = journey.arm === DAY_JOURNEY_ARM.WARMING;
  /** **And the FOURTH is that the app has a number the ladder cannot name** (ADR-0206 §AW) — or no
   *  number at all for a mode somebody picked anyway. Read off the arm for `tooFar`'s exact reason,
   *  and before `declared` below for `warming`'s: that line infers a declaration from the absent
   *  duration, and would label a ⁦50 m⁩ drive somebody chose as a leg nobody is estimating. */
  const untimed = journey.arm === DAY_JOURNEY_ARM.UNTIMED;
  const declared =
    !tooFar && !warming && !untimed && (!isRoutableMode(travelMode) || seconds === null);
  return (
    <JourneyBlock
      mode={t.travelMode[travelMode]}
      // **The mode mark KEEPS its slot, and the warning composites over it** (ADR-0206 §AK/§AL4).
      // M6a swapped the glyph out — `overrunning ? 'warn' : travelMode` — and §AK1 is why that was
      // wrong rather than a taste: the block already takes `tone: 'miss'`, so the swap repeated the
      // state and spent the one slot carrying the mode. A day of five stops then read as three
      // journeys and two errors instead of five journeys, two of them tight.
      icon={travelMode}
      // **The mark says the JOURNEY does not work; it does not say the clock moved** (§AL5) — which
      // is one rule where §AK3.3/§AK3.4 asked for a table. `OVERRUNS` and an arrival after the
      // window shuts are facts about the leg; a passed leave-by is a fact about the hour, and the
      // block already says it in words. `ON_WAY` never takes it: somebody is moving, and a warning
      // would contradict what the state asserts.
      // …and a mode that cannot cover the leg takes it too: like an overrun it is a fact about the
      // PLAN rather than about the hour, which is exactly the line §AL5 draws.
      // …and a leg still being computed never takes it: nothing is wrong with it, the number is
      // simply on its way (§AU1).
      flag={overrunning || journey.arrivesAfterClose || tooFar}
      duration={seconds === null || declared ? undefined : (approxTravelTime(seconds) ?? undefined)}
      pending={warming}
      distance={
        journey.distanceMeters === null ? undefined : formatDistance(journey.distanceMeters)
      }
      leave={
        tooFar
          ? t.travel.tooFarFor(t.travelMode[travelMode])
          : warming
            ? t.travel.computing
            : // **The one arm whose words are chosen from the DISTANCE, not from the arm** (§AW).
              // Under the ladder's floor the app knows the length and simply cannot round it to a
              // rung, which `underMinute` says; with no estimate at all it is the declaration's own
              // absence, reached by a different road, and `noEstimate` is already the sentence for
              // it. Two states, one arm, because what the row must do — stand, and carry the
              // control — is the same for both.
              untimed
              ? journey.distanceMeters === null
                ? t.travel.noEstimate
                : t.travel.underMinute
              : declared
                ? t.travel.noEstimate
                : journeyMetaLine(journey, zones)
      }
      tone={
        // An overrun is a negative status about the plan, so it takes §D7's own paint — the same
        // `--miss` a passed leave-by does, because they are the same kind of fact about a journey
        // you are not going to make on time.
        overrunning || tooFar || journey.arm === DAY_JOURNEY_ARM.PASSED || journey.arrivesAfterClose
          ? 'miss'
          : journey.arm === DAY_JOURNEY_ARM.ON_WAY
            ? 'on-way'
            : 'time'
      }
      located={located}
      action={action}
      modes={modes}
      onShowOnMap={onShowOnMap}
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
function journeyMetaLine(journey: DayJourney, zones: JourneyZones): string | undefined {
  if (journey.arm === DAY_JOURNEY_ARM.OVERRUNS) {
    // A window you will reach after it shuts is the same fact as a leg that does not fit it, so
    // it rides this arm — and says the thing you act on rather than the arithmetic behind it.
    if (journey.arrivesAfterClose && journey.arriveAtMs !== null) {
      return t.travel.arriveAfterClose(
        ltrIsolate(`~${formatTime(new Date(journey.arriveAtMs), zones.arrive)}`),
      );
    }
    // **The shortfall AND where it lands** (ADR-0206 §AS5). `חסרות 8 דק׳ לדרך` is the size of the
    // problem; `הגעה ~13:38` is the consequence, and a reader deciding what to drop needs both.
    // The arrival is already on the arm — it has been since §AR1 — it was simply not printed.
    const shortfall = journey.free ? shortfallLine(journey.free) : undefined;
    if (!shortfall) return undefined;
    const lands =
      journey.arriveAtMs === null
        ? null
        : ltrIsolate(`~${formatTime(new Date(journey.arriveAtMs), zones.arrive)}`);
    return lands === null ? shortfall : t.travel.overrunThenArrive(shortfall, lands);
  }
  if (journey.arm === DAY_JOURNEY_ARM.PAST) {
    return journey.free?.fit === TRAVEL_FIT.OVERRUNS ? shortfallLine(journey.free) : undefined;
  }
  if (journey.arm === DAY_JOURNEY_ARM.ON_WAY) {
    const left = journey.remainingSeconds;
    const phrase = left === null ? null : approxTravelTime(left);
    return phrase ? `${t.actions.onWay} · ${t.travel.remaining(phrase)}` : t.actions.onWay;
  }
  // **WHICH OF THE TWO FACTS THE DERIVATION LEFT US** (ADR-0206 §AI, amended 2026-08-26).
  // `dayJourney` owns the decision and this only reads it: a destination with no deadline gets the
  // arrival ALONE, a leg with no slack gets both, and everything else gets the departure. Hedged
  // wherever it is an arrival, because that is an estimate carried forward.
  const at =
    journey.arriveAtMs === null
      ? null
      : ltrIsolate(`~${formatTime(new Date(journey.arriveAtMs), zones.arrive)}`);
  if (journey.leaveByMs === null) {
    if (at === null) return undefined;
    return journey.arrivesAfterClose ? t.travel.arriveAfterClose(at) : t.travel.arriveAt(at);
  }
  const clock = ltrIsolate(formatTime(new Date(journey.leaveByMs), zones.depart));
  if (journey.arm === DAY_JOURNEY_ARM.PASSED) return t.travel.leavePassed(clock);
  // Both: the departure is the origin's own end and the arrival is why that matters.
  return at === null ? t.travel.leaveAtDay(clock) : t.travel.leaveThenArrive(clock, at);
}
