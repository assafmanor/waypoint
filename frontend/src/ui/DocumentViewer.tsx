// Document viewer (ADR-0015/0034/0052). The /content route is auth-guarded, so the
// blob is fetched via apiFetch and shown as an object URL (revoked on close).
// Mobile-first (ADR-0017): only an image the browser can actually decode is shown
// inline; a PDF, an undecodable image (e.g. iPhone HEIC), or anything else hands
// off to "open in a new tab" / "download" — never a blank embed.
// ADR-0062: zoom is disabled app-wide, and this image is the sole exception —
// pinch + pan + double-tap reset are hand-rolled here (no zoom dependency).
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { isInlineOpenableDocumentMimeType, type DocumentSummary } from '@waypoint/shared';
import { fetchDocumentContent } from '../lib/api';
import { useOverlay } from '../state/nav-state';
import { useDialogFocus } from '../lib/useDialogFocus';
import { useExitTransition } from '../lib/useExitTransition';
import { Spinner } from './Spinner';
import { t } from '../i18n/he';
import { Icon } from './Icon';

/* How far the mount travels from the tapped row, as a SHARE of that row's offset, and
   the cap on it. A share rather than the whole distance because the card is not flying
   from the row, it is growing out of it — matching the full offset reads as a slide
   across the screen. Local consts like the zoom ones below: single call site, and the
   meaning does not leave this file. */
const ORIGIN_TRAVEL_RATIO = 0.22;
const MAX_ORIGIN_TRAVEL_PX = 40;

/** The two custom properties the arrival needs, from the one measured number.
 *  Absent origin means no properties, so the CSS falls back to a centred origin and no
 *  travel — a note deep link has no row to grow from. */
