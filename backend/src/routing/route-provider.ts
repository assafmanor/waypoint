// **The port** (ADR-0205 §2), and the reason it exists before there is a second implementation
// is stated there: the provider question is the one that ADR most wants to leave open, and a
// self-host or a move to Geoapify has to be a file rather than a rewrite.
//
// So nothing below names Valhalla. No costing strings, no `error_code`, no kilometres, no
// `sources_to_targets`: those live in `valhalla.provider.ts` behind this interface, and the
// service above it speaks `TravelMode`, seconds and metres — the shapes `@waypoint/shared`
// already owns.
import type { EncodedShape, LatLng, TravelMode } from '@waypoint/shared';

/** DI token — Nest cannot inject a TypeScript interface. */
export const ROUTE_PROVIDER = Symbol('ROUTE_PROVIDER');

/** One ordered pair, answered. Indices are into the `points` array the caller passed. */
export interface RouteMatrixCell {
  fromIndex: number;
  toIndex: number;
  durationSeconds: number;
  distanceMeters: number;
}

/**
 * **Who answered, and what their data is — travelling WITH the answer** (ADR-0205 §Y6).
 *
 * The same move ADR-0205 §1 made for polyline precision, for the same reason: a stamp that is
 * fetched separately from the numbers it describes can disagree with them, and no runtime check
 * can catch it because both halves are well-formed. §Y5 recorded `provider` as
 * `failover(<primary>,<secondary>)` on the argument that "who answered last" would need a field
 * whose correctness depends on the limiter serialising task bodies. That argument is right about
 * a field and does not apply here — an answer carrying its own author depends on nothing.
 *
 * It also closes §Y5's vintage clause, which the code contradicted. §Y5 says an OSRM row carries
 * no eviction handle; the composed `dataVersion()` returned the PRIMARY's date regardless of who
 * answered, so a fallback-authored row was stamped with Valhalla's tileset vintage and M12's
 * sweep would read it as a fresh Valhalla row. There is now no way to ask for a vintage apart
 * from the answer it belongs to.
 */
export interface RouteAttribution {
  /** The provider that actually answered — **never a composite**, so a row names one author. */
  providerId: string;
  /** **That** provider's own vintage (ADR-0205 §Z5), `null` where it states none. */
  tilesetAt: Date | null;
}

/** Every pair the matrix answered, plus who answered them. */
export interface RouteMatrixResult {
  cells: RouteMatrixCell[];
  attribution: RouteAttribution;
}

/** One leg with geometry, which the matrix cannot give (ADR-0205 §6 amendment). */
export interface RouteShapeAnswer {
  durationSeconds: number;
  distanceMeters: number;
  shape: EncodedShape;
  attribution: RouteAttribution;
}

/**
 * **A pair the provider refuses because it is past a limit of its own** — not an outage, not a
 * parse failure, and the difference decides whether anything retries.
 *
 * ADR-0205 §Z4 measured the two ways a provider says "too far", and they are not equally
 * survivable: a crow-flies distance over the limit is an HTTP 400 that **kills the whole
 * matrix**, while a road path over the limit is a `200` with an empty cell that costs only that
 * pair. §3's gate exists so we never spend a request learning the first; this error is what the
 * service sees when the gate's crow-flies proxy was nonetheless optimistic, and it is terminal —
 * the same request will fail identically forever.
 */
export class RouteOutOfRangeError extends Error {
  constructor(readonly detail: string) {
    super(`routing refused: ${detail}`);
    this.name = 'RouteOutOfRangeError';
  }
}

export interface RouteProvider {
  /** This provider's own name. **What a row records is `RouteAttribution.providerId`**, which is
   *  the id of whoever actually answered — the two differ for a composite (§Y6). */
  readonly id: string;

  /**
   * **Ids whose stored rows are a DEGRADED answer** — taken because nothing better was reachable,
   * and to be re-asked once something better can answer (ADR-0205 §Y6).
   *
   * Empty for a lone provider, and that is the whole safety of it: it names the fallback rather
   * than "anything that is not me", so swapping the primary (§Y1's still-open question) does not
   * read the entire cache as stale and re-fetch a trip's every leg.
   */
  readonly degradedProviderIds: readonly string[];

  /**
   * Every ordered pair among `points`, for one mode.
   *
   * **A pair with no answer is simply absent from the result**, never a zero and never a throw:
   * ADR-0205 §Z4's `null` cell is ADR-0206 §D4's ordinary absence, and turning it into a `0 s`
   * leg would render "no route" as "you are already there".
   *
   * Throws {@link RouteOutOfRangeError} when the provider refuses the request as a whole.
   */
  matrix(points: readonly LatLng[], mode: TravelMode): Promise<RouteMatrixResult>;

  /** One leg, with the geometry a line is drawn from. `null` when the provider has no route. */
  shape(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteShapeAnswer | null>;
}
