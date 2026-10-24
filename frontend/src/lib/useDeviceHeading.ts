// **Which way the phone is pointing** (ADR-0234 §6), for the compass's heading-up mode.
//
// **This is not the location permission and must not be confused with it.** ADR-0109 §6 and
// ADR-0121 §12 say the reason-first card is the only thing allowed to ask for *location*;
// that invariant is about where you are, and this is about which way you are facing. It
// reveals no position, it is asked for by the tap that wants it, and it never touches
// `navigator.geolocation`. The boundary is the point: the rule is about location, not about
// the word "permission".
//
// Nothing is persisted and nothing leaves the device — like `useGeolocation`, this is a
// client-side reading that exists only while the screen does.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_ORIENT } from '../constants';
import { normalizeBearing, shortestTurn } from './map-camera';

export type HeadingStatus =
  /** Never asked. The map is north-up and nothing is listening. */
  | 'idle'
  /** The platform dialog is up (iOS only — everywhere else this state is instantaneous). */
  | 'asking'
  /** Listening, and `heading` is live. */
  | 'on'
  /** The user said no. A retry can re-prompt on some platforms and not on others, so the
   *  caller offers the control again rather than dead-ending it. */
  | 'denied'
  /** No orientation events here at all — a desktop without a magnetometer is the ordinary
   *  case, not an error. Distinct from `denied` because only one of them is about a choice. */
  | 'unsupported';

export interface DeviceHeading {
  status: HeadingStatus;
  /** Degrees clockwise from north, `[0, 360)`, smoothed. Absent until a sample arrives. */
  heading?: number;
  /** **Call this from a user gesture.** iOS requires `requestPermission()` to be reached
   *  from one, and the compass tap is that gesture (ADR-0234 §6). */
  start: () => void;
  stop: () => void;
}

/** iOS puts a `requestPermission` static on the event constructor; nobody else does. */
type OrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

const supported = () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

/**
 * **A sample, as degrees clockwise from north, or `null` if this event cannot say.**
 *
 * Two sources and they disagree about direction, which is the trap here:
 *
 * · iOS reports `webkitCompassHeading`, already clockwise from **true** north. Use it as is.
 * · Everyone else reports `alpha` on `deviceorientationabsolute`, which is **counter**-
 *   clockwise from north — so a heading is `360 - alpha`. Reading `alpha` as a heading
 *   gives a compass that turns the wrong way, which looks like a sign error in the CSS.
 *
 * A non-absolute `deviceorientation` event carries an `alpha` relative to wherever the
 * device happened to start, which is not a heading at all — `absolute` is what says it is
 * anchored to north, and a reading without it is refused rather than guessed.
 */
export function headingFromEvent(
  event: Pick<DeviceOrientationEvent, 'alpha' | 'absolute'> & { webkitCompassHeading?: number },
): number | null {
  if (
    typeof event.webkitCompassHeading === 'number' &&
    Number.isFinite(event.webkitCompassHeading)
  ) {
    return normalizeBearing(event.webkitCompassHeading);
  }
  if (!event.absolute || event.alpha == null || !Number.isFinite(event.alpha)) return null;
  return normalizeBearing(360 - event.alpha);
}

/**
 * **One smoothed step**, over the short arc — the whole reason this is a named function and
 * not a lerp at the call site. A plain weighted average of 350 and 10 is 180: the compass
 * would swing through south to cross north. Returns `null` when the step is below the floor,
 * which is the caller's signal to write nothing at all.
 */
export function smoothHeading(previous: number | undefined, sample: number): number | null {
  if (previous == null) return sample;
  const turn = shortestTurn(previous, sample);
  if (Math.abs(turn) < MAP_ORIENT.MIN_STEP_DEG) return null;
  return normalizeBearing(previous + turn * MAP_ORIENT.SMOOTHING);
}

export function useDeviceHeading(): DeviceHeading {
  const [status, setStatus] = useState<HeadingStatus>(() => (supported() ? 'idle' : 'unsupported'));
  const [heading, setHeading] = useState<number | undefined>();
  // The smoothed value is read inside a DOM listener that must not be re-attached per
  // sample, so it lives in a ref and the state is only what renders.
  const smoothed = useRef<number | undefined>(undefined);
  const listening = useRef(false);

  const handle = useCallback((event: DeviceOrientationEvent) => {
    const sample = headingFromEvent(event);
    if (sample == null) return;
    const next = smoothHeading(smoothed.current, sample);
    // `null` is "below the floor" — a hand held still, and nothing to write.
    if (next == null) return;
    smoothed.current = next;
    setHeading(next);
  }, []);

  const stop = useCallback(() => {
    if (!listening.current) return;
    listening.current = false;
    window.removeEventListener('deviceorientationabsolute', handle as EventListener);
    window.removeEventListener('deviceorientation', handle as EventListener);
    smoothed.current = undefined;
    setHeading(undefined);
    setStatus((s) => (s === 'on' ? 'idle' : s));
  }, [handle]);

  const listen = useCallback(() => {
    if (listening.current) return;
    listening.current = true;
    // Both, deliberately: `deviceorientationabsolute` is the north-anchored one and is what
    // Chrome fires, while iOS fires only `deviceorientation` and carries the heading on
    // `webkitCompassHeading`. `headingFromEvent` refuses whichever of the two cannot say.
    window.addEventListener('deviceorientationabsolute', handle as EventListener);
    window.addEventListener('deviceorientation', handle as EventListener);
    setStatus('on');
  }, [handle]);

  const start = useCallback(() => {
    if (!supported()) {
      setStatus('unsupported');
      return;
    }
    const ctor = window.DeviceOrientationEvent as OrientationEventCtor;
    // No `requestPermission` means no gate — the events simply flow (Chrome, Firefox).
    if (typeof ctor.requestPermission !== 'function') {
      listen();
      return;
    }
    setStatus('asking');
    ctor
      .requestPermission()
      .then((result) => (result === 'granted' ? listen() : setStatus('denied')))
      // A rejection here is iOS refusing the call itself — most often because it did not
      // arrive from a user gesture. Indistinguishable from a refusal at this layer, and the
      // caller's answer to both is the same: heading-up is unavailable, the reset is not.
      .catch(() => setStatus('denied'));
  }, [listen]);

  // A screen that unmounts while following must not leave a listener on `window` writing
  // into a dead component — the same rule `useGeolocation`'s `alive` ref keeps for a fix
  // that lands late.
  useEffect(() => stop, [stop]);

  return { status, heading, start, stop };
}
