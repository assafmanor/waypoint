import { Injectable, Logger } from '@nestjs/common';
import type { ItineraryNarrativeOutput, SummaryNarrativeInput } from '@waypoint/shared';

/**
 * **The whole surface a future model gets**, and deliberately not an inch more.
 *
 * ADR-0213 §2 rejected "a general-purpose skills runtime, as part of sharing v1". This is
 * the alternative it chose instead: a named, versioned generator with one strict input
 * schema and one strict output schema. A provider adapter implements this and nothing else
 * — it cannot see the trip, the share level, the Everything toggles, or the projection. It
 * gets `SummaryNarrativeInput`, which the server builds from Summary-public text alone.
 *
 * `skillVersion` is part of the identity of a result, not metadata about it: it is one
 * column of the row's compound unique, so revising a prompt makes every stored result
 * ineligible immediately rather than leaving old text on a live link.
 */
export interface ItineraryNarrativeGenerator {
  readonly provider: string;
  readonly model: string;
  readonly skillVersion: string;
  /** `null` means "no narrative this time" — a refusal, a timeout, a disabled provider.
   *  It is an ordinary answer, never an error the caller has to handle specially. */
  generate(input: SummaryNarrativeInput): Promise<ItineraryNarrativeOutput | null>;
}

export const ITINERARY_NARRATIVE_GENERATOR = Symbol('ITINERARY_NARRATIVE_GENERATOR');

/**
 * What ships today.
 *
 * No external model is part of this build, and this is not a stub standing in for one —
 * it is the production implementation until a provider policy exists (ADR-0213 §2's open
 * question about external versus self-hosted). It makes no network call and returns `null`,
 * so every shared page and every PDF runs on the deterministic narrative, which is exactly
 * the state the feature must survive anyway when a provider is down.
 */
@Injectable()
export class DisabledItineraryNarrativeGenerator implements ItineraryNarrativeGenerator {
  private readonly logger = new Logger(DisabledItineraryNarrativeGenerator.name);
  readonly provider = 'none';
  readonly model = 'none';
  readonly skillVersion = 'disabled';

  async generate(): Promise<null> {
    this.logger.debug('itinerary narrative generation is disabled; using deterministic fallback');
    return null;
  }
}
