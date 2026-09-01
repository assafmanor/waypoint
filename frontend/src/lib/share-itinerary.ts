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
 * It fails as its **own** error, though — see `SharedItineraryUnreadable`: that failure is
 * about the document's age and not about the link, and the two used to be indistinguishable.
 */
export async function fetchSharedItinerary(code: string): Promise<SharedItinerary> {
  const res = await withDeadline(API_PHASE.FETCH, API_TIMEOUT_MS.FETCH, (signal) =>
    fetch(`${API_BASE_URL}/shared-itineraries/${encodeURIComponent(code)}`, { signal }),
  );
  if (!res.ok) throw new SharedItineraryUnavailable(res.status);
  const body = await withDeadline(API_PHASE.BODY, API_TIMEOUT_MS.BODY, () => res.json());
  const parsed = sharedItinerarySchema.safeParse(body);
  if (!parsed.success) throw new SharedItineraryUnreadable(parsed.error);
  return parsed.data;
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
 *
 * It carries the STATUS because 404 is the only one of them that means "gone": a 502 from a
 * deploy swapping containers, a 429 off the per-IP cap and a 503 all arrive here too, and
 * telling a reader their link was revoked because a rollout took eight seconds is a lie the
 * page used to tell (`shareLoadFailure`).
 */
export class SharedItineraryUnavailable extends Error {
  constructor(readonly status: number) {
    super(`shared itinerary unavailable (${status})`);
    this.name = 'SharedItineraryUnavailable';
  }
}

/**
 * **The link is live and this DOCUMENT is too old to read what it answers.**
 *
 * Every object in `sharedItinerarySchema` is strict (see that file's header), which is the
 * server's leak guard on the way out — and on the way in it means a page holding a build
 * from before the last deploy cannot parse a projection that grew one field. Sharing ships
 * often, so this is the ordinary consequence of a deploy, not a corrupt response.
 *
 * Its own class because the cure is its own too: a newer document, never a retry (the same
 * answer parses the same way every time) and never the revoked-link card.
 */
export class SharedItineraryUnreadable extends Error {
  constructor(cause: unknown) {
    super('shared itinerary could not be read by this build', { cause });
    this.name = 'SharedItineraryUnreadable';
  }
}

/**
 * **What a failed read means**, which is the difference between a dead end and a wait.
 *
 * The page had one verdict for all three and it was the harshest one: any thrown error drew
 * `המסלול לא זמין · יכול להיות שהלינק בוטל`. That sentence is true of exactly one of these.
 */
export const SHARE_LOAD_FAILURE = {
  /** The server's own "this code is not live". Terminal: no retry and no reload cures it. */
  GONE: 'gone',
  /** This build cannot read the answer. Cured by a newer document. */
  UNREADABLE: 'unreadable',
  /** Nobody answered, or not yet — offline, a timeout, a 5xx, the seconds a deploy takes.
   *  Cured by asking again, which is why it is the default for an error nobody recognises. */
  TRANSIENT: 'transient',
} as const;
export type ShareLoadFailure = (typeof SHARE_LOAD_FAILURE)[keyof typeof SHARE_LOAD_FAILURE];

const HTTP_NOT_FOUND = 404;

export function shareLoadFailure(error: unknown): ShareLoadFailure {
  if (error instanceof SharedItineraryUnreadable) return SHARE_LOAD_FAILURE.UNREADABLE;
  if (error instanceof SharedItineraryUnavailable) {
    return error.status === HTTP_NOT_FOUND ? SHARE_LOAD_FAILURE.GONE : SHARE_LOAD_FAILURE.TRANSIENT;
  }
  return SHARE_LOAD_FAILURE.TRANSIENT;
}
