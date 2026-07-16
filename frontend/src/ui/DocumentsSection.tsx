// Documents section on the Index (ADR-0047/0049): grouped by type, upload + view.
// Fetches its own list (documents aren't in the trip snapshot). Own upload is
// optimistically appended; a peer's shows on the next Index load.
import { useEffect, useState } from 'react';
import { type DocumentSummary } from '@waypoint/shared';
import { useTrip } from '../state/trip-state';
import { listDocuments } from '../lib/api';
import { groupDocuments, formatSize } from '../lib/documents';
import { DocumentUploadSheet } from './DocumentUploadSheet';
import { DocumentViewer } from './DocumentViewer';
import { DOCUMENT_TYPE_ICON, ICONS } from '../constants';
import { t } from '../i18n/he';

export function DocumentsSection() {
  const { trip } = useTrip();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<DocumentSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDocs(null);
    setFailed(false);
    listDocuments(trip.id).then(
      (list) => {
        if (!cancelled) setDocs(list);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [trip.id]);

  const groups = docs ? groupDocuments(docs) : [];
  const isEmpty = docs !== null && docs.length === 0;

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

      {docs === null && !failed && <div className="doc-status">{t.docs.loading}</div>}
      {failed && <div className="doc-status">{t.docs.offline}</div>}

      {isEmpty && (
        <div className="empty-card doc">
          <div className="ei">🛂</div>
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
              <button type="button" className="li doc" key={d.id} onClick={() => setViewing(d)}>
                <div className="badge2">{DOCUMENT_TYPE_ICON[d.type]}</div>
                <div className="main">
                  <div className="t">{d.title}</div>
                  <div className="m" dir="ltr">
                    {formatSize(d.sizeBytes)}
                  </div>
                </div>
                <div className="right">
                  <div className="time" aria-hidden="true">
                    🔒
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {uploading && (
        <DocumentUploadSheet
          tripId={trip.id}
          onClose={() => setUploading(false)}
          onUploaded={(doc) => setDocs((prev) => [...(prev ?? []), doc])}
        />
      )}
      {viewing && (
        <DocumentViewer tripId={trip.id} doc={viewing} onClose={() => setViewing(null)} />
      )}
    </>
  );
}
