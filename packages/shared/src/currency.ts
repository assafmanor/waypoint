// The ISO-4217 code, as a validated value (ADR-0180 §2).
//
// Its own module for the same reason `identity.ts` is one — a value schema both
// the entity shapes and the wire schemas need — and for one structural reason
// on top: `entities.ts` carries the snapshot, the snapshot carries `fxRates`,
// and `fx.ts` needs this. Leaving it in `entities.ts` made that a cycle, and a
// cycle in zod schemas is not a lint complaint: the importing module evaluates
// first and reads `undefined` off the half-built one.
import { z } from 'zod';

/** A well-formed ISO-4217 code. **Shape only, and that is the finding rather
 *  than a shortcut** — this started as the currency twin of `timezoneSchema`,
 *  asking ICU whether the code exists, and ICU turned out not to answer that
 *  question. Measured:
 *
 *    `currency: 'ZZZ'` → no throw, formats as `‏12.30 ‏ZZZ`, exponent 2
 *    `currency: 'IL'`  → RangeError (bad shape)
 *    `currency: 'ils'` → accepted, and normalised to ₪
 *
 *  So the only thing ICU validates is that the code is three ASCII letters,
 *  which the regex already does — and the "blank screen at a render site" that
 *  justifies `timezoneSchema`'s strictness does not exist here, because a
 *  nonexistent code renders as itself instead of throwing.
 *
 *  Existence could be checked against `Intl.supportedValuesOf('currency')`, and
 *  is deliberately **not**: that list is the answering engine's, so a server on
 *  an older ICU would reject a code its own client offered. `ZWG` — in this
 *  repo's `COUNTRY_CURRENCY` — is exactly that kind of recent addition. A false
 *  rejection costs a user their preference; a false acceptance costs a code
 *  rendered verbatim, which the picker cannot produce in the first place.
 *
 *  Upper-case is required rather than normalised, so stored values are
 *  canonical and `symbol === code` comparisons stay meaningful.
 *
 *  `Trip.currency` predates this and stays a bare string for now — every value
 *  it holds came from a five-option select, so tightening it is a separate,
 *  safe change rather than a rider on this one. */
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'invalid ISO-4217 code');
