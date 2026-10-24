// **One delivered image fixture**, shared by the specs that need a place to have a photograph.
//
// It is a full `DeliveredImageValue` rather than the three fields a surface reads, because the
// type carries its own provenance (ADR-0166 §12: `source`, `license`, `fetchedAt`, `confidence`,
// `method`, `ref`) — and a spec casting past that is a spec that stops noticing when the shape
// changes. Two files wrote their own literal before this existed; the second one is what made it
// worth naming.
import type { DeliveredImageValue } from '@waypoint/shared';

export const image: DeliveredImageValue = {
  url: '/assets/lagoon.jpg',
  mimeType: 'image/jpeg',
  width: 800,
  height: 480,
  sizeBytes: 120_000,
  source: 'commons',
  license: 'CC BY-SA 2.0',
  attribution: 'Ulrich Latzenhofer',
  fetchedAt: '2026-09-01T00:00:00Z',
  confidence: 1,
  method: 'wikidata_tag',
  ref: 'File:Jokulsarlon.jpg',
};
