// **Which build am I looking at?** — asked on staging, where two deploys look identical and
// a bug report against the wrong one costs a session. Gated behind the `VITE_BUILD_BADGE`
// build-time env var, so production ships nothing: same mechanism as `NavDebugHud`
// (`VITE_NAV_DEBUG`), deliberately, rather than a second way to turn a debug surface on.
//
// The label is NOT an env var. `vite.config.ts`'s `buildLabel()` reads the commit from
// Railway (or the local checkout) at build time, because a string somebody has to remember
// to bump is one that eventually lies — and a build indicator that lies is worse than none.
//
// Inline styles and Latin text on purpose: this is an instrument, not product UI, so it
// spends no design-language grammar and no token budget (the same call `NavDebugHud` makes).
// It must never look like part of the app.
import { useState } from 'react';

/** Injected by `vite.config.ts`'s `define`. Declared locally rather than in a global .d.ts:
 *  this is the only file that reads it, and the repo has no ambient declaration file to
 *  grow for one constant. */
declare const __BUILD_LABEL__: string;

function badgeEnabled(): boolean {
  const flag = import.meta.env.VITE_BUILD_BADGE;
  return flag === '1' || flag === 'true';
}

export function BuildBadge() {
  // Tap to hide for the rest of the session: the badge sits over a corner of a phone-first
  // layout (ADR-0017), and anyone testing a surface underneath it needs a way out that is
  // not a redeploy.
  const [hidden, setHidden] = useState(false);
  if (!badgeEnabled() || hidden) return null;
  return (
    <button
      type="button"
      onClick={() => setHidden(true)}
      // `dir="auto"` rather than `dir="ltr"`, which is lint-blocked and would be wrong
      // anyway (ADR-0118). The content is digits and Latin, so `auto` resolves it LTR.
      dir="auto"
      title="Build info, tap to hide"
      style={{
        position: 'fixed',
        // Bottom-left, above the tab bar's own band: the top edge carries the app's header
        // and the bottom-right is where a place card's controls land.
        insetInlineStart: 4,
        bottom: 4,
        zIndex: 2147483647,
        padding: '2px 6px',
        border: 0,
        borderRadius: 4,
        font: '10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: 0,
        color: '#fff',
        background: 'rgba(0,0,0,.62)',
        // Never eat a tap meant for the map underneath — except on the badge itself, which
        // is the one thing here that has to stay tappable.
        pointerEvents: 'auto',
      }}
    >
      {__BUILD_LABEL__}
    </button>
  );
}
