// **THE CHIP IS THE WAY IN, AND THERE IS ONE OF IT** (ADR-0174 §2).
//
// Before this, `DocumentChip` was a title `<span>` plus one button — and that button
// DETACHED. There was no tap anywhere in the app that opened an attached file, while the
// viewer it needed (`MediaViewer`/`DocumentViewer`, the app's one full-screen reader) was
// already reached by the documents list, the map's place photos and `FilePicker`'s pre-save
// look. The whole feature was write-only.
//
// **Extracted rather than copied**, and that is the reason this file exists at all: the form
// slot, three read surfaces and (soon) a fourth all want the same row, so the second copy is
// the one not to write (ADR-0094/0096, root rule 8). The list owns the viewer state too —
// otherwise each host would hold its own `useState` + `<DocumentViewer>` pair, which is five
// copies of the same six lines.
//
// **The shape is `.note-chip`'s exactly**: the text is a BUTTON and the detach `✕` is its
// SIBLING, never its child, because buttons do not nest — the same reason `ListRow`'s
// trailing slot is a sibling. `.note-chip`'s own comment argues it for the other content
// type ("a committed note has to be editable before the host is saved"); a document is that
// case one step further along, since the point of attaching a boarding pass on the way is
// that you meant to LOOK at it later.
//
// **A read surface passes no `onRemove`, and that asymmetry is deliberate.** Detaching is an
// authoring act and stays where attaching happens — on the host's form. It follows ADR-0173
// §4's own logic (a place displays, never originates) applied to every read surface, and it
// buys one less control on each of them plus no destructive tap on a surface someone opened
// in order to look at something.
import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { DocumentSummary } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { DOCUMENT_TYPE_ICON } from '../constants';
import { overlayOriginOffset } from '../lib/motion';
import { DocumentViewer } from './MediaViewer';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { Icon } from './Icon';
import { t } from '../i18n/he';
import './attach.css';

export interface DocumentChipRow {
  document: DocumentSummary;
  /** Present only where detaching belongs — the host's own form (see the header). */
  onRemove?: () => void;
  /** **Where an inherited document came from** (ADR-0172 §9's amendment, applied to the
   *  second content type). Only a place can show rows it does not host, so everywhere else
   *  this is absent and nothing is marked. */
  from?: ReactNode;
}

export function DocumentChips({
  rows,
  className,
}: {
  rows: DocumentChipRow[];
  className?: string;
}) {
  const { trip } = useTrip();
  const [viewing, setViewing] = useState<DocumentSummary | null>(null);
  // Where the viewer grows from — the tapped row's offset, exactly as the documents list
  // measures it. A constant here would be the landing-box shortcut `frontend/CLAUDE.md`
  // records three bugs from.
  const [viewFrom, setViewFrom] = useState<number | null>(null);

  return (
    <div className={'doc-chips' + (className ? ` ${className}` : '')}>
      {rows.map((row) => (
        <Chip
          key={row.document.id}
          row={row}
          onOpen={(e) => {
            setViewFrom(overlayOriginOffset(e.currentTarget));
            setViewing(row.document);
          }}
        />
      ))}
      {viewing && (
        <DocumentViewer
          tripId={trip.id}
          doc={viewing}
          originY={viewFrom}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

/** One chip, its own component for one reason: **a queued upload has to read as
 *  provisional** (ADR-0092), and that answer comes from a hook — `useUnsynced` — which
 *  cannot be called inside a `.map()`.
 *
 *  It reuses the app's ONE per-entity sync grammar rather than inventing a chip-sized
 *  version of it: the row dims to ~0.6 while the write is in transit and carries
 *  `EntitySyncBadge`, which is silent once synced and shows `cloud-up`/`cloud-bang`
 *  otherwise. That matters more here than on most rows — a document attached from a host's
 *  own form is outbox-first (ADR-0056), so the commonest way to meet an attachment for the
 *  first time is while its bytes are still queued, and a chip that looked settled would be
 *  claiming the file is somewhere it is not. A FAILED one deliberately stays full-opacity,
 *  so its `cloud-bang` keeps asking for action. */
function Chip({
  row: { document, onRemove, from },
  onOpen,
}: {
  row: DocumentChipRow;
  onOpen: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const unsynced = useUnsynced(document.id);
  return (
    <div className="doc-chip-row">
      <span className={'doc-chip' + (unsynced ? ' unsynced' : '')}>
        <button type="button" className="doc-chip-open" title={t.docs.open} onClick={onOpen}>
          {/* The per-type badge stays an EMOJI — it is one document's own face, which is
              the side of ADR-0138's line that content sits on. The section header's mark
              beside it is an `Icon`, because that one is chrome. */}
          <span className="doc-chip-g" aria-hidden="true">
            {DOCUMENT_TYPE_ICON[document.type]}
          </span>
          <span className="doc-chip-n" dir="auto">
            {document.title}
          </span>
          <EntitySyncBadge id={document.id} />
        </button>
        {onRemove && (
          <button
            type="button"
            className="doc-chip-x"
            onClick={onRemove}
            aria-label={t.docs.attach.detach}
          >
            <Icon name="close" />
          </button>
        )}
      </span>
      {from && <span className="docr-from">{from}</span>}
    </div>
  );
}
