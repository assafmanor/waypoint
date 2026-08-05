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
// **It is also the thumbnail's frame** (ADR-0167 §1). A fetched photograph fills the badge's
// interior and the category hue moves from fill to a 2px ring, so no hue leaves ADR-0028's
// budget and the row still says what kind of place it is. This costs the row no width and no
// new slot — which is the whole reason it is possible: with restaurants at 0 of 7 for images
// (ADR-0166 §11.3), a dedicated thumbnail slot would be empty on most rows and the list would
// go ragged. Here the slot is always full, with a glyph as before or with a photo.
//
// Two traps live in this file, both measured in the mockup first (§8.1, §11.2) — see
// `place-badge.css`, where the CSS that avoids them is commented at the rules that do it.
//
// Presentational: the host's own badge class in, one handler. The one piece of state is
// whether the photo failed to load, which is a fact about this render and nothing else — see
// `photoUrl`.
import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { useFailableImage } from '../../lib/useFailableImage';
import { t } from '../../i18n/he';
import './place-badge.css';

export function PlaceBadge({
  className,
  children,
  onShowOnMap,
  label,
  order,
  photoUrl,
}: {
  /** The host's own badge class (`wp-event-badge`, `bld-bd`, `tr-badge`, …), so the
   *  badge keeps its surface's size, tint and radius and this adds only the way in. */
  className: string;
  /** The category glyph — emoji content, per ADR-0038. */
  children: ReactNode;
  /** Focus this row's place on our map. Absent → a plain, inert badge. */
  onShowOnMap?: () => void;
  /** What the tap does, when it is not "show this on the map" — the Map tab's own place
   *  card reuses this badge to frame its pin, where you are already looking at the map
   *  (ADR-0129 §1). Same verb one step further in, so the same control, a different
   *  name. */
  label?: string;
  /** The place's position in its day, stamped in the badge's corner (ADR-0121 §6). Only
   *  the Map's own badge carries one; the other hosts pass nothing. */
  order?: number;
  /** **A fetched photograph to fill the badge's interior** (ADR-0167 §1), or absent for the
   *  glyph — which is the majority of rows and looks exactly as it always did.
   *
   *  The caller decides, because only it knows whether the glyph beside it was PICKED or
   *  derived, and a picked icon beats a photo (§2) — see `lib/place-photo.ts`. */
  photoUrl?: string;
}) {
  // A blob a refresh replaced is a 404 (its URL is immutable, so it can never come back), and
  // the no-image state has to be what that degrades to — otherwise the badge shows the browser's
  // broken-image mark inside a 40px square. `useFailableImage` owns that, because the hero on
  // the expanded card needs the same answer (root rule 8) — including the part that is easy to
  // lose: a REPLACEMENT gets a fresh chance rather than inheriting the last one's failure.
  const { src: photo, onError } = useFailableImage(photoUrl);

  // The photo clips on an INNER element and the badge itself keeps no `overflow` (§11.2): this
  // badge hosts children that deliberately overhang it — the order counter at its corner, the
  // hit-area `::after` — and clipping the badge clips the counter into a quarter-circle. That
  // shipped in the mockup and took a human eye on a real device to catch.
  const frame = photo ? (
    <>
      <span className="wp-placebadge-photo" aria-hidden="true">
        <img src={photo} alt="" loading="lazy" decoding="async" onError={onError} />
      </span>
      {/* Outside the clip and above the image — see the CSS. The badge's own two
          pseudo-elements are already the order counter and the hit area, which is why v2's
          `::after` is a real element here. */}
      <span className="wp-placebadge-ring" aria-hidden="true" />
    </>
  ) : null;

  if (!onShowOnMap) {
    return (
      <span
        className={className}
        data-order={order}
        data-photo={photo ? '' : undefined}
        aria-hidden="true"
      >
        {frame}
        {!photo && children}
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
      data-order={order}
      data-photo={photo ? '' : undefined}
      role="button"
      tabIndex={0}
      aria-label={label ?? t.actions.showOnMap}
      title={label ?? t.actions.showOnMap}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      }}
    >
      {frame}
      {/* The glyph and the photo are alternatives, never stacked: a photograph behind an
          emoji is unreadable as either. */}
      {!photo && children}
      <span className="wp-placebadge-mark" aria-hidden="true">
        <Icon name="pin" />
      </span>
    </span>
  );
}
