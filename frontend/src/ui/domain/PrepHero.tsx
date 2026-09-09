// **The prep hero's face** (ADR-0221) — the collapsed plan hero, as one presentational
// component with two hosts: Plan Home (where it lifts, ADR-0193 §4) and the first morning
// on Trip Home, where it is the plan face that turns into the board (§4 of this ADR).
//
// Its ENERGY IS A FUNCTION OF THE DISTANCE TO DEPARTURE (`data-tier`, `lib/prep-tier.ts`):
// far out it is the card that shipped; inside the last week the numeral grows and a runway
// of seven lamps lights one per day behind you; the day before, the headline is a
// departure-board clock in split-flap cells counting to the first timed thing on day 1,
// and the word (`מחר`) drops to the kicker. A standalone word (`מחרתיים`, `מחר`) rides in
// the VALUE slot — `countdownParts` returns it as a unit, and printing a unit in the 15px
// rung is what made the two days that matter the smallest countdown the card ever showed.
//
// Presentational: every fact arrives formatted, and nothing here reads state. **Nothing
// interactive may ever go inside** — the Plan host renders this as a `<button>`, and Chrome
// closes a `<button>` at a nested one (ADR-0160 §4). `PlanHome.lift.test.tsx` fails the
// build if a control appears here; the flap clock is a `role="timer"` read, not a control.
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { PREP_TIER, type PrepTier } from '../../lib/prep-tier';
import { FlapClock } from './FlapClock';
import { formatTripDates } from '../../lib/time';
import { dayPhrase } from '../../lib/hebrew';
import { tripDayNumber } from '../../lib/time';
import { DOT_SEPARATOR } from '../../constants';
import { t } from '../../i18n/he';

export interface PrepHeroCountdown {
  prefix: string;
  value: string;
  unit: string;
}

/** The eve's sentence: what the clock counts to. `title` is absent when day 1 has nothing
 *  timed and the clock counts to the day itself. */
export interface PrepHeroEve {
  targetMs: number;
  title?: string;
  icon?: string;
  time?: string;
}

export interface PrepHeroProps {
  tier: PrepTier;
  /** `null` once the trip is underway with no day-1 face to show — the `הטיול בעיצומו`
   *  fallback for a Plan peek mid-trip. */
  countdown: PrepHeroCountdown | null;
  dates: ReactNode;
  readinessPct: number;
  openTasks: number;
  overdue: number;
  /** Seven lamps, lit per day behind you. Present on the `week` tier only. */
  runway?: boolean[] | null;
  /** Present on the `eve` tier only. */
  eve?: PrepHeroEve | null;
  /** The clock's now. The hero re-renders once a second through `useClock` at its host. */
  nowMs: number;
  /** A `<button>` when there is a run-up to open, the `<div>` it always was when there is
   *  not (ADR-0193 §4 / ADR-0150 §8). */
  onPress?: (el: HTMLElement) => void;
  onRebuff?: (el: HTMLElement) => void;
  /** While lifted the hero is the same object one elevation up (`visibility`, never
   *  `display` — the descent measures this box). */
  lifted?: boolean;
  /** `aria-label` for the pressable form. */
  pressLabel?: string;
}

/** **The countdown block** — kicker, headline (a word, a numeral, or the eve's flap clock),
 *  the dates, the runway, the eve's sentence. Exported because the lifted card (`PlanLift`)
 *  composes the SAME block one elevation up beside its close control (ADR-0193 §5: "same
 *  markup, not a re-statement"; ADR-0221 §7 — the lifted card had re-typed this head by
 *  hand and so missed every tier). */
export type PrepHeroCountProps = Pick<
  PrepHeroProps,
  'tier' | 'countdown' | 'dates' | 'runway' | 'eve' | 'nowMs'
>;

