import { useState } from 'react';
import { t } from '../i18n/he';
import { CONTROL_ICON } from '../constants';
import { Icon } from './Icon';

/**
 * **The trip's public link, as a control rather than a caption** (ADR-0213's 2026-08-30
 * amendment).
 *
 * One component, three hosts: the share sheet's invite branch, its read-only branch, and
 * Trip Settings. It exists because those hosts were about to hold two copies of "the trip's
 * link" — the duplication rule 8 is written to prevent — and because the copy already there
 * could not be reused as it stood.
 *
 * **Neutral, deliberately.** `.invite-box` (the settings and born screens' version) paints
 * `--plan-tint` with a dashed violet border, and settings is not Plan mode — so it spends
 * the hue ADR-0028 reserves. That is repaired here rather than carried forward: this row
 * borrows the sheet's own quiet surface, and the only colour it ever shows is `--ok`, for
 * the moment after a copy.
 *
 * The press confirms **in place** as well as through the toast (ADR-0142 §3): the toast says
 * it happened, the box you tapped should say that you tapped it. Latched rather than timed,
 * exactly as `CreateTrip`'s box does it — there is nothing to un-copy.
 */
export function TripLinkRow({
  url,
  onCopy,
  ariaLabel = t.share.owner.copyLink,
}: {
  /** The written link — host and path, no scheme (`lib/invite-link.ts`). */
  url: string;
  /** Runs on press. The host owns the clipboard write and its toast, because what the
   *  toast should say differs per link. */
  onCopy: () => void;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="share-link-row"
      aria-label={ariaLabel}
      data-copied={copied ? '' : undefined}
      onClick={() => {
        onCopy();
        setCopied(true);
      }}
    >
      {/* The app never wrote this string, so it states its own direction (ADR-0118). */}
      <span className="share-link" dir="auto">
        {url}
      </span>
      <Icon name={copied ? CONTROL_ICON.done : CONTROL_ICON.clipboard} />
    </button>
  );
}
