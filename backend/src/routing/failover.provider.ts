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
  type RouteMatrixResult,
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
   * **The composition's own name, and no longer what a row records** (§Y6).
   *
   * §Y5 chose this composite for `RouteLeg.provider` because the two alternatives were a lie
   * (stamping the primary's id on a failed-over row) or a shared mutable "who answered last"
   * field, whose correctness would depend on the limiter serialising task bodies — the shape of
   * the §Y4 defect. Both alternatives are gone: an answer now carries its own author
   * (`RouteAttribution`), so nothing has to be tracked and nothing is stamped by guess.
   *
   * **It is kept, and it stays exactly this string**, because rows written while it WAS the stamp
   * are still in the table and `degradedProviderIds` names it to find them.
   */
  get id(): string {
    return `failover(${this.primary.id},${this.secondary.id})`;
  }

  /**
   * **The two provider ids whose rows are a stand-in for a better answer** (§Y6).
   *
   * The secondary, because §Y5 accepted its numbers only against "no number at all" — and that
   * bargain was made about a REQUEST, while `RouteLeg` never expires (§4), so without this the
   * one-day outage of 2026-09-02 left permanent rows. Measured on the deploy: OSRM's `routed-car`
   * answers Tokyo Station→Shibuya in ⁦7.7⁩ minutes against Valhalla's ⁦15.6⁩ over the identical
   * ⁦7.67 ק״מ⁩ — a ⁦2×⁩ disagreement, not a tuning difference, because its car profile carries
   * almost no intersection cost.
   *
   * And **this composition's own id**, because a row stamped with it cannot say which host
   * answered, so it has to be treated as though the worse one did. That set shrinks by itself:
   * every refresh rewrites the row with one concrete author, and only the fallback's id can make
   * it a candidate again.
   */
  get degradedProviderIds(): readonly string[] {
    return [this.secondary.id, this.id];
  }

  constructor(
    private readonly primary: RouteProvider,
    private readonly secondary: RouteProvider,
  ) {}

  matrix(points: readonly LatLng[], mode: TravelMode): Promise<RouteMatrixResult> {
    return this.attempt(`matrix ${mode}`, (provider) => provider.matrix(points, mode));
  }

  shape(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteShapeAnswer | null> {
    return this.attempt(`shape ${mode}`, (provider) => provider.shape(from, to, mode));
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
