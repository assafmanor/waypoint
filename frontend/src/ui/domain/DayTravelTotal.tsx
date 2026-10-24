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
import { hasTravelTotal, type DayTravelTotal as DayTravelTotalValue } from '../../lib/day-joins';
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
 *
 * **And a floor says it is one** (ADR-0206 §AT2). Where a hole has an end nobody placed, both
 * halves are missing that leg for good, so the line leads with `לפחות` — the same numbers, saying
 * what they cover. It wraps the whole line rather than tagging the end of it, because each half is
 * a floor and a trailing qualifier would read as belonging to the minutes.
 */
export function DayTravelTotal({ total }: { total: DayTravelTotalValue }) {
  const distance = total.distanceMeters !== null ? formatDistance(total.distanceMeters) : null;
  const air = total.airMeters !== null ? formatDistance(total.airMeters) : null;
  // **A day that only flies still has a total**, which is the reason the guard widened: before
  // ADR-0212 no distance meant no travel, and now a day whose whole movement is a flight has a
  // real number and an empty ground half. Absent stays absent — a day with neither reads exactly
  // as it always did (§D4).
  //
  // The condition itself moved to `hasTravelTotal` (ADR-0215 §6) so a host that puts something
  // BESIDE this line — the glance card's foot, and its `·` — asks the same question rather than
  // keeping a second copy that could answer differently and leave an orphan separator.
  if (!hasTravelTotal(total)) return null;
  const duration = total.travelSeconds !== null ? approxTravelTime(total.travelSeconds) : null;
  const ground = distance && duration ? t.travel.dayTotal(distance, duration) : distance;
  return (
    <div className="day-total">
      {ground && (
        <>
          <span className="day-total-ic" aria-hidden="true">
            <Icon name="navigate" />
          </span>
          <span className="day-total-n">
            {total.partial ? t.travel.dayTotalFloor(ground) : ground}
          </span>
        </>
      )}
      {/* **THE AIR HALF TAKES `flight`, AND THAT IS THIS COMPONENT'S OWN RULE APPLIED TWICE**
          (ADR-0212 §3). The docblock above already refuses a mode glyph here because _"a
          `walking` glyph would be the same false claim the copy just dropped"_ — and a total
          that is 98% airborne under a navigation arrow is that sentence one row later. So the
          ground half keeps `navigate`, which is true of everything it counts, and the carried
          half says what it is. The floor qualifier is the GROUND half's: an unplaced hole is a
          leg nobody could measure, and a flight's two endpoints are picked places or it has no
          distance at all. */}
      {air && (
        <span className="day-total-air">
          <span className="day-total-ic" aria-hidden="true">
            <Icon name="flight" />
          </span>
          <span className="day-total-n">{air}</span>
        </span>
      )}
    </div>
  );
}
