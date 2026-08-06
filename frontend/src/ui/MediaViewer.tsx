// **The app's one full-screen media viewer** (ADR-0015/0034/0052; generalized by ADR-0167 §10.2).
//
// It began as the document viewer and is now source-agnostic, because ADR-0167 §10.2 chose it
// over building a hero into the place card: "the full picture is the app's existing zoomable
// image preview … and adds no surface". What it brings, and what a second viewer would have had
// to re-earn: the portal, the ONE close that back / Escape / the gesture / the backdrop all run
// through (ADR-0103 §2), the focus trap, the grow-out-of-the-tapped-row arrival, and ADR-0062's
// **sole** zoom exception — a pinch that lifts the picture out of the card and lets go of it
// when you do, hand-rolled, no dependency (ADR-0062's 2026-08-05 amendment).
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
import { motionDurationMs } from '../lib/motion';
import { armClickSwallow } from '../lib/click-swallow';
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

export interface PinchStart {
  dist: number;
  mid: Point;
  /** **The point of the PICTURE the zoom holds still**, which is the two-finger midpoint only
   *  while the fingers are on the picture. Once the gesture belongs to the whole screen they
   *  often are not (2026-08-06), and an anchor outside the box is a point the image does not
   *  contain: keeping it under the fingers sends the picture flying away from them — a pinch
   *  300px below a short photograph would push it off the top of the screen at 2×. Clamped to
   *  the picture's own box, the same pinch grows it from its bottom edge, which is what a
   *  finger just below it means. Equal to `mid` whenever the fingers ARE on the picture, so
   *  that case is untouched. */
  anchor: Point;
  transform: ZoomTransform;
  // The image box's untransformed top-left in client px (transform-origin is 0 0).
  origin: Point;
}

/** The nearest point inside the box — the anchor when the fingers are outside it. */
export function clampToRect(p: Point, rect: LiftRect): Point {
  return {
    x: Math.min(Math.max(p.x, rect.left), rect.left + rect.width),
    y: Math.min(Math.max(p.y, rect.top), rect.top + rect.height),
  };
}

// Scale by the finger-distance ratio while keeping the anchored content point under the
// fingers — the midpoint moving also pans, so pinch and pan are the same computation. The
// fingers carry the anchor with them (`curMid - mid`) rather than being it, which is what
// keeps a clamped anchor from jolting the picture on the first frame: at the start the
// midpoint has not moved, so the transform is exactly identity either way.
export function pinchTransform(start: PinchStart, curMid: Point, curDist: number): ZoomTransform {
  const scale = clampZoom(start.transform.scale * (curDist / start.dist));
  const focalX = (start.anchor.x - start.origin.x - start.transform.tx) / start.transform.scale;
  const focalY = (start.anchor.y - start.origin.y - start.transform.ty) / start.transform.scale;
  return {
    scale,
    tx: curMid.x - start.mid.x + start.anchor.x - start.origin.x - scale * focalX,
    ty: curMid.y - start.mid.y + start.anchor.y - start.origin.y - scale * focalY,
  };
}

/** Where the picture sits on screen at the moment the pinch starts — the box the lifted copy
 *  is born at and the box it goes home to. Viewport coordinates, because the copy is `fixed`. */
