// Documents section on the Index (ADR-0047/0049/0052/0056/0058): grouped by type,
// upload + view + per-row manage ("⋯"). Documents ride the trip snapshot and are a
// live reactive list (ADR-0058) — a peer's upload/rename/delete and our own writes
// (via the WS self-echo) reflect live, and the list reads offline like every other
// snapshot entity. Queued uploads (ADR-0056) render as pending "uploading" rows
// straight from the outbox, so they survive a reopen and reconcile to the real row
// once flushed. The title/encrypted-badge header lives in IndexDocumentsView's
// merged `idx-head` row now (ADR-0100 Consequences), not here — this component
// is content only.
import { useMemo, useState } from 'react';
import { type DocumentSummary } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { usePendingUploads, useIsOffline } from '../lib/outbox';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { ListRow, NoteMark } from './domain';
import { noteCountFor, noteCountsByHost } from '../lib/notes';
import { groupDocuments } from '../lib/documents';
import { formatBytes } from '../lib/bytes';
import { DocumentUploadSheet } from './DocumentUploadSheet';
import { DocumentViewer } from './DocumentViewer';
import { DocumentManageSheet } from './DocumentManageSheet';
import { Spinner } from './Spinner';
import { DOCUMENT_TYPE_ICON } from '../constants';
import { t } from '../i18n/he';
import { Icon } from './Icon';

export function DocumentsSection() {
  const { trip, documents, notes } = useTrip();
  // Built once per note-list change rather than filtered per row (ADR-0152 §6c).
  const noteCounts = useMemo(() => noteCountsByHost(notes), [notes]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<DocumentSummary | null>(null);
  const [managing, setManaging] = useState<DocumentSummary | null>(null);
  const pending = usePendingUploads(trip.id);

  // Merge the live list with queued uploads not yet reflected server-side; a Set of
  // pending ids drives the per-row "uploading" affordance.
  const serverIds = new Set(documents.map((d) => d.id));
  const pendingRows: DocumentSummary[] = pending
    .filter((p) => !serverIds.has(p.id))
    .map((p) => ({
      id: p.id,
      tripId: p.tripId,
      type: p.type,
      title: p.title,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      createdAt: '',
      updatedAt: '',
      updatedBy: '',
    }));
  const pendingIds = new Set(pendingRows.map((r) => r.id));
  const allDocs = [...documents, ...pendingRows];

  const groups = groupDocuments(allDocs);
  const isEmpty = allDocs.length === 0;

  return (
    <>
      {!isEmpty && (
        <button type="button" className="addbtn" onClick={() => setUploading(true)}>
          <Icon name="plus" /> {t.docs.add}
        </button>
      )}

      {isEmpty && (
        <div className="empty-card doc">
          {/* Not `DOCUMENT_TYPE_ICON.passport`: that is one document's badge, and
              borrowing it here made an empty SECTION announce itself as a passport. */}
          <div className="ei" aria-hidden="true">
            <Icon name="documents" />
          </div>
          <div className="et">{t.docs.emptyTitle}</div>
          <div className="es">{t.docs.emptyBody}</div>
          <button type="button" className="ea" onClick={() => setUploading(true)}>
            <span className="plus">
              <Icon name="plus" />
            </span>{' '}
            {t.docs.emptyAdd}
          </button>
        </div>
      )}

      {groups.map((g) => (
        <div className="doc-group" key={g.type}>
          <div className="gt">{t.docs.group[g.type]}</div>
          <div className="listcard">
            {g.docs.map((d) => (
              <DocumentRow
                key={d.id}
                doc={d}
                isPending={pendingIds.has(d.id)}
                notes={noteCountFor(noteCounts, 'document', d.id)}
                onOpen={() => setViewing(d)}
                onManage={() => setManaging(d)}
              />
            ))}
          </div>
        </div>
      ))}

      {uploading && <DocumentUploadSheet tripId={trip.id} onClose={() => setUploading(false)} />}
      {viewing && (
        <DocumentViewer tripId={trip.id} doc={viewing} onClose={() => setViewing(null)} />
      )}
      {managing && (
        <DocumentManageSheet tripId={trip.id} doc={managing} onClose={() => setManaging(null)} />
      )}
    </>
  );
}

// One document row. A queued upload and a committed row share one grammar now
// (ADR-0092): both carry the connected cloud sync marker (cloud-up while the
// upload is queued/in-flight, silent once synced) and fade while pending. A
// queued upload keeps a progress affordance in its trailing slot — a spinner
// while the flush is genuinely in flight (online), a static "waiting" when
// offline, since nothing is uploading until the network returns.
function DocumentRow({
  doc: d,
  isPending,
  notes,
  onOpen,
  onManage,
}: {
  doc: DocumentSummary;
  isPending: boolean;
  /** How many notes this document carries (ADR-0152 §6): a mark on the row, never a body. */
  notes: number;
  onOpen: () => void;
  onManage: () => void;
}) {
  const offline = useIsOffline();
  const unsynced = useUnsynced(d.id);
  return (
    <ListRow
      icon={DOCUMENT_TYPE_ICON[d.type]}
      onOpen={onOpen}
      openLabel={d.title}
      disabled={isPending}
      title={d.title}
      // The document row is the one host with no meta line of its own, so the mark brings
      // one — and costs no height, because the row's height is set by its 36px badge and a
      // title + an 11.5px meta line still measure under it (pinned in e2e, since jsdom
      // reports every rect as zero).
      meta={notes > 0 ? <NoteMark count={notes} /> : undefined}
      unsynced={unsynced}
      right={
        isPending ? (
          <span className="doc-uploading">
            {offline ? (
              t.docs.upload.queued
            ) : (
              <>
                <Spinner /> {t.docs.upload.saving}
              </>
            )}
          </span>
        ) : (
          <>
            <span className="size" dir="auto">
              {formatBytes(d.sizeBytes)}
            </span>
            <span className="doc-lock" aria-hidden="true">
              <Icon name="lock" />
            </span>
          </>
        )
      }
      sync={<EntitySyncBadge id={d.id} />}
      onManage={isPending ? undefined : onManage}
      manageLabel={t.docs.manage.actions}
    />
  );
}
