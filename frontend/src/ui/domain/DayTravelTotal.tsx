// **HOW FAR THE DAY GOES** (ADR-0206 §V1.9, amended §AP) — `3.2 ק״מ · ~48 דק׳`.
//
// **A component rather than a line at each screen, because it renders on BOTH day surfaces.** A
// day's total distance is a FACT, and ADR-0159 §1 allows `DayView` and `PlanDay` to differ in
// posture and forbids them differing about a fact — so the words, the order and the separator are
// decided once here. `frontend/CLAUDE.md` names the alternative by name ("changing a day-surface
// derivation in `DayView` only") as having cost a release twice.
//
// Presentational and prop-fed, like everything else in `ui/domain/`: the derivation is
// `dayTravelTotal` (`lib/day-joins.ts`), the roll-up of the journeys the rows themselves drew.
import { formatDistance } from '../../lib/distance';
import { approxTravelTime } from '../../lib/duration';
import { type DayTravelTotal as DayTravelTotalValue } from '../../lib/day-joins';
import { t } from '../../i18n/he';
import { Icon } from '../Icon';

/**
 * **Hidden rather than zero**, which is §D4 and not an omission: a day nothing could be measured
 * on and a day with no travel in it must read the same, or the reader can tell "not computed"
 * from "not computable" — and `0 ק״מ` is exactly that tell.
 *
 * **The distance may stand alone and the duration may not.** A day of declared תחב״צ legs has real
 * kilometres and no minutes this app may state (§AA4), so half a line is the honest read there.
 * The mirror case does not arise — an estimate carries both — but a duration with no distance
 * would be a number about nothing, so it is not rendered on its own.
 *
 * **No mode glyph.** The mode is per-leg since M8b, so `navigate` is the one mark that stays true
 * on a day that walks, declares and drives; a `walking` glyph here would be the same false claim
 * the copy just dropped.
 */
export function DayTravelTotal({ total }: { total: DayTravelTotalValue }) {
  const distance = total.distanceMeters !== null ? formatDistance(total.distanceMeters) : null;
  if (!distance) return null;
  const duration = total.travelSeconds !== null ? approxTravelTime(total.travelSeconds) : null;
  return (
    <div className="day-total">
      <span className="day-total-ic" aria-hidden="true">
        <Icon name="navigate" />
      </span>
      <span className="day-total-n">
        {duration ? t.travel.dayTotal(distance, duration) : distance}
      </span>
    </div>
  );
}
