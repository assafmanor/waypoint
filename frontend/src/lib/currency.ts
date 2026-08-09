// Which currency a destination pick implies (ADR-0180 §1).
//
// Two one-line rules, and they live here rather than inline at the two call
// sites for one reason: **they are deliberately different from each other**, and
// an asymmetry expressed as an `if` in one of two components is an asymmetry
// that drifts. The zone's version of exactly this rule is written as a prose
// comment in `CreateTrip` and another in `TripSettings`, with no test tying them
// together — which is the shape of thing that quietly diverges for a release.
//
// The asymmetry itself, from ADR-0113's amendment and inherited here: creation
// has no prior value to protect, so a pick that resolves nothing leaves the
// field empty; an established trip already carries a meaningful value, so a
// pick that resolves nothing must leave it alone rather than clear it.
import { currencyForCountry } from '@waypoint/shared';
import { DEVICE_REGION } from '../constants';

/** Creation: whatever the country implies, including **nothing**. There is no
 *  prior value, so a country the table does not carry simply leaves the new
 *  trip without a currency — which trip settings can then fill in. */
export function currencyForNewTrip(countryCode?: string): string | undefined {
  return currencyForCountry(countryCode);
}

/** Editing: the country's currency when it has one, otherwise **keep what is
 *  there**. A "use as typed" destination and a country outside the table are
 *  the same case, and neither is a reason to blank a field the trip already
 *  had — the destination changed, our knowledge of it did not improve. */
export function currencyAfterDestinationEdit(
  countryCode: string | undefined,
  current: string | undefined,
): string | undefined {
  return currencyForCountry(countryCode) ?? current;
}

/** The member's home currency before they have ever chosen one (ADR-0180 §2) —
 *  the device's region through the same table the trip's own currency uses.
 *  `undefined` when the platform locale carries no region, or carries one the
 *  table does not know; the caller then has no default and asks. */
export function currencyForDeviceRegion(): string | undefined {
  return currencyForCountry(DEVICE_REGION);
}
