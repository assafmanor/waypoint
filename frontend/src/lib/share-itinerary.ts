import { sharedItinerarySchema, type SharedItinerary } from '@waypoint/shared';
import { API_BASE_URL, API_PHASE, API_TIMEOUT_MS } from '../constants';
import { withDeadline } from './deadline';

/**
 * **The one read a reader with no account makes.**
 *
 * A bare `fetch`, never `apiFetch`, and the reason is the same one `fetchInvitePreview`
 * gives: this route is unguarded, so it carries no bearer token and no session cookie.
 * Going through `apiFetch` would be worse than redundant — a 401 there triggers a refresh
 * attempt and can fire the session-expired callback, so a stranger opening a link could
 * knock a signed-in owner in another tab out of their own session.
 *
 * The response is parsed against the same strict schema the server serialised it with, so
 * a projection this build does not understand fails here rather than rendering half a page.
 */
export async function fetchSharedItinerary(code: string): Promise<SharedItinerary> {
  const res = await withDeadline(API_PHASE.FETCH, API_TIMEOUT_MS.FETCH, (signal) =>
    fetch(`${API_BASE_URL}/shared-itineraries/${encodeURIComponent(code)}`, { signal }),
  );
  if (!res.ok) throw new SharedItineraryUnavailable(res.status);
  const body = await withDeadline(API_PHASE.BODY, API_TIMEOUT_MS.BODY, () => res.json());
  return sharedItinerarySchema.parse(body);
}

/** The URL a selected file downloads from — under the share's own code, so the link is the
 *  authorization and nothing about the trip is guessable from it. */
export function sharedDocumentUrl(code: string, handle: string): string {
  return `${API_BASE_URL}/shared-itineraries/${encodeURIComponent(code)}/documents/${encodeURIComponent(handle)}`;
}

/** The PDF of exactly what the page is showing, rendered server-side (ADR-0213 §4). */
export function sharedItineraryPdfUrl(code: string): string {
  return `${API_BASE_URL}/shared-itineraries/${encodeURIComponent(code)}/pdf`;
}

/**
 * A link that is gone, and one that never was, are the same thing here — on purpose. The
 * server refuses to distinguish them, so the client must not invent a distinction either;
 * "this trip exists but you may not see it" is the sentence that turns a 404 into an oracle.
 */
export class SharedItineraryUnavailable extends Error {
  constructor(readonly status: number) {
    super(`shared itinerary unavailable (${status})`);
    this.name = 'SharedItineraryUnavailable';
  }
}
