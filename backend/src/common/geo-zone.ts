// **Which IANA zone is at this coordinate** (ADR-0107/0108), in one place.
//
// `geo-tz`'s `find` returns an ARRAY, and it can be empty — so every caller has to answer the
// same two questions ("no coords?" and "no zone?") the same way. (**It is not empty over open
// ocean**, which the comment this replaced claimed: v7 covers the sea with the nautical
// `Etc/GMT±N` zones, so mid-Pacific resolves to `Etc/GMT+11`. That is a correct answer for a
// UTC offset and a poor one for a place name, but nothing here prints it.) Two call sites
// already answered them identically inline (`places.service.ts` when a picked place is
// persisted, `destinations.service.ts` when a trip's destination is resolved); the forecast
// roll-up needs the same answer for a coordinate cell, and a third copy is how the three
// drift (root rule 8).
//
// **A miss degrades, it never guesses** — the same contract `COUNTRY_CURRENCY` and
// `dayAnchorCoord` carry. A place with no coordinates has no zone by definition, and neither
// does a point in the middle of the Pacific.
import { find as findTimezone } from 'geo-tz';

export function zoneAt(lat?: number | null, lng?: number | null): string | undefined {
  if (lat === undefined || lat === null || lng === undefined || lng === null) return undefined;
  // **`geo-tz` THROWS on an out-of-range coordinate** (`Invalid latitude: 91`), which is the one
  // thing a caller must not have to know: every call site here reads a nullable `Float` written
  // by Google, by a dropped pin, or by a past version of this code, and a `500` on a bad row is
  // a worse answer than no zone. Range-checked rather than try/caught, so a genuine failure
  // inside the library still surfaces.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return findTimezone(lat, lng)[0];
}