function originStyle(originY?: number | null): CSSProperties | undefined {
  if (originY == null) return undefined;
  const travel = Math.round(
    Math.max(-MAX_ORIGIN_TRAVEL_PX, Math.min(MAX_ORIGIN_TRAVEL_PX, originY * ORIGIN_TRAVEL_RATIO)),
  );
  return {
    '--dv-origin-dy': `${originY}px`,
    '--dv-origin-travel': `${travel}px`,
  } as CSSProperties;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_ZOOM = 2.5;

export interface ZoomTransform {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: ZoomTransform = { scale: MIN_ZOOM, tx: 0, ty: 0 };

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

interface Point {
  x: number;
  y: number;
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const pickTranslate = (t2: ZoomTransform) => ({ tx: t2.tx, ty: t2.ty });

export interface PinchStart {
  dist: number;
  mid: Point;
  transform: ZoomTransform;
  // The image box's untransformed top-left in client px (transform-origin is 0 0).
  origin: Point;
}

// Scale by the finger-distance ratio while keeping the content point under the
// two-finger midpoint fixed — the midpoint moving also pans, so pinch and pan
// are the same computation.
export function pinchTransform(start: PinchStart, curMid: Point, curDist: number): ZoomTransform {
  const scale = clampZoom(start.transform.scale * (curDist / start.dist));
  const focalX = (start.mid.x - start.origin.x - start.transform.tx) / start.transform.scale;
  const focalY = (start.mid.y - start.origin.y - start.transform.ty) / start.transform.scale;
  return {
    scale,
    tx: curMid.x - start.origin.x - scale * focalX,
    ty: curMid.y - start.origin.y - scale * focalY,
  };
}

// Zoom to a fixed scale centred on a tapped point (double-tap-to-zoom).
export function zoomAtPoint(
  point: Point,
  origin: Point,
  from: ZoomTransform,
  scale: number,
): ZoomTransform {
  const focalX = (point.x - origin.x - from.tx) / from.scale;
  const focalY = (point.y - origin.y - from.ty) / from.scale;
  return {
    scale,
    tx: point.x - origin.x - scale * focalX,
    ty: point.y - origin.y - scale * focalY,
  };
}

// Imperative pinch/pan/double-tap on the image. State lives in refs and is written
// straight to element.style so a drag never re-renders React.
function useImageZoom() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const transform = useRef<ZoomTransform>({ ...IDENTITY });
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<PinchStart | null>(null);
  const pan = useRef<{ from: Point; tx: number; ty: number } | null>(null);
  const lastTap = useRef(0);

  const apply = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const { scale, tx, ty } = transform.current;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.style.cursor = scale > MIN_ZOOM ? 'grab' : 'zoom-in';
  }, []);

  const reset = useCallback(() => {
    transform.current = { ...IDENTITY };
    apply();
  }, [apply]);

  // The image box's untransformed top-left: the transformed rect left is
  // origin + tx (scale is about the top-left corner), so origin = rect.left - tx.
  const originOf = useCallback((): Point => {
    const rect = imgRef.current!.getBoundingClientRect();
    return { x: rect.left - transform.current.tx, y: rect.top - transform.current.ty };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLImageElement>) => {
      const img = imgRef.current;
      if (!img) return;
      img.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];

      if (pts.length === 2) {
        pinch.current = {
          dist: distance(pts[0], pts[1]),
          mid: midpoint(pts[0], pts[1]),
          transform: { ...transform.current },
          origin: originOf(),
        };
        pan.current = null;
        return;
      }

      pan.current = { from: { x: e.clientX, y: e.clientY }, ...pickTranslate(transform.current) };

      // performance.now(): a monotonic input clock, deliberately not the ADR-0026
      // trip clock — double-tap timing must ignore dev time-travel.
      const now = performance.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        const point = { x: e.clientX, y: e.clientY };
        transform.current =
          transform.current.scale > MIN_ZOOM
            ? { ...IDENTITY }
            : zoomAtPoint(point, originOf(), transform.current, DOUBLE_TAP_ZOOM);
        apply();
      } else {
        lastTap.current = now;
      }
    },
    [apply, originOf],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLImageElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];

      if (pts.length >= 2 && pinch.current) {
        transform.current = pinchTransform(
          pinch.current,
          midpoint(pts[0], pts[1]),
          distance(pts[0], pts[1]),
        );
        apply();
      } else if (pts.length === 1 && pan.current && transform.current.scale > MIN_ZOOM) {
        const { from, tx, ty } = pan.current;
        transform.current = {
          ...transform.current,
          tx: tx + (e.clientX - from.x),
          ty: ty + (e.clientY - from.y),
        };
        apply();
      }
    },
    [apply],
  );

  const onPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLImageElement>) => {
      pointers.current.delete(e.pointerId);
      const remaining = [...pointers.current.entries()];
      if (remaining.length < 2) pinch.current = null;
      if (remaining.length === 1) {
        // Rebase the pan so lifting one finger of a pinch doesn't jump the image.
        const [, pt] = remaining[0];
        pan.current = { from: pt, ...pickTranslate(transform.current) };
      }
      if (remaining.length === 0) {
        pan.current = null;
        // A pinch-out that bottomed out at MIN_ZOOM snaps back to a centred fit.
        if (transform.current.scale <= MIN_ZOOM) reset();
      }
    },
    [reset],
  );

  return {
    imgRef,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}

