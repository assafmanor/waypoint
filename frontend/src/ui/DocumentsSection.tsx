// Documents section on the Index (ADR-0047/0049/0052/0056/0058): grouped by type,
// upload + view + per-row manage ("⋯"). Documents ride the trip snapshot and are a
// live reactive list (ADR-0058) — a peer's upload/rename/delete and our own writes
// (via the WS self-echo) reflect live, and the list reads offline like every other
// snapshot entity. Queued uploads (ADR-0056) render as pending "uploading" rows
// straight from the outbox, so they survive a reopen and reconcile to the real row
// once flushed.
import { useState } from 'react';
import { type DocumentSummary } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { usePendingUploads } from '../lib/outbox';
import { groupDocuments, formatSize } from '../lib/documents';
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
      <div className="sec-title">
        {t.docs.title}
        <span className="badge-offline">🔒 {t.docs.encrypted}</span>
      </div>

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
            {g.docs.map((d) => {
              const isPending = pendingIds.has(d.id);
              return (
                <div className={'li doc' + (isPending ? ' pending' : '')} key={d.id}>
                  <button
                    type="button"
                    className="li-open"
                    onClick={() => setViewing(d)}
                    disabled={isPending}
                    aria-label={d.title}
                  >
                    <div className="badge2">{DOCUMENT_TYPE_ICON[d.type]}</div>
                    <div className="main">
                      <div className="t">{d.title}</div>
                    </div>
                  </button>
                  <div className="right">
                    {isPending ? (
                      <span className="doc-uploading">
                        <Spinner /> {t.docs.upload.saving}
                      </span>
                    ) : (
                      <>
                        <span className="size" dir="ltr">
                          {formatSize(d.sizeBytes)}
                        </span>
                        <span className="time" aria-hidden="true">
                          🔒
                        </span>
                        <button
                          type="button"
                          className="kebab"
                          onClick={() => setManaging(d)}
                          aria-label={t.docs.manage.actions}
                        >
                          ⋯
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
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