export interface LiftRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const rectOf = (el: Element): LiftRect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** **The pinch lifts the picture OUT of the card, and lets go of it when you do**
 *  (owner, 2026-08-05: _"the image zooms out of the box and auto resets to the original size
 *  when lifting the finger"_ — the Instagram gesture).
 *
 *  What replaced what, since ADR-0062 §Shipped-as describes the old model: zoom used to be
 *  **sticky** — pinch to a scale, keep it, pan around inside the frame with one finger,
 *  double-tap to 2.5× or back to fit. All of it happened *inside* `.doc-viewer-body`, whose
 *  `overflow: hidden` is what "confined to the box" meant. Now zoom exists only while fingers
 *  are down, so there is no zoomed state to pan around in, nothing for a double tap to toggle,
 *  and no clipping to fight: the picture leaves the frame entirely.
 *
 *  **The gesture belongs to the whole viewer, not to the picture** (owner, 2026-08-06: _"the
 *  pinch to zoom in/out gesture should be available from the entire screen when the image is
 *  already displaying, so that if the image dimensions are small, you wouldn't have to place
 *  your fingers exactly inside the image borders"_ — Instagram again). The handlers hang off
 *  `.doc-viewer`, which is the full screen, so fingers landing on the scrim, the head or the
 *  card's edge all pinch the picture; a wide photograph in a 240px frame no longer asks you to
 *  aim. What still decides whether there IS a gesture is the picture: no displayed image (a
 *  PDF's hand-off, a failure, bytes still arriving) means no `imgRef`, and nothing starts.
 *
 *  **Three elements, and which is which matters.** The overlay is the TARGET (it takes the
 *  pointer capture, so every move lands on it wherever the fingers travel). The in-flow `<img>`
 *  is the MEASURE — it never moves, and only goes transparent so it is not seen under its own
 *  copy. The lifted copy is a sibling of the card inside the same portal (so no ancestor clips
 *  it, and ADR-0062's global suppressor still sees a target inside `.doc-viewer`), is
 *  `pointer-events: none`, and is the only thing that scales.
 *
 *  React never re-renders during the gesture: the lift is one state change at the pinch, one at
 *  the release, and every frame between them is written straight to `element.style`. */
function useImageZoom() {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const liftRef = useRef<HTMLImageElement | null>(null);
  const transform = useRef<ZoomTransform>({ ...IDENTITY });
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<PinchStart | null>(null);
  /** The lifted copy's birth box — present exactly while the picture is out of its frame. */
  const [lift, setLift] = useState<LiftRect | null>(null);
  /** The copy is on its way home: still mounted, no longer following anything. */
  const [settling, setSettling] = useState(false);

  const apply = useCallback(() => {
    const el = liftRef.current;
    if (!el) return;
    const { scale, tx, ty } = transform.current;
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }, []);

  const reset = useCallback(() => {
    transform.current = { ...IDENTITY };
    pinch.current = null;
    pointers.current.clear();
    setLift(null);
    setSettling(false);
  }, []);

  // **The release, which is the whole feature.** The copy was born at the picture's own box with
  // no transform, so going home is just going back to `none` — the CSS transition does the rest.
  // It stays mounted for the length of that transition and not a frame longer: `motionDurationMs`
  // answers 0 under reduced motion (and in jsdom), so there the picture is simply back.
  const settleTimer = useRef(0);
  const settle = useCallback(() => {
    pinch.current = null;
    transform.current = { ...IDENTITY };
    setSettling(true);
    apply();
    const land = () => {
      setLift(null);
      setSettling(false);
    };
    const ms = motionDurationMs('--t-base');
    if (ms === 0) land();
    else settleTimer.current = window.setTimeout(land, ms);
  }, [apply]);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    // **No picture, no gesture.** A PDF's hand-off panel, a failed fetch and bytes still
    // arriving all reach this handler now that it sits on the whole overlay — and none of them
    // has anything to lift.
    const img = imgRef.current;
    if (!img) return;
    // Captured on the OVERLAY, which is what makes the rest of the gesture indifferent to where
    // the fingers wander: over the card, off the picture, past the screen edge.
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    // One finger is not a gesture here: with nothing to pan and nothing to toggle, a single
    // pointer only ever waits for its partner. (And a lone tap on the scrim is still the ONE
    // close — that is a `click`, and it is not this handler's business.)
    if (pts.length !== 2) return;

    const rect = rectOf(img);
    const mid = midpoint(pts[0], pts[1]);
    // The copy is born at the picture's box with an identity transform, so the pinch's focal
    // maths reads its origin off that box — the same `transform-origin: 0 0` the CSS declares.
    // The anchor is clamped INTO that box, because the fingers no longer have to be in it.
    pinch.current = {
      dist: distance(pts[0], pts[1]),
      mid,
      anchor: clampToRect(mid, rect),
      transform: { ...IDENTITY },
      origin: { x: rect.left, y: rect.top },
    };
    transform.current = { ...IDENTITY };
    setSettling(false);
    setLift(rect);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      if (pts.length < 2 || !pinch.current) return;
      transform.current = pinchTransform(
        pinch.current,
        midpoint(pts[0], pts[1]),
        distance(pts[0], pts[1]),
      );
      apply();
    },
    [apply],
  );

  // **The first finger up ends it**, not the last. Holding one finger down after a pinch used to
  // mean "keep this zoom and pan it"; there is no such state now, so a gesture that has stopped
  // being a pinch has stopped being a zoom.
  //
  // The release also arms the click swallow, because the overlay's own `click` is the ONE close
  // (ADR-0103 §2) and a pinch that started on the scrim can end in a synthesised tap on it —
  // which would dismiss the viewer the gesture was zooming. Armed HERE, at the release, since
  // that is the event before the one being guarded (ADR-0148's amendment), and disarmed by that
  // click or by its own timeout.
  const onPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2 && pinch.current) {
        armClickSwallow();
        settle();
      }
    },
    [settle],
  );

  return {
    imgRef,
    liftRef,
    lift,
    settling,
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
  const { imgRef, liftRef, lift, settling, reset, handlers } = useImageZoom();

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
    <div
      className={closing ? 'doc-viewer is-closing' : 'doc-viewer'}
      /* The card's furniture stands down while the picture is out of its box — the ✕ over a
         lifted photograph is chrome on top of the one thing you asked to see. */
      data-lifted={lift ? '' : undefined}
      onClick={beginClose}
      {...handlers}
    >
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
        {/* **No ✕** (owner, 2026-08-05: _"this button is unnecessary"_). Every other way out
            already runs the ONE close (ADR-0103 §2) and none of them is a control the picture
            has to make room for: the backdrop — the whole screen around the card — plus system
            back, the Android gesture and Escape. The head is the title now, nothing else. */}
        <div className="doc-viewer-head">
          <span className="doc-viewer-title">{title}</span>
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
              /* Transparent while its copy is up — it is the box the copy is measured from and
                 born at, so it must keep its place in the layout; it just must not be seen
                 underneath itself. The gesture is the overlay's, not this element's. */
              data-lifted={lift ? '' : undefined}
              src={url}
              alt={title}
              onLoad={(e) => setLoadedSize(naturalSize(e.currentTarget))}
              onError={() => setImageBroken(true)}
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
      {/* **The picture, out of its box.** A sibling of the card rather than a child of the
          frame: the frame clips (ADR-0062's pan lived inside that clip) and the card has its
          own rounded `overflow: hidden`, so the only place a lifted picture can be whole is
          out here. Still inside `.doc-viewer`, which is what ADR-0062's global multi-touch
          suppressor keys on. Purely a picture of a picture — no pointer events, nothing for a
          screen reader, and the `<img>` it was cloned from keeps the alt text. */}
      {lift && url && (
        <>
          <div
            className="doc-viewer-lift-scrim"
            data-settling={settling ? '' : undefined}
            aria-hidden="true"
          />
          <img
            ref={liftRef}
            className="doc-viewer-lift"
            data-settling={settling ? '' : undefined}
            src={url}
            alt=""
            aria-hidden="true"
            style={{ left: lift.left, top: lift.top, width: lift.width, height: lift.height }}
          />
        </>
      )}
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
