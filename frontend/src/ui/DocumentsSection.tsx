// Documents section on the Index (ADR-0047/0049/0052/0056/0058): grouped by type,
// upload + view + per-row manage ("⋯"). Documents ride the trip snapshot and are a
// live reactive list (ADR-0058) — a peer's upload/rename/delete and our own writes
// (via the WS self-echo) reflect live, and the list reads offline like every other
// snapshot entity. Queued uploads (ADR-0056) render as pending "uploading" rows
// straight from the outbox, so they survive a reopen and reconcile to the real row
// once flushed. The title/encrypted-badge header lives in IndexDocumentsView's
// merged `idx-head` row now (ADR-0100 Consequences), not here — this component
// is content only.
import { useState } from 'react';
import { type DocumentSummary } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { usePendingUploads, useIsOffline } from '../lib/outbox';
import { EntitySyncBadge, useUnsynced } from './EntitySyncBadge';
import { ListRow } from './domain';
import { groupDocuments } from '../lib/documents';
import { formatBytes } from '../lib/bytes';
import { DocumentUploadSheet } from './DocumentUploadSheet';
import { DocumentViewer } from './DocumentViewer';
import { DocumentManageSheet } from './DocumentManageSheet';
import { Spinner } from './Spinner';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

export function DocumentsSection() {
  const { trip, documents } = useTrip();
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
          {t.docs.add}
        </button>
      )}

      {isEmpty && (
        <div className="empty-card doc">
          <div className="ei">{DOCUMENT_TYPE_ICON.passport}</div>
          <div className="et">{t.docs.emptyTitle}</div>
          <div className="es">{t.docs.emptyBody}</div>
          <button type="button" className="ea" onClick={() => setUploading(true)}>
            <span className="plus">{ICONS.add}</span> {t.docs.emptyAdd}
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
  onOpen,
  onManage,
}: {
  doc: DocumentSummary;
  isPending: boolean;
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
            <span className="size" dir="ltr">
              {formatBytes(d.sizeBytes)}
            </span>
            <span className="doc-lock" aria-hidden="true">
              🔒
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
