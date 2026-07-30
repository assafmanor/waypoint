// The travelling half of the trip handoff (ADR-0140 §7). See `lib/trip-handoff.ts` for
// what is being carried and why it is the glyph.
//
// Mounted beside `AppRoutes` rather than inside it, which is the only placement that
// works: the object has to outlive the screen it came from and the boot screen that
// follows it. Everything it draws is written from measured rects, so it holds no
// geometry of its own.
import { useEffect, useRef } from 'react';
import { EASE_ARRIVE, TRIP_HANDOFF } from '../../constants';
import { motionDurationMs } from '../../lib/motion';
import { endTripHandoff, useTripHandoff } from '../../lib/trip-handoff';

export function TripHandoffLayer() {
  const { origin, target } = useTripHandoff();
  const ref = useRef<HTMLDivElement>(null);

  // Nothing claimed it — a redirect, a boot that failed, a trip whose shell never
  // mounted. Let the glyph go rather than leave it pinned over the app with the pill's
  // own icon hidden behind it. Long enough for a warm boot, short enough that a held
  // object never reads as a stuck one.
  useEffect(() => {
    if (!origin || target) return;
    const id = setTimeout(endTripHandoff, TRIP_HANDOFF.STRAND_MS);
    return () => clearTimeout(id);
  }, [origin, target]);

  // The flight. Position AND box travel, because the two ends are different shapes: a
  // 46px paper tile (52px on the hero) becomes a bare 22px glyph, so the tile's fill has
  // to dissolve on the way or it would arrive as a swatch sitting on the chrome.
  //
  // No opacity fade at the end, deliberately. The clone lands ON the pill's own glyph
  // and `endTripHandoff` removes it in the same commit that reveals the real one, so
  // fading out would mean a frame with neither visible. That only holds while the
  // landing is exact — which is what the e2e spec measures.
  useEffect(() => {
    if (!origin || !target) return;
    const clone = ref.current;
    const duration = motionDurationMs('--t-deliberate');
    if (!clone?.animate || duration === 0) {
      endTripHandoff();
      return;
    }
    const flight = clone.animate(
      [
        {
          left: `${origin.left}px`,
          top: `${origin.top}px`,
          width: `${origin.width}px`,
          height: `${origin.height}px`,
          fontSize: origin.fontSize,
          borderRadius: origin.radius,
        },
        {
          left: `${target.left}px`,
          top: `${target.top}px`,
          width: `${target.width}px`,
          height: `${target.height}px`,
          fontSize: target.fontSize,
          borderRadius: '999px',
        },
      ],
      { duration, easing: EASE_ARRIVE, fill: 'forwards' },
    );
    // The dissolve is its OWN animation rather than a keyframe inside the flight, and
    // that is not tidiness: `--ease-arrive` is front-loaded by design (it overshoots and
    // settles), and keyframe offsets are sampled against the EASED progress — so an
    // `offset: 0.6` under it had the tile gone in the first fifth of the travel, before
    // the object had visibly left the list. Linear, on its own clock.
    const dissolve = clone.animate([{}, { backgroundColor: 'transparent' }], {
      duration: duration * TRIP_HANDOFF.TILE_FADE,
      easing: 'linear',
      fill: 'forwards',
    });
    flight.addEventListener('finish', endTripHandoff);
    return () => {
      flight.removeEventListener('finish', endTripHandoff);
      flight.cancel();
      dissolve.cancel();
    };
  }, [origin, target]);

  if (!origin) return null;
  return (
    <div
      ref={ref}
      className={'handoff-glyph' + (target ? ' is-landing' : '')}
      aria-hidden="true"
      style={{
        // Physical `left`/`top`, deliberately not the logical properties this codebase
        // prefers: every number here comes from a DOMRect, and rects are physical. In
        // this RTL app `inset-inline-start` resolves to `right`, which would anchor the
        // box to the opposite edge — the trap `.wp-dragghost` documents in tokens.css.
        left: origin.left,
        top: origin.top,
        width: origin.width,
        height: origin.height,
        fontSize: origin.fontSize,
        borderRadius: origin.radius,
        background: origin.background,
      }}
    >
      {origin.glyph}
    </div>
  );
}
