// **Which build am I looking at?** — asked on staging, where two deploys look identical and
// a bug report against the wrong one costs a session. Gated behind the `VITE_BUILD_BADGE`
// build-time env var, so production ships nothing: same mechanism as `NavDebugHud`
// (`VITE_NAV_DEBUG`), deliberately, rather than a second way to turn a debug surface on.
//
// The label is NOT an env var. `vite.config.ts`'s `buildLabel()` builds it at build time,
// because a string somebody has to remember to bump is one that eventually lies.
//
// **Not interactive, and that is the correction.** The first version was a button that hid
// itself on tap; the owner tapped it and lost the one thing they had asked for. It is now
// `pointer-events: none` — it cannot eat a tap meant for the map underneath, and it cannot
// vanish. If it is ever genuinely in the way, the env var is the way to turn it off.
//
// Inline styles and Latin text on purpose: this is an instrument, not product UI, so it
// spends no design-language grammar and no token budget (the same call `NavDebugHud` makes).

/** Injected by `vite.config.ts`'s `define`. Declared locally rather than in a global .d.ts:
 *  this is the only file that reads it, and the repo has no ambient declaration file to
 *  grow for one constant. */
declare const __BUILD_LABEL__: string;

function badgeEnabled(): boolean {
  const flag = import.meta.env.VITE_BUILD_BADGE;
  return flag === '1' || flag === 'true';
}

export function BuildBadge() {
  if (!badgeEnabled()) return null;
  return (
    <div
      // `dir="auto"` rather than `dir="ltr"`, which is lint-blocked and would be wrong
      // anyway (ADR-0118). The content is digits and Latin, so `auto` resolves it LTR.
      dir="auto"
      style={{
        position: 'fixed',
        // Bottom-left, above the tab bar's own band: the top edge carries the app's header
        // and the bottom-right is where a place card's controls land.
        insetInlineStart: 4,
        bottom: 4,
        zIndex: 2147483647,
        padding: '2px 6px',
        borderRadius: 4,
        font: '10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
        color: '#fff',
        background: 'rgba(0,0,0,.62)',
        // Never eat a tap meant for whatever is underneath — see the header comment.
        pointerEvents: 'none',
        // A long label must not stretch a phone's layout or wrap into a block.
        maxInlineSize: '70vw',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {__BUILD_LABEL__}
    </div>
  );
}
