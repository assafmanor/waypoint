// **Replay** (ADR-0241 §2): a finished trip plays back day by day on its own map. Every camera
// move is the caller's `frame`, i.e. the camera's one `easeTo` (ADR-0129 §3); this hook only
// sequences it and says which stops have lit.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { MAP_CAMERA_EASE, REPLAY } from '../constants';
import { replayStepMs, type ReplayDay } from './map-replay';
import type { LatLng } from './map-camera';

/** What has lit so far: pins by place, legs by the stop they reach (`ReplayStop.reach`). */
export interface ReplayLit {
  places: ReadonlySet<string>;
  reach: ReadonlySet<string>;
}

export function useMapReplay(opts: {
  days: readonly ReplayDay[] | undefined;
  /** Fit the camera to these points, through the camera's own ease. */
  frame: (points: readonly LatLng[]) => void;
  /** Fit the whole journey again, at the end of a run. */
  frameAll: () => void;
  /** The canvas a finger lands on: a press anywhere on it but a control stops the run. */
  paneRef: RefObject<HTMLElement | null>;
  onLit: (lit: ReplayLit | null) => void;
  onChange?: (playing: boolean) => void;
}): { playing: boolean; caption?: string; toggle: () => void } {
  const [playing, setPlaying] = useState(false);
  const [caption, setCaption] = useState<string | undefined>(undefined);
  // Latest-ref: the run reads the current callbacks, and the screen re-renders every second.
  const latest = useRef(opts);
  latest.current = opts;
  const run = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = useCallback(() => {
    run.current += 1;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(false);
    setCaption(undefined);
    latest.current.onLit(null);
    latest.current.onChange?.(false);
  }, []);

  const start = useCallback(() => {
    const days = latest.current.days;
    if (!days?.length) return;
    const token = ++run.current;
    const later = (ms: number, then: () => void) => {
      timers.current.push(
        setTimeout(() => {
          if (run.current === token) then();
        }, ms),
      );
    };
    const places = new Set<string>();
    const reach = new Set<string>();
    const emit = () => latest.current.onLit({ places: new Set(places), reach: new Set(reach) });

    const finish = () => {
      latest.current.frameAll();
      later(MAP_CAMERA_EASE.DURATION_MS, stop);
    };
    const light = (d: number, k: number) => {
      const day = days[d]!;
      const at = day.stops[k]!;
      places.add(at.placeId);
      reach.add(at.reach);
      emit();
      const step = replayStepMs(day.stops.length);
      if (k + 1 < day.stops.length) later(step, () => light(d, k + 1));
      else later(step + REPLAY.DAY_HOLD_MS, () => playDay(d + 1));
    };
    const playDay = (d: number) => {
      const day = days[d];
      if (!day) return finish();
      setCaption(day.caption);
      latest.current.frame(day.stops.map(({ lat, lng }) => ({ lat, lng })));
      later(MAP_CAMERA_EASE.DURATION_MS, () => light(d, 0));
    };

    setPlaying(true);
    latest.current.onChange?.(true);
    emit();
    playDay(0);
  }, [stop]);

  const toggle = useCallback(() => (playing ? stop() : start()), [playing, start, stop]);

  // **The user wins the camera** (ADR-0121 §7): a finger on the canvas ends the run where it is.
  useEffect(() => {
    const pane = opts.paneRef.current;
    if (!playing || !pane) return;
    const onPress = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('button')) return;
      stop();
    };
    pane.addEventListener('pointerdown', onPress);
    pane.addEventListener('wheel', onPress, { passive: true });
    return () => {
      pane.removeEventListener('pointerdown', onPress);
      pane.removeEventListener('wheel', onPress);
    };
  }, [playing, opts.paneRef, stop]);

  // Leaving the tab mid-run leaves nothing scheduled behind it.
  useEffect(
    () => () => {
      run.current += 1;
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  return { playing, caption, toggle };
}
