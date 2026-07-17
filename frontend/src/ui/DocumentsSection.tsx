// Documents section on the Index (ADR-0047/0049/0052/0056): grouped by type, upload +
// view + per-row manage ("⋯"). Fetches its own list (documents aren't in the trip
// snapshot). Own writes are applied optimistically; a peer's shows on the next load.
// Queued uploads (ADR-0056) render as pending "uploading" rows straight from the
// outbox, so they survive a reopen and reconcile to the real row once flushed.
import { useEffect, useRef, useState } from 'react';
import { type DocumentSummary, type TripDocument } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { listDocuments } from '../lib/api';
import { usePendingUploads } from '../lib/outbox';
import { groupDocuments, formatSize } from '../lib/documents';
import { DocumentUploadSheet } from './DocumentUploadSheet';
import { DocumentViewer } from './DocumentViewer';
import { DocumentManageSheet } from './DocumentManageSheet';
import { Spinner } from './Spinner';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

export function DocumentsSection() {
  const { trip } = useTrip();
  const [serverDocs, setServerDocs] = useState<DocumentSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<DocumentSummary | null>(null);
  const [managing, setManaging] = useState<DocumentSummary | null>(null);
  const pending = usePendingUploads(trip.id);

  useEffect(() => {
    let cancelled = false;
    setServerDocs(null);
    setFailed(false);
    listDocuments(trip.id).then(
      (list) => {
        if (!cancelled) setServerDocs(list);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [trip.id]);

  // When a queued upload leaves the outbox (flushed to a real row, or 4xx-dropped),
  // refetch so the now-real document replaces its optimistic row — and a dropped
  // one simply disappears (ADR-0056).
  const prevPendingIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(pending.map((p) => p.id));
    const completed = [...prevPendingIds.current].some((id) => !now.has(id));
    prevPendingIds.current = now;
    if (completed) {
      listDocuments(trip.id).then(
        (list) => setServerDocs(list),
        () => {},
      );
    }
  }, [pending, trip.id]);

  const applyUpdate = (doc: TripDocument) =>
    setServerDocs((prev) => (prev ?? []).map((d) => (d.id === doc.id ? doc : d)));
  const applyDelete = (id: string) =>
    setServerDocs((prev) => (prev ?? []).filter((d) => d.id !== id));

  // Merge the fetched list with queued uploads not yet reflected server-side; a
  // Set of pending ids drives the per-row "uploading" affordance.
  const serverIds = new Set((serverDocs ?? []).map((d) => d.id));
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
  const allDocs = [...(serverDocs ?? []), ...pendingRows];

  const groups = serverDocs !== null || pendingRows.length > 0 ? groupDocuments(allDocs) : [];
  const isEmpty = serverDocs !== null && allDocs.length === 0;

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

      {serverDocs === null && !failed && pendingRows.length === 0 && (
        <div className="doc-status">
          <Spinner className="ink" /> {t.docs.loading}
        </div>
      )}
      {failed && pendingRows.length === 0 && <div className="doc-status">{t.docs.offline}</div>}

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
        <DocumentManageSheet
          tripId={trip.id}
          doc={managing}
          onClose={() => setManaging(null)}
          onUpdated={applyUpdate}
          onDeleted={applyDelete}
        />
      )}
    </>
  );
}
