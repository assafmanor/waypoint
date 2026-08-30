import 'reflect-metadata';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NARRATIVE_SOURCE,
  SHARE_DAY_KIND,
  SHARE_DAY_SUMMARY_KIND,
  SHARE_DAYPART,
  type ItineraryNarrativeOutput,
  type SharedDay,
} from '@waypoint/shared';
import { PrismaService } from '../prisma/prisma.service';
import { generatePublicCode } from '../common/public-code.util';
import {
  buildSummaryNarrativeInput,
  ItineraryNarrativeService,
  narrativeInputHash,
} from './itinerary-narrative.service';
import {
  DisabledItineraryNarrativeGenerator,
  type ItineraryNarrativeGenerator,
} from './itinerary-narrative.generator';

const OWNER = 'u-assaf';

/**
 * A day carrying every fact a Full or Everything projection would have. It is the control
 * for the claim ADR-0213 §2 makes: the model input is built from this and must come back
 * holding none of it.
 */
const PRIVATE_DAY: SharedDay = {
  ordinal: 1,
  date: '2026-08-29',
  title: { kind: SHARE_DAY_KIND.PLACE, at: 'רייקיאוויק' },
  summary: { kind: SHARE_DAY_SUMMARY_KIND.EVENTS, titles: ['נחיתה'] },
  sections: [
    {
      daypart: SHARE_DAYPART.MORNING,
      events: [
        {
          title: 'נחיתה בקפלוויק',
          icon: '✈️',
          category: 'transport',
          daypart: SHARE_DAYPART.MORNING,
          hard: true,
          startLabel: '09:30',
          endLabel: '10:15',
          placeName: 'Keflavík',
          address: 'Keflavíkurflugvöllur 1',
          mapUrl: 'https://www.google.com/maps/search/?api=1&query=Keflav%C3%ADk',
          journey: { mode: 'driving', minutes: 35, km: 28 },
        },
        {
          title: 'לכתוב ל-assaf@example.com לפני אישור KEF-4821',
          daypart: SHARE_DAYPART.MORNING,
        },
      ],
    },
  ],
};

const VALID_OUTPUT: ItineraryNarrativeOutput = {
  title: 'כביש 1, בלי למהר',
  summary: 'ערים קטנות, טבע גדול וימים שמתחלפים.',
  days: [{ ordinal: 1, title: 'נוחתים ומכירים את העיר', summary: 'נחיתה רגועה וערב ראשון.' }],
};

describe('buildSummaryNarrativeInput', () => {
  it('carries only the allowlisted Summary-public fields', () => {
    const input = buildSummaryNarrativeInput([PRIVATE_DAY], ['רייקיאוויק', 'ויק'], 'he');

    expect(Object.keys(input).sort()).toEqual(['days', 'locale', 'routeLabels']);
    expect(Object.keys(input.days[0].events[0]).sort()).toEqual([
      'category',
      'daypart',
      'icon',
      'placeName',
      'title',
    ]);
  });

  it('carries no exact time, address, map link, journey or hard flag', () => {
    const json = JSON.stringify(buildSummaryNarrativeInput([PRIVATE_DAY], ['רייקיאוויק'], 'he'));

    expect(json).not.toContain('09:30');
    expect(json).not.toContain('10:15');
    expect(json).not.toContain('Keflavíkurflugvöllur');
    expect(json).not.toContain('google.com');
    expect(json).not.toContain('journey');
    expect(json).not.toContain('hard');
  });

  it('redacts identifier-shaped text inside an allowed field', () => {
    const json = JSON.stringify(buildSummaryNarrativeInput([PRIVATE_DAY], [], 'he'));

    expect(json).not.toContain('assaf@example.com');
    expect(json).not.toContain('KEF-4821');
    expect(json).toContain('נחיתה בקפלוויק');
  });

  it('hashes the same facts to the same key regardless of key order', () => {
    const a = buildSummaryNarrativeInput([PRIVATE_DAY], ['רייקיאוויק'], 'he');
    const b = JSON.parse(
      JSON.stringify({ days: a.days, routeLabels: a.routeLabels, locale: a.locale }),
    );
    expect(narrativeInputHash(a)).toBe(narrativeInputHash(b));
  });

  it('hashes a renamed event to a different key, which is what makes a result stale', () => {
    const renamed: SharedDay = {
      ...PRIVATE_DAY,
      sections: [
        {
          ...PRIVATE_DAY.sections[0],
          events: [{ ...PRIVATE_DAY.sections[0].events[0], title: 'נחיתה מאוחרת' }],
        },
      ],
    };
    expect(narrativeInputHash(buildSummaryNarrativeInput([PRIVATE_DAY], [], 'he'))).not.toBe(
      narrativeInputHash(buildSummaryNarrativeInput([renamed], [], 'he')),
    );
  });
});