export function PrepHeroCount({ tier, countdown, dates, runway, eve, nowMs }: PrepHeroCountProps) {
  const clockHeadline = tier === PREP_TIER.EVE && !!eve && !!countdown;
  const standalone = !!countdown && !countdown.value && !countdown.prefix;
  return (
    <>
      {countdown &&
        (clockHeadline ? (
          // The word the clock counts to keeps the kicker's rung, one size up.
          <div className="prep-k prep-k-eve">
            {t.planHome.prep.departIn} {countdown.unit}
          </div>
        ) : (
          <div className="prep-k">{t.planHome.prep.departIn}</div>
        ))}
      {clockHeadline ? (
        <FlapClock className="prep-count" nowMs={nowMs} targetMs={eve!.targetMs} />
      ) : countdown ? (
        <div className="prep-count">
          {standalone ? (
            <span className="prep-count-n">{countdown.unit}</span>
          ) : (
            <>
              {countdown.prefix && <span className="prep-count-u">{countdown.prefix}</span>}{' '}
              {countdown.value && (
                <span className="prep-count-n" dir="auto">
                  {countdown.value}
                </span>
              )}{' '}
              <span className="prep-count-u">{countdown.unit}</span>
            </>
          )}
        </div>
      ) : (
        <div className="prep-count">{t.planHome.prep.underway}</div>
      )}
      <div className="prep-dates">{dates}</div>
      {runway && tier === PREP_TIER.WEEK && (
        <div className="prep-runway" aria-hidden="true">
          {runway.map((lit, i) => (
            <i key={i} className={lit ? 'on' : undefined} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}
      {clockHeadline && eve!.title && (
        <div className="prep-eve">
          <span>
            {eve!.icon && (
              <span className="prep-eve-ic" aria-hidden="true">
                {eve!.icon}
              </span>
            )}
            {eve!.title}
            {eve!.time && (
              <>
                {' '}
                <span dir="auto">{eve!.time}</span>
              </>
            )}
          </span>
        </div>
      )}
    </>
  );
}

/** **The two numbers**, exactly as ADR-0193 §2 prints them, shared by both hosts for the
 *  same reason as the block above. A full bar is a STATUS and takes `--ok` (rule 4);
 *  anything less stays the plan ink. */
export function PrepHeroNumbers({
  readinessPct,
  openTasks,
  overdue,
}: Pick<PrepHeroProps, 'readinessPct' | 'openTasks' | 'overdue'>) {
  return (
    <>
      <div className="prep-ready">
        <div className="prep-ready-top">
          <span>{t.planHome.prep.readiness}</span>
          <b dir="auto">{readinessPct}%</b>
        </div>
        <div className="prep-track">
          <div
            className={readinessPct >= 100 ? 'prep-fill is-full' : 'prep-fill'}
            style={{ width: `${readinessPct}%` }}
          />
        </div>
      </div>
      {openTasks > 0 && (
        <div className="prep-tasks">
          <span>{t.planHome.prep.openTasks}</span>
          <span className="prep-tasks-end">
            {overdue > 0 && (
              <span className="prep-tasks-late">{t.tasks.band.overdue(overdue)}</span>
            )}
            <b className="prep-tasks-n" dir="auto">
              {openTasks}
            </b>
          </span>
        </div>
      )}
    </>
  );
}

export const PrepHero = forwardRef<HTMLElement, PrepHeroProps>(function PrepHero(props, ref) {
  const { tier } = props;
  const inner = (
    <>
      <PrepHeroCount
        tier={tier}
        countdown={props.countdown}
        dates={props.dates}
        runway={props.runway}
        eve={props.eve}
        nowMs={props.nowMs}
      />
      <PrepHeroNumbers
        readinessPct={props.readinessPct}
        openTasks={props.openTasks}
        overdue={props.overdue}
      />
    </>
  );

  if (props.onPress) {
    return (
      <button
        type="button"
        className={'prep is-tappable' + (props.lifted ? ' is-lifted' : '')}
        data-tier={tier}
        ref={ref as React.Ref<HTMLButtonElement>}
        onClick={(e) => props.onPress!(e.currentTarget)}
        aria-label={props.pressLabel}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      className="prep"
      data-tier={tier}
      ref={ref as React.Ref<HTMLDivElement>}
      onClick={props.onRebuff && ((e) => props.onRebuff!(e.currentTarget))}
    >
      {inner}
    </div>
  );
});

/** The dates line both hosts print: `⁦11–22⁩ בספטמבר · 12 ימים`. The range is an isolated
 *  numeric island (ADR-0118) — `formatTripDates` does that itself now (ADR-0221 §5). */
export function PrepDates({ startDate, endDate }: { startDate: string; endDate: string }) {
  return (
    <>
      {formatTripDates(startDate, endDate, { style: 'prose' })}{' '}
      <span className="dot">{DOT_SEPARATOR}</span> {dayPhrase(tripDayNumber(endDate, startDate))}
    </>
  );
}
