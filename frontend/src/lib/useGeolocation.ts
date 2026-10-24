// Own-device geolocation for "near me now" (ADR-0006: own-device IN, sharing with
// the group OUT; ADR-0109 §6: asked on intent, behind a reason-first card, never
// blocking a read — and since the ADR-0109 session-134 amendment the Map tab makes
// that intent implicit on open, which is what `permission` below exists for).
//
// The position is held in React state for the life of the screen and is never
// persisted, never sent to the backend, and never put on the wire — the whole
// feature is a client-side re-sort.
//
// One shot per request, not a `watchPosition` subscription: "near me now" answers
// a question the user just asked, so a fix plus a re-tap to refresh costs far less
// battery than a live stream, and nothing on screen needs metre-by-metre updates.
import { useCallback, useEffect, useRef, useState } from 'react';
import { GEOLOCATION_OPTIONS } from '../constants';
import type { LatLng } from './distance';

export type GeoStatus =
  /** Never asked — the tab renders fully in this state (ADR-0109 §6). */
  | 'idle'
  /** Asked, waiting for a fix (the OS prompt may be up). */
  | 'locating'
  | 'granted'
  /** The user (or the browser's site setting) said no. */
  | 'denied'
  /** No geolocation API, or the device couldn't get a fix. */
  | 'unavailable';

/** What the browser will do if we ask, as far as the Permissions API will say.
 *  The two non-Permissions-API values are distinct on purpose, because a caller
 *  deciding whether to show a prompt has to tell them apart: `unknown` means the
 *  query is still in flight (wait for it), while `unsupported` means there is no
 *  Permissions API at all (Safari) and no better answer is coming. Neither is a
 *  refusal. */
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported';

export interface Geolocation {
  status: GeoStatus;
  /** The last fix, kept while the screen lives. Absent unless `status` is granted. */
  coords?: LatLng;
  /** **When that fix was taken**, and it is not bookkeeping (ADR-0207 §4). This hook is
   *  one-shot by design and holds its answer for the life of the screen, so the honest reading
   *  of the capability is "where you were when you last opened it" — never "where you are". A
   *  consumer that makes a CLAIM about the traveller has to be able to expire the fix, because
   *  a twenty-minute-old position at the leg's origin would earn a late mark for somebody who
   *  left fifteen minutes ago. "Near me now" never needed it: it answers the instant it asks. */
  fixedAt?: number;
  /** **The fix's own error bar, in metres**, where the platform reports one. ADR-0207 §5 floors
   *  its arrival radius on this: a radius smaller than the accuracy is measuring noise, and it
   *  would flicker between stances while the traveller stood still. */
  accuracyMeters?: number;
  /** The permission is *hard*-denied, so a retry cannot re-prompt — the UI must
   *  say "allow it in your browser settings" rather than offer a dead button. */
  blocked: boolean;
  /** Standing permission, before we ask anything. This is what lets a surface ask
   *  for a fix with **no dialog of any kind** when consent already exists, and show
   *  its reason-first card only when a prompt would actually appear. */
  permission: GeoPermission;
  /** Ask for a fix. Safe to call repeatedly; a second call refreshes the position. */
  request: () => void;
}

const supported = () => typeof navigator !== 'undefined' && !!navigator.geolocation;
const queryable = () => typeof navigator !== 'undefined' && !!navigator.permissions?.query;

export function useGeolocation(): Geolocation {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<LatLng | undefined>();
  // Held beside the fix rather than derived, because both are properties OF the fix: a
  // re-request replaces all three together or none of them.
  const [fixedAt, setFixedAt] = useState<number | undefined>();
  const [accuracyMeters, setAccuracyMeters] = useState<number | undefined>();
  const [blocked, setBlocked] = useState(false);
  // Seeded synchronously, so a caller never mistakes "no API here" for "still
  // loading" — the two lead to different decisions.
  const [permission, setPermission] = useState<GeoPermission>(() =>
    queryable() ? 'unknown' : 'unsupported',
  );
  // A fix can land after the screen is gone (the OS prompt has no time limit).
  // Re-armed on mount, not just cleared on unmount: a remount reuses the ref, so
  // without this a re-mounted hook (StrictMode's double-invoke in dev, or any
  // real remount) discards every fix it is handed and the chip stays "מאתר…".
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  // The Permissions API tells us up front whether asking would even show a prompt,
  // which is what separates "tap to retry" from "change it in settings". It is
  // advisory only — where it is missing we simply learn from the request itself.
  useEffect(() => {
    if (!supported()) {
      setPermission('unsupported');
      return;
    }
    if (!queryable()) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        const read = () => {
          if (cancelled || !alive.current) return;
          setBlocked(status.state === 'denied');
          setPermission(status.state as GeoPermission);
        };
        read();
        status.addEventListener('change', read);
      })
      .catch(() => {
        // Present but refusing to answer for geolocation — same practical position
        // as having no API: nothing better is coming, so stop waiting on it.
        if (!cancelled && alive.current) setPermission('unsupported');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(() => {
    if (!supported()) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!alive.current) return;
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        // `position.timestamp` is the platform's own, not ours: with `maximumAge` set the
        // browser may hand back a fix it took earlier, and stamping it on arrival would call
        // that cached position fresh.
        setFixedAt(position.timestamp);
        setAccuracyMeters(
          Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
        );
        setBlocked(false);
        setPermission('granted');
        setStatus('granted');
      },
      (error) => {
        if (!alive.current) return;
        const refused = error.code === error.PERMISSION_DENIED;
        setBlocked(refused);
        if (refused) setPermission('denied');
        setStatus(refused ? 'denied' : 'unavailable');
      },
      GEOLOCATION_OPTIONS,
    );
  }, []);

  return { status, coords, fixedAt, accuracyMeters, blocked, permission, request };
}
