// The provider registry (ADR-0166 §5) — a list of providers plus the declared, per-field
// precedence table in `@waypoint/shared`.
//
// The precedence data lives in shared and the wiring lives here, which is what makes §5.2's
// acceptance test true: **adding a source is one file plus one line per field it wins.** No
// switch to extend, no branch to add.
import { Injectable } from '@nestjs/common';
import {
  FIELD_SOURCE_PRECEDENCE,
  type EnrichmentField,
  type EnrichmentSource,
} from '@waypoint/shared';
import type { EnrichmentProvider } from './enrichment.provider';

@Injectable()
export class EnrichmentRegistry {
  private readonly byId = new Map<EnrichmentSource, EnrichmentProvider>();

  constructor(providers: readonly EnrichmentProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: EnrichmentProvider): void {
    this.byId.set(provider.id, provider);
  }

  get(id: EnrichmentSource): EnrichmentProvider | undefined {
    return this.byId.get(id);
  }

  /** Every registered provider, in registration order — which is also the order identity
   *  accumulates in a pass (§12.3 needs the QID settled before OSM is asked). */
  all(): readonly EnrichmentProvider[] {
    return [...this.byId.values()];
  }

  /**
   * The providers that can supply `field`, **in precedence order**.
   *
   * A source named in the table with no provider registered is simply skipped — which is
   * how `hours` behaves today: it names OSM, and ADR-0166's Phase 2 is blocked on measuring
   * the restaurant fill rate (§12.4), so nothing answers for it and the field stays unasked
   * rather than erroring.
   */
  providersFor(field: EnrichmentField): readonly EnrichmentProvider[] {
    return FIELD_SOURCE_PRECEDENCE[field]
      .map((source) => this.byId.get(source))
      .filter((provider): provider is EnrichmentProvider => provider !== undefined);
  }

  /** Providers that settle identity for the ones after them, even when they supply no field
   *  value of their own — Wikidata in Phase 1 (§4: the QID is "added when Wikidata
   *  matches"). Without these the exact routes in §12.3 have nothing to be exact about. */
  identityProviders(): readonly EnrichmentProvider[] {
    return this.all().filter((provider) => provider.provides.length === 0);
  }
}
