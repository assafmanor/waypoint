// **One pressed chip, for every surface that has one** (root rule 8; ADR-0136 §1 as
// amended in session 185, which is where this file's existence is recorded).
//
// The app's boolean idiom has always been an `aria-pressed` BUTTON rather than a switch,
// but it had never been a component: `map.css` carried `.map-maybes`, `.map-scopechip`,
// `.map-facets` and `.map-nearchip` as four hand-rolled copies of one rule, and three of
// their on-states were the same three declarations written three times. ADR-0136's row
// would have been the fifth copy, in a form, outside `map.css` — the one-off pile
// `ui/feedback/` already exists to stop.
//
// What it deliberately does NOT absorb: `.map-addmaybe`, the tab's `＋ אולי` CTA pill
// (ADR-0135 §1). That is a create, not a state — it has no on-state to carry, and it owns
// a hover/disabled grammar a chip has no use for.
import { type ReactNode } from 'react';
import './toggle-chip.css';

export function ToggleChip({
  on,
  semantics = 'toggle',
  tone = 'accent',
  size = 'compact',
  provisional,
  count,
  onClick,
  className,
  ariaLabel,
  ariaControls,
  children,
}: {
  /** The chip's visual on-state. */
  on: boolean;
  /** Whether `on` is this control's **own pressed state** (a `toggle`: the day scope, the
   *  `אולי` facet, near-me, the form's `יש הזמנה`) or a **fact it reports about somewhere
   *  else** (an `indicator`: the Map's one filter control, whose on-state says "filtering
   *  is live" and whose tap opens the facet strip). Only a toggle gets `aria-pressed` —
   *  announcing a disclosure opener as pressed is a claim a screen reader has no way to
   *  see through, and an `indicator` therefore owes its own `ariaLabel`. */
  semantics?: 'toggle' | 'indicator';
  /** `accent` — the surface's own selection accent (`--idx-accent`, per-mode: ink in Trip,
   *  plan violet in Plan), the Map strip's grammar. `cta` — the neutral primary, tinted
   *  rather than filled, for a chip inside a form. `teal` — a LOCATION affordance, and
   *  only that (ADR-0109 §6-7 / ADR-0028): near-me, never a variant to flatten. `muted` —
   *  present but no longer claiming it can act (near-me after a location refusal). */
  tone?: 'accent' | 'cta' | 'teal' | 'muted';
  /** `compact` is one of a strip of filters; `touch` meets the 44px floor (ADR-0017) for a
   *  chip that is its surface's primary control. */
  size?: 'compact' | 'touch';
  /** Dashed while off: "provisional", the `אולי` facet's own grammar (ADR-0110 §2). */
  provisional?: boolean;
  /** The trailing mono count (`אולי 3`). Omitted renders no slot. */
  count?: number;
  onClick: () => void;
  /** Layout/animation hook for the host surface — this component owns appearance only, so
   *  where a chip SITS (and how it enters/leaves) stays with the screen that places it. */
  className?: string;
  ariaLabel?: string;
  ariaControls?: string;
  children: ReactNode;
}) {
  const classes = [
    'wp-chip',
    tone,
    size === 'touch' && 'touch',
    provisional && 'provisional',
    on && 'on',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      // A pressed state is what an `indicator` does not have — see `semantics`.
      aria-pressed={semantics === 'toggle' ? on : undefined}
      aria-label={ariaLabel}
      aria-controls={ariaControls}
      onClick={onClick}
    >
      {children}
      {count != null && (
        // Decorative: the chip's own label already names what is being counted, so a
        // reader hearing "אולי 3" twice gains nothing.
        <span className="wp-chip-count" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}
