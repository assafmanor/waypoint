// **The app's one full-screen media viewer** (ADR-0015/0034/0052; generalized by ADR-0167 §10.2).
//
// It began as the document viewer and is now source-agnostic, because ADR-0167 §10.2 chose it
// over building a hero into the place card: "the full picture is the app's existing zoomable
// image preview … and adds no surface". What it brings, and what a second viewer would have had
// to re-earn: the portal, the ONE close that back / Escape / the gesture / the backdrop all run
// through (ADR-0103 §2), the focus trap, the grow-out-of-the-tapped-row arrival, and ADR-0062's
// **sole** zoom exception — pinch + pan + double-tap reset, hand-rolled, no dependency.
//
// Two sources, and they differ only in how the bytes are reached:
//
//   - a **document**, whose `/content` route is auth-guarded, so the blob comes through
//     `apiFetch` and is shown as an object URL (revoked on close);
//   - an **enrichment photo**, whose URL is public and immutable (ADR-0166 §7), so there is
//     nothing to fetch, nothing to revoke and no version to key on.
//
// Mobile-first (ADR-0017): only an image the browser can actually decode is shown inline; a PDF,
// an undecodable image (an iPhone HEIC), or anything else hands off to "open in a new tab" /
// "download" — never a blank embed.
//
// The `doc-viewer-*` class names are deliberately unchanged: they are the VIEWER's CSS
// (screens.css), the surface both sources borrow, and renaming them would be a large diff
// through a shipped stylesheet for no reader's benefit.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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

/** The picture's own dimensions — whatever the frame is sized from. */
interface IntrinsicSize {
  width: number;
  height: number;
}

/** The frame's ratio as a CSS `<ratio>`, i.e. `840 / 600` and never a computed float: the two
 *  numbers are integers at both sources, so dividing them here would only lose precision and
 *  make the declaration unreadable in DevTools. Absent size means no property, and the CSS
 *  falls back to its own placeholder (screens.css). */
function aspectStyle(size: IntrinsicSize | null): CSSProperties | undefined {
  if (!size || size.width <= 0 || size.height <= 0) return undefined;
  return { '--dv-aspect': `${size.width} / ${size.height}` } as CSSProperties;
}

