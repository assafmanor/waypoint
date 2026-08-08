// Two rules about a stored value: **whether it may be stored at all**, and **how long it
// counts**. Both are read straight off the declared data in `@waypoint/shared` rather than
// re-stated here.
//
// The first is ADR-0166 §2's invariant, and the reason it is a function with a spec rather
// than a clause in a comment: *"a provider whose policy says `storable: false` cannot write
// to the store" is one guard with one spec, and the compliance question stops depending on
// anyone remembering §1.*
import {
  ENRICHMENT_ABSENCE_REASON,
  ENRICHMENT_FIELD,
  ENRICHMENT_MISS_TTL_MS,
  enrichmentValueFetchedAt,
  isTextVariantField,
  TEXT_VARIANT_FIELDS,
  enrichmentValueTtlMs,
  isUnusableLicense,
  SOURCE_POLICY,
  type EnrichmentAbsenceReason,
  type EnrichmentField,
  type EnrichmentFields,
  type EnrichmentSource,
} from '@waypoint/shared';
import type { ProviderValue } from './enrichment.provider';

/** Fields whose value carries prose, and therefore **must** carry a language (§11.6) — which
 *  is the same set as the variants fields, since a value stored per language is by definition
 *  one whose language we knew. */
const PROSE_FIELDS: readonly EnrichmentField[] = TEXT_VARIANT_FIELDS;

/**
 * Why this value may **not** be written to the store, or `null` when it may.
 *
 * Five refusals, in the order they matter:
 *
 *  1. **The source's policy forbids storing anything** — §2's invariant. Today only Google
 *     declares `storable: false`, and this is the guard that makes "no Google-sourced value
 *     is ever written to `PlaceEnrichment`" enforced by data rather than by discipline.
 *  2. **No license could be determined.** A value with no license is an obligation of
 *     unknown size; Commons in particular declares none at source level because it is per
 *     file (§12.2), so a Commons value that forgot to supply its own is refused here.
 *  3. **The license is one we cannot discharge** — GFDL-only, §12.2. Refused *here* rather
 *     than inside the Commons provider on purpose: this is the one place that decides what
 *     may be kept, and a refusal here makes the resolver **fall through to the next candidate
 *     or to the no-image state**, which is exactly what the ADR asks for.
 *  4. **Credit is required and absent.** Storing it would mean rendering it unlawfully —
 *     ADR-0167 §4 renders the stored string, so a value with nothing to render cannot be
 *     shown, and an obligation we cannot discharge is not worth keeping.
 *  5. **Prose with no language** (§11.6). There is no defensible state where we hold a
 *     sentence and don't know what it is written in — it could not be marked `באנגלית`,
 *     translated, or selected against a reader's locale.
 */
export function valueRefusal(
  field: EnrichmentField,
  source: EnrichmentSource,
  value: ProviderValue,
): EnrichmentAbsenceReason | null {
  const policy = SOURCE_POLICY[source];
  if (!policy.storable) return ENRICHMENT_ABSENCE_REASON.UNSTORABLE;

  const license = value.license ?? policy.license;
  if (!license) return ENRICHMENT_ABSENCE_REASON.UNSTORABLE;
  if (isUnusableLicense(license)) return ENRICHMENT_ABSENCE_REASON.UNSTORABLE;

  // Per file where the source says so (Commons), per source otherwise. A CC0 photograph owes
  // nobody a credit line, and refusing it for lacking one would throw away a usable image.
  const attributionRequired = value.attributionRequired ?? policy.attributionRequired;
  if (attributionRequired && !value.attribution) {
    return ENRICHMENT_ABSENCE_REASON.ATTRIBUTION_MISSING;
  }

  if (PROSE_FIELDS.includes(field) && !value.lang) {
    return ENRICHMENT_ABSENCE_REASON.UNSTORABLE;
  }

  return null;
}

/** The license that governs a value once stored: its own, else its source's. */
export function effectiveLicense(source: EnrichmentSource, value: ProviderValue): string {
  const license = value.license ?? SOURCE_POLICY[source].license;
  if (!license) throw new Error(`no license for a ${source} value — valueRefusal should have run`);
  return license;
}

/**
 * Does this field want a (re)attempt right now?
 *
 * Three states, and the middle one is what §6.4's negative cache buys:
 *
 *  - **no entry** — never asked. Ask.
 *  - **`absent`** — asked, nothing there. **Don't ask again until the miss TTL lapses.**
 *    Without this, the majority of places — Tokyo restaurants scored 0 of 7 (§11.3) —
 *    re-attempt every provider on every cold read forever.
 *  - **`present`** — ask again only past the value's TTL, and even then the stale value is
 *    served while the refresh runs (§6.1: never a spinner where a fact used to be).
 */
export function fieldWantsAttempt(
  fields: EnrichmentFields,
  field: EnrichmentField,
  now: Date,
): boolean {
  const state = fields[field];
  if (!state) return true;

  if (state.state === 'absent') {
    const attemptedAt = Date.parse(state.attemptedAt);
    return (
      !Number.isFinite(attemptedAt) || now.getTime() - attemptedAt >= ENRICHMENT_MISS_TTL_MS[field]
    );
  }

  const fetchedAt = enrichmentValueFetchedAt(fields, field);
  if (!fetchedAt) return true;
  const source = storedValueSource(fields, field);
  const ttl = source ? enrichmentValueTtlMs(field, source) : 0;
  return now.getTime() - Date.parse(fetchedAt) >= ttl;
}

/** Which fields want an attempt — the pass's work list, and the same computation a later
 *  phase schedules a background refresh from. */
export function fieldsWantingAttempt(fields: EnrichmentFields, now: Date): EnrichmentField[] {
  return Object.values(ENRICHMENT_FIELD).filter((field) => fieldWantsAttempt(fields, field, now));
}

/** The source behind a stored present value — for a variants map, the source of the oldest
 *  variant, since that is the one whose freshness governs the field. */
function storedValueSource(
  fields: EnrichmentFields,
  field: EnrichmentField,
): EnrichmentSource | undefined {
  const state = fields[field];
  if (state?.state !== 'present') return undefined;
  if (isTextVariantField(field)) {
    const variants = Object.values(
      state.value as Record<string, { fetchedAt: string; source: EnrichmentSource }>,
    );
    return variants.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))[0]?.source;
  }
  return (state.value as { source: EnrichmentSource }).source;
}
