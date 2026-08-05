import { describe, expect, it, vi } from 'vitest';
import { ENRICHMENT_FIELD, ENRICHMENT_SOURCE, SOURCE_POLICY } from '@waypoint/shared';
import type { EnrichmentProvider } from './enrichment.provider';
import { EnrichmentRegistry } from './enrichment.registry';

const stub = (
  id: EnrichmentProvider['id'],
  provides: EnrichmentProvider['provides'],
): EnrichmentProvider => ({
  id,
  provides,
  policy: SOURCE_POLICY[id],
  match: vi.fn(async () => null),
  fetch: vi.fn(async () => ({})),
});

const wikidata = stub(ENRICHMENT_SOURCE.WIKIDATA, []);
const wikipedia = stub(ENRICHMENT_SOURCE.WIKIPEDIA, [ENRICHMENT_FIELD.SUMMARY]);
const commons = stub(ENRICHMENT_SOURCE.COMMONS, [ENRICHMENT_FIELD.IMAGE]);

describe('EnrichmentRegistry', () => {
  it('returns the providers for a field in declared precedence order', () => {
    const registry = new EnrichmentRegistry([wikidata, wikipedia]);
    expect(registry.providersFor(ENRICHMENT_FIELD.SUMMARY)).toEqual([wikipedia]);
  });

  it('skips a source named in the table with no provider registered', () => {
    const registry = new EnrichmentRegistry([wikidata, wikipedia]);
    // `hours` names OSM, and Phase 2 is blocked on measuring the restaurant fill rate
    // (§12.4) — the field stays unanswered rather than erroring.
    expect(registry.providersFor(ENRICHMENT_FIELD.HOURS)).toEqual([]);
    expect(registry.providersFor(ENRICHMENT_FIELD.IMAGE)).toEqual([]);
  });

  it('adding a source is one registration — §5.2, the design’s acceptance test', () => {
    // Phase 2's Commons provider, added with no change to the registry and no branch
    // anywhere: `FIELD_SOURCE_PRECEDENCE.image` already names it.
    const registry = new EnrichmentRegistry([wikidata, wikipedia, commons]);
    expect(registry.providersFor(ENRICHMENT_FIELD.IMAGE)).toEqual([commons]);
    expect(registry.providersFor(ENRICHMENT_FIELD.SUMMARY)).toEqual([wikipedia]);
  });

  it('identifies the identity providers — the ones that supply no field of their own', () => {
    const registry = new EnrichmentRegistry([wikidata, wikipedia]);
    // Wikidata settles the QID and the sitelinks everything downstream matches on (§4).
    expect(registry.identityProviders()).toEqual([wikidata]);
  });

  it('keeps registration order, which is the order identity accumulates (§12.3)', () => {
    const registry = new EnrichmentRegistry([wikidata, wikipedia, commons]);
    expect(registry.all().map((p) => p.id)).toEqual([
      ENRICHMENT_SOURCE.WIKIDATA,
      ENRICHMENT_SOURCE.WIKIPEDIA,
      ENRICHMENT_SOURCE.COMMONS,
    ]);
  });

  it('looks a provider up by its source id', () => {
    const registry = new EnrichmentRegistry([wikipedia]);
    expect(registry.get(ENRICHMENT_SOURCE.WIKIPEDIA)).toBe(wikipedia);
    expect(registry.get(ENRICHMENT_SOURCE.OSM)).toBeUndefined();
  });
});
