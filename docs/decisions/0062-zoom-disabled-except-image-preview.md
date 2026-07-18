# 0062 — Zoom is disabled app-wide, except inside the image preview

**Status:** Accepted (Assaf sign-off 2026-07-18)
**Date:** 2026-07-18
**Refines:** [0007](0007-platform-pwa.md) (installed, app-like PWA), [0017](0017-mobile-first-device-targets.md) (mobile-first, touch-first — the layout is already responsive, so page zoom is unwanted), [0052](0052-document-lifecycle-view-manage-and-feedback.md) (the document/image viewer that becomes the one zoom exception)

## Context

The viewport meta (`frontend/index.html:5-8`) is `width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content` — **no `user-scalable`, no `maximum-scale`** — so the browser's pinch-zoom and double-tap-zoom are on across the whole app. There is no global `touch-action` restriction (the only `touch-action: none` is on the Plan-builder drag grip, `screens.css:2686`).

For an installed PWA that wants to feel like a native app, accidental pinch/double-tap zoom of the UI (the RTL Hebrew board, the day-strip, the timeline) is a papercut — the layout is already mobile-first and responsive, so there's nothing the user needs to zoom _into_ in the chrome. The one place zoom is genuinely useful is **inspecting a document or photo** — a passport scan in the viewer (`ui/DocumentViewer.tsx`), where the image is currently fit-to-container only, with no zoom at all (`screens.css:4232-4245`: `object-fit: contain`, no transform/gesture).

Assaf (2026-07-18): "זום באפליקציה — צריך להיות מבוטל חוץ מאשר preview של תמונה."

## Decision

**Disable page zoom (pinch + double-tap) across the app, and enable pinch-to-zoom only inside the image preview.**

- **Double-tap zoom** is suppressed with `touch-action: manipulation` on the app root — reliable cross-browser.
- **Pinch zoom** cannot be reliably disabled by the viewport meta alone: modern **iOS Safari ignores `maximum-scale=1` / `user-scalable=no`** (since iOS 10, for accessibility), and iOS is the primary installed-PWA target (ADR-0017). So app-wide pinch suppression is enforced by preventing the multi-touch zoom gestures (`gesturestart`/`gesturechange` on iOS; multi-touch `touchmove` elsewhere) at the app root, **scoped to exclude the viewer subtree**.
- **The image viewer opts back in.** Inside `.doc-viewer`, the image supports **pinch-to-zoom + pan** (a lightweight implementation — a pinch/pan handler, or `touch-action: pinch-zoom` on the image container — whichever proves reliable on iOS), and the global suppressor explicitly excludes that subtree so the two don't fight.

**Trade-off, recorded:** suppressing pinch-zoom removes the browser's built-in accessibility zoom on the app chrome. Mitigations: keep type sizes accessible (design-language), respect OS-level text scaling where the platform provides it, and keep zoom exactly where magnification is most needed — the document/photo viewer. For a private small-group personal app the app-like feel is worth this trade; revisit if an accessibility need surfaces.

## Consequences

- **Frontend only, no data-model/backend change.** Changes: the viewport meta may add `maximum-scale=1, user-scalable=no` (harmless where honored, ignored on iOS) as a belt-and-suspenders; the real enforcement is `touch-action: manipulation` on the root plus a small global multi-touch-gesture suppressor that excludes `.doc-viewer`; the viewer gains pinch-zoom + pan on the image (`DocumentViewer.tsx` + `screens.css` `.doc-viewer-img`).
- **Must be verified on iOS Safari / the installed PWA** — that's precisely where the meta-only approach fails and the gesture approach is required. A desktop check alone is insufficient.
- Does not affect the Plan-builder drag (`touch-action: none` grip) or the horizontal day-strip scroll (`pan-x` still allowed under `manipulation`).

## Alternatives considered

- **Viewport `user-scalable=no` only.** Rejected: ignored by modern iOS Safari, so it wouldn't actually disable pinch on the primary target.
- **Leave zoom on everywhere.** Rejected: accidental UI zoom is the native-feel papercut Assaf asked to remove.
- **Disable double-tap only.** Rejected: pinch is the more common accidental zoom on a phone; the ask is to disable zoom, with the viewer as the sole exception.
- **Disable everything, no viewer exception.** Rejected: inspecting a passport scan legitimately needs magnification — the explicit exception in the request.