function naturalSize(img: HTMLImageElement): IntrinsicSize | null {
  return img.naturalWidth > 0 && img.naturalHeight > 0
    ? { width: img.naturalWidth, height: img.naturalHeight }
    : null;
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

/** **Where the bytes come from**, which is the only thing the two callers disagree about.
 *
 *  `blob` is auth-guarded content addressed by id and versioned by `updatedAt` (ADR-0055's
 *  client blob cache); `url` is already-public, already-immutable bytes, so it needs no fetch,
 *  no object URL and no cache key — the URL itself is the version (ADR-0166 §7). */
export type ViewerSource =
  { kind: 'blob'; tripId: string; docId: string; updatedAt: string } | { kind: 'url'; url: string };

export function MediaViewer({
  title,
  mimeType,
  source,
  caption,
  onClose,
  originY,
  intrinsic,
}: {
  /** Names the dialog, labels the image, and is the download filename. */
  title: string;
  /** What to expect before any bytes exist — it decides inline-image vs hand-off, and lets
   *  the frame be reserved while the spinner is still running. */
  mimeType: string;
  source: ViewerSource;
  /** Optional line under the title. **A licensing slot, not a decoration**: a CC BY-SA
   *  photograph shown full screen is its most prominent display, and the credit is otherwise
   *  one step behind on the card you came from (ADR-0167 §4). A document passes nothing. */
  caption?: ReactNode;
  onClose: () => void;
  /** The tapped row's centre, as an offset from the viewport's (`overlayOriginOffset`),
   *  so the card grows out of what you pressed. Absent for a note deep link (`?doc=`),
   *  which has no row — the card is then summoned at centre, which is correct rather
   *  than a fallback. */
  originY?: number | null;
  /** The picture's dimensions **when the caller already knows them** — a delivered place photo
   *  carries the bucket's real `width`/`height` (ADR-0166 §11.4), so the frame is reserved at
   *  this picture's own ratio before a byte arrives. A document knows nothing until its bytes
   *  decode, so it passes nothing and the frame settles on load. */
  intrinsic?: IntrinsicSize | null;
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
  // **The frame is the picture's box, so it needs the picture's size** (screens.css has the
  // rest). A caller that already knows wins outright — it knows before the bytes — and a
  // document, which cannot know, tells us on load.
  const [loadedSize, setLoadedSize] = useState<IntrinsicSize | null>(null);
  const { imgRef, reset, handlers } = useImageZoom();

  // Pulled out of `source` as primitives so the effect's deps are values rather than an object
  // rebuilt on every render — the same reason `Map.tsx` memoizes what it hands `MapPane`.
  const blobTripId = source.kind === 'blob' ? source.tripId : null;
  const blobDocId = source.kind === 'blob' ? source.docId : null;
  const blobVersion = source.kind === 'blob' ? source.updatedAt : null;
  const directUrl = source.kind === 'url' ? source.url : null;

  useEffect(() => {
    // **A public immutable URL is already the answer.** No fetch, no object URL, and nothing to
    // revoke — so this path cannot leak and cannot serve a stale version (ADR-0166 §7: a
    // replaced image is a NEW url, and the old one simply 404s into the hand-off below).
    if (directUrl) {
      setUrl(directUrl);
      return;
    }
    if (!blobTripId || !blobDocId || !blobVersion) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    // `updatedAt` versions the client blob cache (ADR-0055): a replaced file bumps it,
    // so a stale cached blob is never served for the same docId.
    fetchDocumentContent(blobTripId, blobDocId, blobVersion).then(
      async (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        // Decode BEFORE handing the URL to the DOM. A multi-megabyte scan decoding on
        // the main thread while the card is mid-transform drops frames, and no easing
        // fixes that. It also replaces the round-trip through a rendered-then-broken
        // `<img>`: a HEIC that cannot decode goes straight to the hand-off (ADR-0052
        // §1) instead of painting an empty box first.
        if (mimeType.startsWith('image/')) {
          const probe = new Image();
          probe.src = objectUrl;
          try {
            await probe.decode();
            // The decode is also where a DOCUMENT's dimensions first exist — a scan carries
            // none in the snapshot — so the frame is right before the `<img>` mounts rather
            // than settling after it paints.
            if (!cancelled) setLoadedSize(naturalSize(probe));
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
  }, [blobTripId, blobDocId, blobVersion, directUrl, mimeType]);

  // A newly loaded image starts at fit-to-frame, never carrying the prior zoom.
  useEffect(() => reset(), [url, reset]);

  const showInlineImage = mimeType.startsWith('image/') && !imageBroken;
  // Open-in-new-tab runs the blob: URL in the app origin, so only offer it for
  // types the browser renders without executing script — PDF (B-03). Everything
  // else is download-only.
  const canOpenInTab = isInlineOpenableDocumentMimeType(mimeType);

  return createPortal(
    <div className={closing ? 'doc-viewer is-closing' : 'doc-viewer'} onClick={beginClose}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="doc-viewer-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={originStyle(originY)}
      >
        <div className="doc-viewer-head">
          <span className="doc-viewer-title">{title}</span>
          <button
            className="doc-viewer-close"
            onClick={beginClose}
            aria-label={t.docs.viewer.close}
          >
            <Icon name="close" />
          </button>
        </div>
        {caption && <div className="doc-viewer-caption">{caption}</div>}
        {/* `data-expect` is the mime type, read before any bytes exist — which is what
            lets the frame be reserved while the spinner is still running (screens.css).
            `is-opening` runs the mount layer once the page itself has landed. */}
        <div
          className={url ? 'doc-viewer-body is-opening' : 'doc-viewer-body'}
          data-expect={showInlineImage ? 'image' : undefined}
          style={showInlineImage ? aspectStyle(intrinsic ?? loadedSize) : undefined}
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
              alt={title}
              onLoad={(e) => setLoadedSize(naturalSize(e.currentTarget))}
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
                <a className="dv-download" href={url} download={title}>
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

/**
 * **The document entry point** — the shape every existing caller already passes.
 *
 * A named adapter rather than a second component: the same idiom `mapsPredictionUrl` uses over
 * the private search builder. It keeps `DocumentsSection` and the `?doc=` deep link byte-identical
 * while the viewer beneath it stopped being document-shaped, which is what ADR-0096 asks of a
 * generalization — extend the one mechanism, do not grow a parallel copy beside it.
 */
export function DocumentViewer({
  tripId,
  doc,
  onClose,
  originY,
}: {
  tripId: string;
  doc: DocumentSummary;
  onClose: () => void;
  originY?: number | null;
}) {
  return (
    <MediaViewer
      title={doc.title}
      mimeType={doc.mimeType}
      source={{ kind: 'blob', tripId, docId: doc.id, updatedAt: doc.updatedAt }}
      onClose={onClose}
      originY={originY}
    />
  );
}
