// One file-pick control (ADR-0086): two equal-weight tiles — upload & camera
// capture — when empty, and a preview card (thumbnail / file tile + name + size +
// clear) once a file is chosen. Controlled: the parent owns the File and any
// validation/error; this component only picks, previews, and clears — so it
// serves any attachment surface, not just documents. Phone-first: capture is a
// peer of upload (ADR-0017), feature-detected off where there's no camera, and
// the real <input>s are off-screen so the OS accept filter is unchanged.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatBytes } from '../../lib/bytes';
import { t } from '../../i18n/he';
import './file-picker.css';

/** File extension shown on the non-image tile, e.g. "PDF". Falls back to a
 *  generic glyph when there's no usable extension. */
function extLabel(name: string): string {
  const ext = name.match(/\.([^./\\]+)$/)?.[1];
  return ext ? ext.slice(0, 4).toUpperCase() : '📄';
}

/** Whether to offer the capture tile: on a touch / coarse-pointer device (phone
 *  or tablet — where photographing a document is the natural act), hidden on a
 *  desktop where `capture` would just reopen a file dialog. A synchronous
 *  media-query proxy — no async camera enumeration that can false-negative on a
 *  real phone and silently drop the camera path (ADR-0086 §2). */
function useCameraCapture(enabled: boolean): boolean {
  const coarse = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const [supported, setSupported] = useState(coarse);
  // Re-evaluate on mount so a hydration/first-paint mismatch self-corrects.
  useEffect(() => setSupported(coarse()), []);
  return enabled && supported;
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
  /** Offer a camera-capture tile beside upload (shown only if a camera exists). */
  capture?: boolean;
  /** Contract line under the tiles, e.g. accepted types + size cap. */
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const showCapture = useCameraCapture(capture);

  // Object-URL lifecycle for an image thumbnail: created for the current image
  // file and revoked when it changes or the picker unmounts (no leak).
  useEffect(() => {
    setDecodeFailed(false);
    if (!value || !value.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  // Reset the input value after each pick so choosing the same file again still
  // fires `change` (a re-pick after clearing an identical file).
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPick(file);
  };

  if (!value) {
    return (
      <>
        <div className={'file-picker-tiles' + (showCapture ? '' : ' solo')}>
          <button
            type="button"
            className="file-tile"
            onClick={() => fileInput.current?.click()}
            disabled={disabled}
          >
            <span className="file-tile-ic" aria-hidden="true">
              ⬆️
            </span>
            <span className="file-tile-lbl">{t.filePicker.upload}</span>
          </button>
          {showCapture && (
            <button
              type="button"
              className="file-tile"
              onClick={() => cameraInput.current?.click()}
              disabled={disabled}
            >
              <span className="file-tile-ic" aria-hidden="true">
                📷
              </span>
              <span className="file-tile-lbl">{t.filePicker.capture}</span>
            </button>
          )}
        </div>
        {hint != null && <p className="file-picker-hint">{hint}</p>}
        <input
          ref={fileInput}
          type="file"
          accept={accept}
          className="file-picker-input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleInput}
        />
        {showCapture && (
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="file-picker-input"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleInput}
          />
        )}
      </>
    );
  }

  const showThumb = previewUrl != null && !decodeFailed;
  return (
    <div className="file-preview">
      <span className={'file-preview-thumb' + (showThumb ? ' img' : '')} aria-hidden="true">
        {showThumb ? (
          <img src={previewUrl} alt="" onError={() => setDecodeFailed(true)} />
        ) : (
          <span className="file-preview-ext">{extLabel(value.name)}</span>
        )}
      </span>
      <span className="file-preview-main">
        <span className="file-preview-name" dir="ltr">
          {value.name}
        </span>
        <span className="file-preview-sub">{formatBytes(value.size)}</span>
      </span>
      <button
        type="button"
        className="file-preview-clear"
        onClick={onClear}
        disabled={disabled}
        aria-label={t.filePicker.remove}
      >
        ✕
      </button>
    </div>
  );
}
