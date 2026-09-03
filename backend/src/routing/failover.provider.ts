// **Two providers behind one port, so a dead host is not a dead feature** (ADR-0205 §Y5).
//
// §Y1 weighed the community server against self-hosting and left the provider question open,
// with "FOSSGIS degrades" listed as a switch trigger. The trigger fired on 2026-09-02:
// `valhalla1.openstreetmap.de` served `503` for the better part of a day, and because it was the
// only host in the allowlist the answer was no travel times at all — for a trip that was
// happening at the time. A switch that needs a human to notice, decide, edit an env var and
// redeploy is not a switch, it is a runbook.
//
// So the composition lives here rather than in `RoutingService`: the service speaks to ONE
// provider (§2's port) and must not learn about provider health, which is precisely the coupling
// §Y4 spent a production outage removing.
import { Logger } from '@nestjs/common';
import type { LatLng, TravelMode } from '@waypoint/shared';
import {
  RouteOutOfRangeError,
  type RouteMatrixCell,
  type RouteProvider,
  type RouteShapeAnswer,
} from './route-provider';

/**
 * **Primary first, secondary only when the primary could not answer at all.**
 *
 * The distinction is the same one §Y4 turned into a rule, and getting it wrong here would be the
 * same class of bug: a provider that ANSWERS — with a refusal, with an empty matrix, with `null`
 * geometry — has done its job, and asking the other one would spend a second outbound seat to be
 * told the same thing. Only a throw means "no answer", and only a throw fails over.
 *
 * `RouteOutOfRangeError` is therefore explicitly NOT a failover trigger: it is the provider
 * stating a limit, terminal by construction (see `RouteProvider`), and the second provider's
 * limits are its own. It propagates, and `RoutingService.askProvider` reads it as it always has.
 */
export class FailoverRouteProvider implements RouteProvider {
  private readonly logger = new Logger(FailoverRouteProvider.name);

  /**
   * **A composite, because the alternatives are a lie or a shared mutable field.**
   *
   * `RouteLeg.provider` exists so a mixed table is legible rather than silently mixed (§4), and
   * `RoutingService` reads this getter when it stores. Returning `primary.id` would stamp
   * failed-over rows as Valhalla-authored, which is exactly the silence that column was added to
   * prevent. Tracking "who answered last" in a field would be precise and would rely on the
   * limiter serialising task bodies — an invariant in another file, which is the shape of the
   * §Y4 defect and not a mistake worth making twice for one column's precision.
   *
   * So the row says it was written under failover and names both candidates. Less precise than
   * "which one", never wrong, and it needs nothing to stay true.
   */
  get id(): string {
    return `failover(${this.primary.id},${this.secondary.id})`;
  }

  constructor(
    private readonly primary: RouteProvider,
    private readonly secondary: RouteProvider,
  ) {}

  matrix(points: readonly LatLng[], mode: TravelMode): Promise<RouteMatrixCell[]> {
    return this.attempt(`matrix ${mode}`, (provider) => provider.matrix(points, mode));
  }

  shape(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteShapeAnswer | null> {
    return this.attempt(`shape ${mode}`, (provider) => provider.shape(from, to, mode));
  }

  /** **The primary's vintage, and never the secondary's.** A vintage is the invalidation signal
   *  for the rows it stamps (§Z5); falling back here would stamp primary-authored rows with
   *  whatever the secondary happens to say, which is worse than the `null` the port allows. */
  dataVersion(): Promise<Date | null> {
    return this.primary.dataVersion().catch(() => null);
  }

  /**
   * Run `work` against the primary; on a genuine failure, run it against the secondary.
   *
   * **Both failing re-throws the SECONDARY's error, deliberately.** The breaker upstream counts a
   * throw as one failure either way, and the second error is the more recent statement about the
   * world — while swallowing both and answering "nothing" would tell the breaker every call is
   * succeeding, so it would never trip and we would hammer two dead hosts instead of one.
   */
  private async attempt<T>(
    label: string,
    work: (provider: RouteProvider) => Promise<T>,
  ): Promise<T> {
    try {
      return await work(this.primary);
    } catch (error) {
      if (error instanceof RouteOutOfRangeError) throw error;
      this.logger.warn(
        `${this.primary.id} could not answer ${label} (${String(error)}); trying ${this.secondary.id}`,
      );
      return await work(this.secondary);
    }
  }
}
