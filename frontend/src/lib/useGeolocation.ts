// Own-device geolocation for "near me now" (ADR-0006: own-device IN, sharing with
// the group OUT; ADR-0109 §6: just-in-time, never on tab open, never blocking a
// read). The position is held in React state for the life of the screen and is
// never persisted, never sent to the backend, and never put on the wire — the
// whole feature is a client-side re-sort.
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

export interface Geolocation {
  status: GeoStatus;
  /** The last fix, kept while the screen lives. Absent unless `status` is granted. */
  coords?: LatLng;
  /** The permission is *hard*-denied, so a retry cannot re-prompt — the UI must
   *  say "allow it in your browser settings" rather than offer a dead button. */
  blocked: boolean;
  /** Ask for a fix. Safe to call repeatedly; a second call refreshes the position. */
  request: () => void;
}

const supported = () => typeof navigator !== 'undefined' && !!navigator.geolocation;

export function useGeolocation(): Geolocation {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<LatLng | undefined>();
  const [blocked, setBlocked] = useState(false);
  // A fix can land after the screen is gone (the OS prompt has no time limit).
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  // The Permissions API tells us up front whether asking would even show a prompt,
  // which is what separates "tap to retry" from "change it in settings". It is
  // advisory only — where it is missing we simply learn from the request itself.
  useEffect(() => {
    if (!supported() || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((permission) => {
        const read = () => {
          if (cancelled || !alive.current) return;
          setBlocked(permission.state === 'denied');
        };
        read();
        permission.addEventListener('change', read);
      })
      .catch(() => {
        /* not queryable here — the request result is the source of truth */
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
        setBlocked(false);
        setStatus('granted');
      },
      (error) => {
        if (!alive.current) return;
        const refused = error.code === error.PERMISSION_DENIED;
        setBlocked(refused);
        setStatus(refused ? 'denied' : 'unavailable');
      },
      GEOLOCATION_OPTIONS,
    );
  }, []);

  return { status, coords, blocked, request };
}
