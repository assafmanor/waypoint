// Document viewer (ADR-0015/0034). The /content route is auth-guarded, so the
// blob is fetched via apiFetch and shown as an object URL (revoked on close) —
// image inline, PDF in an iframe, anything else as a download link.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type DocumentSummary } from '@waypoint/shared';
import { fetchDocumentContent } from '../lib/api';
import { useOverlay } from '../state/nav-state';
import { t } from '../i18n/he';

export function DocumentViewer({
  tripId,
  doc,
  onClose,
}: {
  tripId: string;
  doc: DocumentSummary;
  onClose: () => void;
}) {
  useOverlay(onClose);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchDocumentContent(tripId, doc.id).then(
      (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tripId, doc.id]);

  const isImage = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';

  return createPortal(
    <div className="doc-viewer" onClick={onClose}>
      <div
        className="doc-viewer-card"
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="doc-viewer-head">
          <span className="doc-viewer-title">{doc.title}</span>
          <button className="doc-viewer-close" onClick={onClose} aria-label={t.docs.viewer.close}>
            ✕
          </button>
        </div>
        <div className="doc-viewer-body">
          {failed ? (
            <p className="doc-viewer-msg">{t.docs.viewer.error}</p>
          ) : !url ? (
            <p className="doc-viewer-msg">{t.docs.viewer.loading}</p>
          ) : isImage ? (
            <img className="doc-viewer-img" src={url} alt={doc.title} />
          ) : isPdf ? (
            <iframe className="doc-viewer-frame" src={url} title={doc.title} />
          ) : (
            <a className="doc-viewer-download" href={url} download={doc.title}>
              {t.docs.viewer.download}
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
