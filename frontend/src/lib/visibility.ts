// One `visibilitychange` listener, with the away-time bookkeeping done once.
//
// Three callers now need "the tab left" / "the tab came back, and it was gone
// this long": the idle-resume reset to Home (ADR-0060), trip-state's warm-resume
// catch-up, and the automatic build swap (ADR-0185), which takes the hidden edge
// as its cheapest moment to reload. The first two had grown the same `hiddenAt`
// dance independently — this is that dance, extracted, rather than a third copy.
//
// `getNow()` rather than `Date.now()` because both existing callers measure the
// away stretch against the app's clock, which the dev time-travel control moves.
import { getNow } from './useClock';

export interface VisibilityHandlers {
  /** The tab just went to the background. */
  onHidden?: () => void;
  /** The tab came back. `awayMs` is 0 when it never actually left. */
  onResume?: (awayMs: number) => void;
}

export function observeVisibility(handlers: VisibilityHandlers): () => void {
  let hiddenAt = 0;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = getNow();
      handlers.onHidden?.();
      return;
    }
    const awayMs = hiddenAt === 0 ? 0 : getNow() - hiddenAt;
    hiddenAt = 0;
    handlers.onResume?.(awayMs);
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}
