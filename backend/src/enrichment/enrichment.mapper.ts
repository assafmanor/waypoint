// Stored payload → what a client receives (ADR-0166 §6's server-owned read model).
//
// Two differences, both deliberate:
//
//  1. **The image's `blobKey` becomes a URL.** Same move `toDocumentSummaryDto` makes by
//     omitting `fileRef`: the storage key never leaves the server, the client gets something
//     it can put in an `<img src>`, and because the server builds the path no client knows
//     the route shape — so a blob a refresh replaced simply stops appearing rather than
//     404ing at a URL the client assembled itself (the `uploadedAvatarUrl` precedent,
//     ADR-0133 §12).
//  2. **Only what we KNOW is sent.** An `absent` field — the negative cache's record that we
//     looked and found nothing (§6.4) — is dropped here. It is a fetch-scheduling fact, and
//     a surface renders "we know nothing" identically whether we never asked or asked and
//     came back empty (ADR-0167 §6).
import {
  enrichmentImageContentPath,
  type DeliveredEnrichmentFields,
  type EnrichmentFields,
} from '@waypoint/shared';

/** The value of a field, or `undefined` when the field is absent or was never asked about. */
function presentValue<T>(state: { state: 'present'; value: T } | { state: 'absent' } | undefined) {
  return state?.state === 'present' ? state.value : undefined;
}

export function toDeliveredEnrichment(fields: EnrichmentFields): DeliveredEnrichmentFields {
  const summary = presentValue(fields.summary);
  const hours = presentValue(fields.hours);
  const image = presentValue(fields.image);

  return {
    // `summary` and `hours` are already client-shaped: their values carry no storage handles,
    // only prose or an OSM expression, plus provenance.
    ...(summary && { summary }),
    ...(hours && { hours }),
    ...(image && {
      image: (({ blobKey, ...rest }) => ({ ...rest, url: enrichmentImageContentPath(blobKey) }))(
        image,
      ),
    }),
  };
}
