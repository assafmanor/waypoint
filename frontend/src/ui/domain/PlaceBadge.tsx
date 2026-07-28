// PlaceBadge — a row's category badge, which is also the way to that place on our
// map (ADR-0121 §8 amendment).
//
// The owner's rule is that EVERY event and booking has an easy way to its pin, in
// both modes. The labelled action row could not deliver that: on the day card it
// lives inside `.wp-event-actions`, which is `max-height: 0` until the card is
// expanded, so an unexpanded event offered no way to the map at all — and the
// settle variant, which returns before that row exists, had none in any state.
//
// A separate control in the row's trailing slot was built first and then MEASURED
// against the real stylesheets, which killed it: at 390px it took `Ichiran Ramen`
// from one line to two, silently cut a transition title from 184px to 126px, and at
// 360px exploded a long Hebrew builder title to five lines. A dense row has no
// horizontal room to give.
//
// So the way in is the badge, which costs no width because it is already there —
// and it is the RIGHT object rather than merely the free one: ADR-0109 §3 and
// ADR-0121 §6 make the map pin and the list badge one thing in two form factors,
// sharing the `--cat-*` tokens by construction. Tapping the badge to see the badge's
// other form is the app's own idea, followed.
//
// It carries a small teal PIN at its corner, not a bare dot, because a tappable
// thing has to look tappable: the marker names what the tap does and repeats the
// silhouette of what you land on. Without a place the badge is exactly what it
// always was — no ring, no marker, no role — which is "absent, not broken".
//
// Presentational only: the host's own badge class in, one handler, no state.
import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';
import './place-badge.css';

export function PlaceBadge({
  className,
  children,
  onShowOnMap,
}: {
  /** The host's own badge class (`wp-event-badge`, `bld-bd`, `tr-badge`, …), so the
   *  badge keeps its surface's size, tint and radius and this adds only the way in. */
  className: string;
  /** The category glyph — emoji content, per ADR-0038. */
  children: ReactNode;
  /** Focus this row's place on our map. Absent → a plain, inert badge. */
  onShowOnMap?: () => void;
}) {
  if (!onShowOnMap) {
    return (
      <span className={className} aria-hidden="true">
        {children}
      </span>
    );
  }
  // The badge sits inside a face that is itself a button on several hosts, so the
  // tap must not also toggle or open the row — the reasoning `EventCard`'s done-✓
  // already had to apply one element over. That is also why this is a `role="button"`
  // span and not a `<button>`: nested buttons are invalid HTML.
  const fire = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onShowOnMap();
  };
  return (
    <span
      className={`${className} wp-placebadge`}
      role="button"
      tabIndex={0}
      aria-label={t.actions.showOnMap}
      title={t.actions.showOnMap}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      }}
    >
      {children}
      <span className="wp-placebadge-mark" aria-hidden="true">
        <Icon name="pin" />
      </span>
    </span>
  );
}