describe('ItineraryNarrativeService', () => {
  const prisma = new PrismaService();
  let tripId: string;
  let shareId: string;

  async function newShare(): Promise<string> {
    const trip = await prisma.trip.create({
      data: {
        name: 'narrative test trip',
        destination: 'Iceland',
        startDate: new Date('2026-08-29'),
        endDate: new Date('2026-08-30'),
        createdBy: OWNER,
        updatedBy: OWNER,
      },
    });
    tripId = trip.id;
    const share = await prisma.tripShare.create({
      data: { tripId: trip.id, code: generatePublicCode(), createdBy: OWNER },
    });
    return share.id;
  }

  function serviceWith(generator: ItineraryNarrativeGenerator): ItineraryNarrativeService {
    return new ItineraryNarrativeService(prisma, generator);
  }

  const stub = (
    overrides: Partial<ItineraryNarrativeGenerator> = {},
  ): ItineraryNarrativeGenerator => ({
    provider: 'test-provider',
    model: 'test-model',
    skillVersion: 'v1',
    generate: vi.fn().mockResolvedValue(VALID_OUTPUT),
    ...overrides,
  });

  const resolve = (service: ItineraryNarrativeService) =>
    service.resolve(shareId, [PRIVATE_DAY], ['רייקיאוויק'], 'he', {
      title: 'רייקיאוויק ← ויק',
      summary: '',
    });

  beforeEach(async () => {
    shareId = await newShare();
  });

  afterAll(async () => {
    await prisma.trip.deleteMany({ where: { name: 'narrative test trip' } });
    await prisma.$disconnect();
  });

  it('uses the deterministic fallback when no generator ships', async () => {
    const resolved = await resolve(serviceWith(new DisabledItineraryNarrativeGenerator()));

    expect(resolved.source).toBe(NARRATIVE_SOURCE.DETERMINISTIC);
    expect(resolved.title).toBe('רייקיאוויק ← ויק');
    expect(resolved.days.size).toBe(0);
  });

  // The one behaviour the whole design rests on: a reader waits for the database, never
  // for a provider (ADR-0213 §2).
  it('returns the fallback without awaiting generation', async () => {
    const generator = stub({ generate: vi.fn().mockReturnValue(new Promise(() => undefined)) });

    const resolved = await resolve(serviceWith(generator));

    expect(resolved.source).toBe(NARRATIVE_SOURCE.DETERMINISTIC);
    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it('starts one generation for a burst of reads on the same input', async () => {
    const generator = stub({ generate: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const service = serviceWith(generator);

    await Promise.all([resolve(service), resolve(service), resolve(service)]);

    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it('publishes a stored result automatically, with no approval step', async () => {
    const service = serviceWith(stub());
    await resolve(service); // first read stores it behind the response
    await vi.waitFor(async () =>
      expect(await prisma.itineraryNarrative.count({ where: { shareId } })).toBe(1),
    );

    const resolved = await resolve(service);
    expect(resolved.source).toBe(NARRATIVE_SOURCE.GENERATED);
    expect(resolved.title).toBe(VALID_OUTPUT.title);
    expect(resolved.days.get(1)?.title).toBe('נוחתים ומכירים את העיר');
  });

  it('records the adapter as the provenance, never the model output', async () => {
    const service = serviceWith(
      stub({
        generate: vi
          .fn()
          .mockResolvedValue({ ...VALID_OUTPUT, provider: 'anthropic', model: 'claimed' }),
      }),
    );
    await resolve(service);

    // A model that names its own provider is one that can lie about it — and the strict
    // schema refuses the extra keys outright, so nothing is stored at all.
    await new Promise((done) => setTimeout(done, 50));
    expect(await prisma.itineraryNarrative.count({ where: { shareId } })).toBe(0);
  });

  it.each([
    ['a provider failure', { generate: vi.fn().mockRejectedValue(new Error('502 from provider')) }],
    ['a null answer', { generate: vi.fn().mockResolvedValue(null) }],
    ['malformed output', { generate: vi.fn().mockResolvedValue({ title: '' }) }],
    [
      'output carrying a link',
      {
        generate: vi
          .fn()
          .mockResolvedValue({ ...VALID_OUTPUT, summary: 'ראו https://example.com' }),
      },
    ],
  ])('leaves sharing fully working through %s', async (_label, overrides) => {
    const resolved = await resolve(serviceWith(stub(overrides)));

    expect(resolved.source).toBe(NARRATIVE_SOURCE.DETERMINISTIC);
    await new Promise((done) => setTimeout(done, 50));
    expect(await prisma.itineraryNarrative.count({ where: { shareId } })).toBe(0);
  });

  it('makes a stored result ineligible the moment the input changes', async () => {
    const service = serviceWith(stub());
    await resolve(service);
    await vi.waitFor(async () =>
      expect(await prisma.itineraryNarrative.count({ where: { shareId } })).toBe(1),
    );

    const renamedDay: SharedDay = { ...PRIVATE_DAY, sections: [] };
    const resolved = await service.resolve(shareId, [renamedDay], [], 'he', {
      title: 'fallback',
      summary: '',
    });

    expect(resolved.source).toBe(NARRATIVE_SOURCE.DETERMINISTIC);
  });

  it('makes a stored result ineligible when the skill version moves on', async () => {
    await resolve(serviceWith(stub()));
    await vi.waitFor(async () =>
      expect(await prisma.itineraryNarrative.count({ where: { shareId } })).toBe(1),
    );

    const resolved = await resolve(serviceWith(stub({ skillVersion: 'v2' })));
    expect(resolved.source).toBe(NARRATIVE_SOURCE.DETERMINISTIC);
  });

  it('treats stored JSON that no longer validates as absent', async () => {
    const generator = stub({ generate: vi.fn().mockResolvedValue(null) });
    const input = buildSummaryNarrativeInput([PRIVATE_DAY], ['רייקיאוויק'], 'he');
    await prisma.itineraryNarrative.create({
      data: {
        shareId,
        locale: 'he',
        inputHash: narrativeInputHash(input),
        skillVersion: 'v1',
        provider: 'test-provider',
        model: 'test-model',
        output: { title: 'ok', summary: 'ראו www.example.com', days: [] },
      },
    });

    const resolved = await resolve(serviceWith(generator));
    expect(resolved.source).toBe(NARRATIVE_SOURCE.DETERMINISTIC);
  });

  it('hands the generator the allowlisted input and nothing else', async () => {
    const generator = stub();
    await resolve(serviceWith(generator));

    const [passed] = (generator.generate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.stringify(passed)).not.toContain('09:30');
    expect(JSON.stringify(passed)).not.toContain(tripId);
    expect(JSON.stringify(passed)).not.toContain(shareId);
  });
});
