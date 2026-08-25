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

/** One leg with geometry, which the matrix cannot give (ADR-0205 §6 amendment). */
export interface RouteShapeAnswer {
  durationSeconds: number;
  distanceMeters: number;
  shape: EncodedShape;
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
  /** Recorded on every row it writes, so a cache entry says who answered it. */
  readonly id: string;

  /**
   * Every ordered pair among `points`, for one mode.
   *
   * **A pair with no answer is simply absent from the result**, never a zero and never a throw:
   * ADR-0205 §Z4's `null` cell is ADR-0206 §D4's ordinary absence, and turning it into a `0 s`
   * leg would render "no route" as "you are already there".
   *
   * Throws {@link RouteOutOfRangeError} when the provider refuses the request as a whole.
   */
  matrix(points: readonly LatLng[], mode: TravelMode): Promise<RouteMatrixCell[]>;

  /** One leg, with the geometry a line is drawn from. `null` when the provider has no route. */
  shape(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteShapeAnswer | null>;

  /**
   * **The provider's data vintage** — ADR-0205 §Z5's invalidation signal, which §4 said a route
   * has and a clock does not. Stamped on each row so M12 can evict on a roll instead of guessing
   * a TTL. `null` when the provider will not say, which is a row with no eviction handle rather
   * than an error.
   */
  dataVersion(): Promise<Date | null>;
}
