// **THE READ SURFACE, ONCE** (ADR-0053's grammar, generalized by ADR-0174 §4).
//
// `BookingDetail` was the app's only read surface and it built this shell inline, which was
// right while there was one of them. ADR-0174 §4 gives an EVENT a read as well — and the two
// differ only in **which facts they list**: both are a `Sheet` holding one `עריכה`, a badge
// and title, the hard-commitment guard line, a facts block, then documents above notes.
//
// So this is the extraction rather than the second copy. Writing `EventDetail` by hand first
// is what made the duplication visible: `Sheet` → `.bk-detail` → `.bk-actions` → `.bk-head`
// → `.bs-hard-note` → `.bk-facts` → `HostDocuments` → `HostNotes` came out identical, line
// for line, which is exactly the shape ADR-0078/0079/0094/0095 are retractions of. The class
// names stay `bk-*`: they are the READ SURFACE's CSS, and renaming them would be a large
// diff through a shipped stylesheet for no reader's benefit — the same call `MediaViewer`
// made about `doc-viewer-*` when it stopped being document-shaped.
//
// **What it deliberately does not own:** the facts. Those are the part that genuinely
// differs — a booking has a confirmation code, a provider, WiFi, a journey and a round-trip
// partner; an event has a place and a time — and a shell that tried to model both would grow
// a per-entity branch, which is ADR-0094's own anti-pattern one layer up.
import type { ReactNode } from 'react';
import type { NoteHostRef } from '../lib/notes';
import { Sheet } from './Sheet';
import { HostDocuments } from './HostDocuments';
import { HostNotes } from './HostNotes';
import { Icon } from './Icon';
import { t } from '../i18n/he';

export function DetailSheet({
  ariaLabel,
  badge,
  badgeClassName,
  title,
  subtitle,
  hard,
  facts,
  host,
  onEdit,
  onClose,
}: {
  /** The accessible name. A visible heading is `title` — two names for one heading is how
   *  the two drift apart, so the sighted and the screen reader get the same words. */
  ariaLabel: string;
  badge: ReactNode;
  /** The category tint, where the host has one (`badgeClassForBookingType`). */
  badgeClassName?: string;
  title: ReactNode;
  /** The sub-line, dropped rather than echoing a title that already says it (ADR-0163). */
  subtitle?: ReactNode;
  /** **The hard-commitment guard** (ADR-0011), which is what ADR-0053 made this whole
   *  surface for: a read stands between you and the edit of a real commitment. */
  hard?: boolean;
  facts: ReactNode;
  /** Whose documents and notes read here. One host, both sections, both through
   *  `lib/host-context.ts` — so a linked pair reads as one context on either surface. */
  host: NoteHostRef;
  /** **Absent on a read-only archive** (ADR-0040): a finished trip is browsable, and this
   *  sheet is what makes it browsable — but nothing on it may write. */
  onEdit?: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet ariaLabel={ariaLabel} onClose={onClose}>
      <div className="bk-detail">
        {onEdit && (
          <div className="bk-actions">
            <button type="button" className="bk-edit" onClick={onEdit}>
              <Icon name="edit" /> {t.index.detail.edit}
            </button>
          </div>
        )}

        <div className="bk-head">
          <div className={'bk-badge' + (badgeClassName ? ` ${badgeClassName}` : '')}>{badge}</div>
          <div className="bk-headtext">
            <div className="bk-title">{title}</div>
            {subtitle && <div className="bk-type">{subtitle}</div>}
          </div>
        </div>

        {hard && (
          <div className="bs-hard-note">
            <Icon name="lock" /> {t.index.detail.hardNote}
          </div>
        )}

        <div className="bk-facts">{facts}</div>

        {/* **Documents read above notes** (ADR-0174 §3), the same order the host's own form
            teaches: a document is a thing you need and a note is something about it, and the
            shorter, fixed-length list goes first. Both are absent — not empty — when the host
            carries nothing, which is most of them. */}
        <HostDocuments host={{ kind: host.kind, id: host.id }} />
        <HostNotes host={host} />
      </div>
    </Sheet>
  );
}
