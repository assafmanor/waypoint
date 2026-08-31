import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NARRATIVE_SOURCE,
  itineraryNarrativeOutputSchema,
  summaryNarrativeInputSchema,
  type ItineraryNarrativeOutput,
  type SharedDay,
  type SummaryNarrativeInput,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { NarrativeStrings } from './itinerary-narrative.fallback';
import {
  ITINERARY_NARRATIVE_GENERATOR,
  type ItineraryNarrativeGenerator,
} from './itinerary-narrative.generator';
import { redactedOrUndefined } from './narrative-redaction';

/**
 * **What the model may see**, built here rather than anywhere near the projection.
 *
 * The independence is structural, not a convention: this takes already-projected `days`,
 * which at Summary carry no time, address, map link, journey or appendix at all — and it
 * copies four fields off each event by name. There is no path by which an Everything toggle
 * reaches it, because the shape it reads from does not have those fields to offer.
 *
 * **`placeName` was the exception, and it is gone** (ADR-0213's tenth amendment §6). It is
 * the one copied field the projection sets only AFTER its Summary early return, so the
 * "independently of the selected level" claim was false for it: one trip generated a
 * different narrative depending on which level happened to open it. The trip's principal
 * stops still travel, in `routeLabels`.
 *
 * Every string that survives goes through redaction first: an allowlist governs which
 * *fields* travel, and free text inside an allowed field is a different question (see
 * `narrative-redaction.ts` for why that is defence in depth rather than the defence).
 */
export function buildSummaryNarrativeInput(
  days: SharedDay[],
  routeLabels: string[],
  locale: string,
): SummaryNarrativeInput {
  return summaryNarrativeInputSchema.parse({
    locale,
    routeLabels: routeLabels.map(redactedOrUndefined).filter(Boolean),
    days: days.map((day) => ({
      ordinal: day.ordinal,
      events: day.sections.flatMap((section) =>
        section.events.flatMap((event) => {
          const title = redactedOrUndefined(event.title);
          if (!title) return [];
          return [
            {
              title,
              daypart: event.daypart,
              icon: event.icon ?? undefined,
              category: event.category ?? undefined,
            },
          ];
        }),
      ),
    })),
  });
}

/** SHA-256 over the canonical parsed input. Parsed first so key order and absent-vs-null
 *  can never make the same facts hash two ways. */
export function narrativeInputHash(input: SummaryNarrativeInput): string {
  return createHash('sha256')
    .update(JSON.stringify(summaryNarrativeInputSchema.parse(input)))
    .digest('hex');
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * **Resolve the words on a shared page, without ever making a reader wait for a model.**
 *
 * The rule is one line long: a stored result is used only when share, locale, input hash
 * and skill version all match and the JSON still parses; otherwise the deterministic
 * fallback is returned *immediately* and regeneration, if a generator is registered, runs
 * behind the response. A public read and a PDF render therefore have exactly one latency
 * profile whether the provider is fast, slow, broken, or absent — which is what makes
 * "generated narrative publishes automatically, with no approval step" safe to promise.
 */
@Injectable()
export class ItineraryNarrativeService {
  private readonly logger = new Logger(ItineraryNarrativeService.name);
  /** In-flight generations, so a burst of reads on one trip starts one job, not fifty. */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ITINERARY_NARRATIVE_GENERATOR)
    private readonly generator: ItineraryNarrativeGenerator,
  ) {}

  /**
   * @param tripId the cache key's subject — the TRIP, not the share (ADR-0213's tenth
   *   amendment §6). The input below is level-invariant by construction, so several links
   *   on one trip describe the same trip and must not each pay for a generation; keying on
   *   the trip also survives a rotation or a re-share, where per-share keying started cold.
   */
  async resolve(
    tripId: string,
    days: SharedDay[],
    routeLabels: string[],
    locale: string,
    fallback: { title: string; summary: string },
  ): Promise<NarrativeStrings> {
    const deterministic: NarrativeStrings = {
      source: NARRATIVE_SOURCE.DETERMINISTIC,
      title: fallback.title,
      summary: fallback.summary,
      days: new Map(),
    };

    let input: SummaryNarrativeInput;
    let inputHash: string;
    try {
      input = buildSummaryNarrativeInput(days, routeLabels, locale);
      inputHash = narrativeInputHash(input);
    } catch (error) {
      // A projection this builder cannot describe is not a reason to fail a public read.
      this.logger.warn(`narrative input could not be built: ${errorMessage(error)}`);
      return deterministic;
    }

    const stored = await this.prisma.itineraryNarrative.findUnique({
      where: {
        tripId_locale_inputHash_skillVersion: {
          tripId,
          locale,
          inputHash,
          skillVersion: this.generator.skillVersion,
        },
      },
      select: { output: true },
    });

    if (stored) {
      const parsed = itineraryNarrativeOutputSchema.safeParse(stored.output);
      if (parsed.success) return toStrings(parsed.data);
      // Stored JSON that no longer satisfies the schema is treated as absent rather than
      // repaired: the schema is the contract, and text that fails it was never publishable.
      this.logger.warn(`stored itinerary narrative failed validation for trip ${tripId}`);
    }

    this.scheduleGeneration(tripId, locale, inputHash, input);
    return deterministic;
  }

  /** Fire-and-forget. Nothing awaits this, and nothing about the response depends on it. */
  private scheduleGeneration(
    tripId: string,
    locale: string,
    inputHash: string,
    input: SummaryNarrativeInput,
  ): void {
    const key = `${tripId}:${locale}:${inputHash}:${this.generator.skillVersion}`;
    if (this.running.has(key)) return;
    this.running.add(key);
    void this.generateAndStore(tripId, locale, inputHash, input)
      .catch((error) => this.logger.warn(`narrative generation failed: ${errorMessage(error)}`))
      .finally(() => this.running.delete(key));
  }

  private async generateAndStore(
    tripId: string,
    locale: string,
    inputHash: string,
    input: SummaryNarrativeInput,
  ): Promise<void> {
    const raw = await this.generator.generate(input);
    if (!raw) return;

    const parsed = itineraryNarrativeOutputSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn(`generator returned unpublishable narrative for trip ${tripId}`);
      return;
    }
    await this.prisma.itineraryNarrative.upsert({
      where: {
        tripId_locale_inputHash_skillVersion: {
          tripId,
          locale,
          inputHash,
          skillVersion: this.generator.skillVersion,
        },
      },
      create: {
        tripId,
        locale,
        inputHash,
        skillVersion: this.generator.skillVersion,
        // Provenance from the adapter, never from model-authored text: a model that names
        // its own provider is a model that can lie about where its output came from.
        provider: this.generator.provider,
        model: this.generator.model,
        output: parsed.data,
      },
      update: { output: parsed.data, generatedAt: new Date() },
    });
  }
}

function toStrings(output: ItineraryNarrativeOutput): NarrativeStrings {
  return {
    source: NARRATIVE_SOURCE.GENERATED,
    title: output.title,
    summary: output.summary,
    days: new Map(
      output.days.map((day) => [day.ordinal, { title: day.title, summary: day.summary }]),
    ),
  };
}
