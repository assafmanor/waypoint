// One file-pick control (ADR-0086): two equal-weight tiles — upload & camera
// capture — when empty, and a preview card (thumbnail / file tile + name + size +
// clear) once a file is chosen. Controlled: the parent owns the File and any
// validation/error; this component only picks, previews, and clears — so it
// serves any attachment surface, not just documents. Phone-first: capture is a
// peer of upload (ADR-0017), feature-detected off where there's no camera, and
// the real <input>s are off-screen so the OS accept filter is unchanged.
//
// **The card's body opens the file full-screen** (ADR-0086's 2026-08-08 amendment; owner:
// a thumbnail is not enough to check what you are about to save). That full view is
// `MediaViewer` — the app's ONE viewer — reached with a `file` source, so the pre-save look
// inherits the same close, zoom and hand-off grammar a saved document already has, and this
// primitive gains no viewer of its own (rule 8). The thumbnail's own object URL stays this
// component's; the viewer creates and revokes its own, so neither can free the other's.
import { useEffect, useState, type ReactNode } from 'react';
import { formatBytes } from '../../lib/bytes';
import { overlayOriginOffset } from '../../lib/motion';
import { t } from '../../i18n/he';
import { usePickFile, type CaptureFacing } from './usePickFile';
import './file-picker.css';
import { MediaViewer } from '../MediaViewer';
import { Icon } from '../Icon';

/** File extension shown on the non-image tile, e.g. "PDF". Falls back to a
 *  generic glyph when there's no usable extension. */
function extLabel(name: string): string {
  const ext = name.match(/\.([^./\\]+)$/)?.[1];
  return ext ? ext.slice(0, 4).toUpperCase() : '📄';
}

export function FilePicker({
  value,
  onPick,
  onClear,
  accept,
  capture = false,
  hint,
  disabled = false,
}: {
  value: File | null;
  /** Called with the chosen file; the parent validates and decides `value`. */
  onPick: (file: File) => void;
  onClear: () => void;
  /** OS accept filter for the file input, e.g. "image/*,application/pdf". */
  accept: string;
  /** Which camera to offer beside upload, or `false` for none (shown only if a
   *  camera exists). A document is photographed with the rear camera. */
  capture?: CaptureFacing | false;
  /** Contract line under the tiles, e.g. accepted types + size cap. */
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  /** The full view, and the card's measured centre so it grows out of what was pressed —
   *  the same pair `DocumentsSection` keeps for a saved document's row. */
  const [viewing, setViewing] = useState(false);
  const [viewFrom, setViewFrom] = useState<number | null>(null);
  const { openUpload, openCamera, inputs } = usePickFile({ accept, capture, onPick, disabled });

  // Object-URL lifecycle for an image thumbnail: created for the current image
  // file and revoked when it changes or the picker unmounts (no leak).
  useEffect(() => {
    setDecodeFailed(false);
    // A cleared or swapped file closes the full view with it: the viewer is showing the
    // previous pick, and leaving it open would answer the next one with the old bytes.
    setViewing(false);
    if (!value || !value.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  if (!value) {
    return (
      <>
        <div className={'file-picker-tiles' + (openCamera ? '' : ' solo')}>
          <button type="button" className="file-tile" onClick={openUpload} disabled={disabled}>
            <span className="file-tile-ic" aria-hidden="true">
              <Icon name="upload" />
            </span>
            <span className="file-tile-lbl">{t.filePicker.upload}</span>
          </button>
          {openCamera && (
            <button type="button" className="file-tile" onClick={openCamera} disabled={disabled}>
              <span className="file-tile-ic" aria-hidden="true">
                <Icon name="camera" />
              </span>
              <span className="file-tile-lbl">{t.filePicker.capture}</span>
            </button>
          )}
        </div>
        {hint != null && <p className="file-picker-hint">{hint}</p>}
        {inputs}
      </>
    );
  }

  const showThumb = previewUrl != null && !decodeFailed;
  return (
    <div className="file-preview">
      {/* The tappable open-body beside a trailing control — `ListRow`'s grammar, and the
          same one a saved document's row already uses to reach this viewer. Not `ListRow`
          itself: that lives in `ui/domain` (a primitive must not depend on it), its trailing
          control is a kebab where this is a clear, and its badge is a place badge where this
          is a decoded thumbnail. */}
      <button
        type="button"
        className="file-preview-open"
        onClick={(e) => {
          setViewFrom(overlayOriginOffset(e.currentTarget));
          setViewing(true);
        }}
        disabled={disabled}
        aria-label={t.filePicker.view(value.name)}
      >
        <span className={'file-preview-thumb' + (showThumb ? ' img' : '')} aria-hidden="true">
          {showThumb ? (
            <img src={previewUrl} alt="" onError={() => setDecodeFailed(true)} />
          ) : (
            <span className="file-preview-ext">{extLabel(value.name)}</span>
          )}
          {/* The one thing a card that now OPENS owes a phone: there is no hover to
              discover it with (ADR-0017), so the corner brackets say the thumbnail is
              not the whole picture. */}
          <span className="file-preview-zoom" aria-hidden="true">
            <Icon name="frame" />
          </span>
        </span>
        <span className="file-preview-main">
          <span className="file-preview-name" dir="auto">
            {value.name}
          </span>
          <span className="file-preview-sub">{formatBytes(value.size)}</span>
        </span>
      </button>
      <button
        type="button"
        className="file-preview-clear"
        onClick={onClear}
        disabled={disabled}
        aria-label={t.filePicker.remove}
      >
        <Icon name="close" />
      </button>
      {viewing && (
        // The file has no title yet — it is not a document until Save — so the viewer is
        // named by the filename, which is also what its download action writes.
        <MediaViewer
          title={value.name}
          mimeType={value.type}
          source={{ kind: 'file', file: value }}
          originY={viewFrom}
          onClose={() => setViewing(false)}
        />
      )}
    </div>
  );
}
