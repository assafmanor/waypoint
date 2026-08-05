import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { enrichmentLookupSchema } from '@waypoint/shared';
import { PlacesThrottlerGuard } from '../places/places-throttler.guard';
import { MembershipGuard } from '../trips/membership.guard';
import { EnrichmentLookupController } from './enrichment-lookup.controller';
import type { EnrichmentScheduler } from './enrichment.scheduler';

const SKYTREE = {
  googlePlaceId: 'ChIJ-skytree',
  name: 'Tokyo Skytree',
  lat: 35.7101,
  lng: 139.8107,
};

describe('EnrichmentLookupController', () => {
  it('asks for the candidate the client named, and answers with the read model', async () => {
    const fields = { summary: {} };
    const enrichNow = vi.fn().mockResolvedValue(fields);
    const controller = new EnrichmentLookupController({
      enrichNow,
    } as unknown as EnrichmentScheduler);

    expect(await controller.lookup('t1', SKYTREE)).toBe(fields);
    // The identity travels with the question — the store holds nothing for a place nobody has
    // added, so the name and the point are what a match is made from.
    expect(enrichNow).toHaveBeenCalledWith({
      googlePlaceId: 'ChIJ-skytree',
      name: 'Tokyo Skytree',
      lat: 35.7101,
      lng: 139.8107,
    });
  });

  it('passes a coordless candidate through without inventing a point', async () => {
    const enrichNow = vi.fn().mockResolvedValue({});
    const controller = new EnrichmentLookupController({
      enrichNow,
    } as unknown as EnrichmentScheduler);

    await controller.lookup('t1', { googlePlaceId: 'ChIJ-x', name: 'Somewhere' });
    expect(enrichNow).toHaveBeenCalledWith({
      googlePlaceId: 'ChIJ-x',
      name: 'Somewhere',
      lat: undefined,
      lng: undefined,
    });
  });

  // **The two guards are the whole access story** (§17), so they are asserted rather than
  // assumed: a global store read a client can address by an arbitrary key must be behind
  // membership and behind a rate limit, and neither is visible in the method's body.
  it('is behind membership and the per-member·trip rate limit', () => {
    const onClass = Reflect.getMetadata(GUARDS_METADATA, EnrichmentLookupController) as
      unknown[] | undefined;
    const onRoute = Reflect.getMetadata(
      GUARDS_METADATA,
      EnrichmentLookupController.prototype.lookup,
    ) as unknown[] | undefined;

    expect(onClass).toContain(MembershipGuard);
    expect(onRoute).toContain(PlacesThrottlerGuard);
  });

  it('refuses a body with no identity to match on', () => {
    // A googlePlaceId alone cannot be matched — a name is what every route into Wikidata
    // starts from — so the schema requires it rather than the service discovering it is absent.
    expect(enrichmentLookupSchema.safeParse({ googlePlaceId: 'ChIJ-x' }).success).toBe(false);
    expect(enrichmentLookupSchema.safeParse({ name: 'Tokyo Skytree' }).success).toBe(false);
    expect(enrichmentLookupSchema.safeParse(SKYTREE).success).toBe(true);
  });
});