export function DocumentViewer({
  tripId,
  doc,
  onClose,
  originY,
}: {
  tripId: string;
  doc: DocumentSummary;
  onClose: () => void;
  /** The tapped row's centre, as an offset from the viewport's (`overlayOriginOffset`),
   *  so the card grows out of what you pressed. Absent for a note deep link (`?doc=`),
   *  which has no row — the card is then summoned at centre, which is correct rather
   *  than a fallback. */
  originY?: number | null;
}) {
  // The exit runs `--t-base`, and its LAST channel is the scrim, delayed by one
  // `--stagger-step` so the card clears against a still-dimmed room — hence both
  // tokens, or the tail is cut and the background snaps back (ADR-0140's amendment).
  const { closing, beginClose } = useExitTransition(onClose, '--t-base', '--stagger-step');
  // Every way out runs the ONE close (ADR-0103 §2): this registration covers back,
  // the Android gesture and Escape; the backdrop and the ✕ below take the same handler.
  useOverlay(beginClose);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef, { trap: true });
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // An image whose bytes the browser can't decode (HEIC, a corrupt scan) falls
  // back to the hand-off actions instead of a blank <img> (ADR-0052 §1).
  const [imageBroken, setImageBroken] = useState(false);
  const { imgRef, reset, handlers } = useImageZoom();

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    // `doc.updatedAt` versions the client blob cache (ADR-0055): a replaced file bumps it,
    // so a stale cached blob is never served for the same docId.
    fetchDocumentContent(tripId, doc.id, doc.updatedAt).then(
      async (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        // Decode BEFORE handing the URL to the DOM. A multi-megabyte scan decoding on
        // the main thread while the card is mid-transform drops frames, and no easing
        // fixes that. It also replaces the round-trip through a rendered-then-broken
        // `<img>`: a HEIC that cannot decode goes straight to the hand-off (ADR-0052
        // §1) instead of painting an empty box first.
        if (doc.mimeType.startsWith('image/')) {
          const probe = new Image();
          probe.src = objectUrl;
          try {
            await probe.decode();
          } catch {
            if (!cancelled) setImageBroken(true);
          }
        }
        if (!cancelled) setUrl(objectUrl);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tripId, doc.id, doc.updatedAt, doc.mimeType]);

  // A newly loaded image starts at fit-to-frame, never carrying the prior zoom.
  useEffect(() => reset(), [url, reset]);

  const showInlineImage = doc.mimeType.startsWith('image/') && !imageBroken;
  // Open-in-new-tab runs the blob: URL in the app origin, so only offer it for
  // types the browser renders without executing script — PDF (B-03). Everything
  // else is download-only.
  const canOpenInTab = isInlineOpenableDocumentMimeType(doc.mimeType);

  return createPortal(
    <div className={closing ? 'doc-viewer is-closing' : 'doc-viewer'} onClick={beginClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="doc-viewer-card"
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        onClick={(e) => e.stopPropagation()}
        style={originStyle(originY)}
      >
        <div className="doc-viewer-head">
          <span className="doc-viewer-title">{doc.title}</span>
          <button
            className="doc-viewer-close"
            onClick={beginClose}
            aria-label={t.docs.viewer.close}
          >
            <Icon name="close" />
          </button>
        </div>
        {/* `data-expect` is the mime type, read before any bytes exist — which is what
            lets the frame be reserved while the spinner is still running (screens.css).
            `is-opening` runs the mount layer once the page itself has landed. */}
        <div
          className={url ? 'doc-viewer-body is-opening' : 'doc-viewer-body'}
          data-expect={showInlineImage ? 'image' : undefined}
        >
          {failed ? (
            <p className="doc-viewer-msg">{t.docs.viewer.error}</p>
          ) : !url ? (
            <div className="doc-viewer-loading">
              <Spinner className="ink" />
              <span>{t.docs.viewer.loading}</span>
            </div>
          ) : showInlineImage ? (
            <img
              ref={imgRef}
              className="doc-viewer-img is-fresh"
              src={url}
              alt={doc.title}
              onError={() => setImageBroken(true)}
              {...handlers}
            />
          ) : (
            <div className="doc-viewer-handoff is-fresh">
              <div className="doc-viewer-handoff-ic" aria-hidden="true">
                <Icon name="documents" />
              </div>
              <p className="doc-viewer-msg">{t.docs.viewer.handoff}</p>
              <div className="doc-viewer-actions">
                {canOpenInTab && (
                  <a className="dv-open" href={url} target="_blank" rel="noopener noreferrer">
                    {t.docs.viewer.open}
                  </a>
                )}
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
