// Document viewer (ADR-0015/0034/0052). The /content route is auth-guarded, so the
// blob is fetched via apiFetch and shown as an object URL (revoked on close).
// Mobile-first (ADR-0017): only an image the browser can actually decode is shown
// inline; a PDF, an undecodable image (e.g. iPhone HEIC), or anything else hands
// off to "open in a new tab" / "download" — never a blank embed.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type DocumentSummary } from '@waypoint/shared';
import { fetchDocumentContent } from '../lib/api';
import { useOverlay } from '../state/nav-state';
import { Spinner } from './Spinner';
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
  // An image whose bytes the browser can't decode (HEIC, a corrupt scan) falls
  // back to the hand-off actions instead of a blank <img> (ADR-0052 §1).
  const [imageBroken, setImageBroken] = useState(false);

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

  const showInlineImage = doc.mimeType.startsWith('image/') && !imageBroken;

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
            <div className="doc-viewer-loading">
              <Spinner className="ink" />
              <span>{t.docs.viewer.loading}</span>
            </div>
          ) : showInlineImage ? (
            <img
              className="doc-viewer-img"
              src={url}
              alt={doc.title}
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div className="doc-viewer-handoff">
              <div className="doc-viewer-handoff-ic" aria-hidden="true">
                📄
              </div>
              <p className="doc-viewer-msg">{t.docs.viewer.handoff}</p>
              <div className="doc-viewer-actions">
                <a className="dv-open" href={url} target="_blank" rel="noopener noreferrer">
                  {t.docs.viewer.open}
                </a>
                <a className="dv-download" href={url} download={doc.title}>
                  {t.docs.viewer.download}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
