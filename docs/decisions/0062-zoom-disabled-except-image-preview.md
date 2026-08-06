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

### Amendment (2026-08-05): the pinch lifts the picture out of the card, and lets go of it when you do

Owner, on the shipped viewer: _"Right now the image is confined to the box. I want to change the zoom to be Instagram-like, i.e. the image zooms out of the box and auto resets to the original size when lifting the finger."_

**The exception stays exactly where it was — what changes is what the gesture leaves behind.** The 2026-07-18 model was _sticky_: a pinch set a scale, the scale persisted, one finger panned inside the frame, a double tap toggled 2.5×. All of it happened inside `.doc-viewer-body`, whose `overflow: hidden` is the box being complained about — so at 4× you were reading a passport through a letterbox slot, moving the paper around behind it.

Now zoom exists **only while two fingers are down**:

- **A pinch lifts a copy of the picture out of the card.** It is a `fixed` sibling of `.doc-viewer-card` inside the same portal, born at the original's own viewport box with no transform — so at rest it is pixel-identical to what it covers, and nothing clips it: not the frame, not the card's rounding.
- **It follows the fingers**, scale and pan from the same `pinchTransform` as before (the maths is unchanged, and still unit-tested). Still clamped to 1×–4×.
- **The first finger up sends it home**, not the last: with no zoomed state left to pan, a gesture that has stopped being a pinch has stopped being a zoom. It rides `--t-base` back to no transform and then stops existing, so nothing can strand a picture outside its card.
- **The in-flow `<img>` never moves.** It goes transparent, not hidden, while its copy is up: it is the box the copy is measured from and born at, so it keeps its place in the layout and simply must not be seen underneath itself. The copy takes no pointer events at all, so the backdrop tap under it is still the ONE close (ADR-0103 §2).

**Amended the same week (2026-08-06): the gesture belongs to the whole screen, not to the picture.** Owner: _"the pinch to zoom in/out gesture should be available from the entire screen when the image is already displaying, so that if the image dimensions are small, you wouldn't have to place your fingers exactly inside the image borders. same way it is in instagram."_ The handlers moved from the `<img>` to `.doc-viewer` — which is the full screen — so fingers landing on the scrim, the head or the card's edge all pinch the picture, and `touch-action: none` moved with them. Three consequences worth knowing:

- **The picture decides whether there is a gesture, even though it is no longer the target.** No displayed image — a PDF's hand-off, a failure, bytes still arriving — means no `imgRef`, and nothing starts.
- **The zoom's anchor is CLAMPED into the picture's box.** Holding the point under the fingers still is right only while that point is on the picture; an anchor it does not contain moves everything away from the fingers, so a pinch 300px below a short photograph would push it off the top of the screen at 2×. Clamped, the same pinch grows it from its bottom edge. Equal to the midpoint whenever the fingers are on the picture, so that case is arithmetically untouched.
- **A released pinch cannot close the viewer.** The overlay's own `click` is the one close, and a gesture that starts on the scrim can end in a synthesised tap on it — so the release arms a click swallow (`lib/click-swallow.ts`, generalized out of `useCanvasGestures`: armed by the RELEASE, disarmed by that click or by its own timeout).

**The chrome got out of the way too, in both senses** (same session, owner: _"the X button should also go away"_ → _"I meant in general this button is unnecessary"_). The head fades and goes untappable while the picture is lifted, and **the viewer no longer has a ✕ at all**. ADR-0103 §2 is untouched by that: it requires every way out to run the ONE close, not that one of them wear a label — and the backdrop (the whole screen around the card), system back, the Android gesture and Escape all still do. What the removal buys is the thing this whole change is about: nothing between you and the picture. The **credit line stays** — it is ADR-0167 §4's licensing slot and is owed most when the picture is largest.

**What is deliberately gone, and the trade it makes.** Sticky zoom, one-finger pan, and double-tap-to-zoom all disappear with the state they depended on. §Alternatives above justified the exception with _"inspecting a passport scan legitimately needs magnification"_, and that still holds — you magnify while pinching, which is how you read a document number on a phone you are already holding — but you can no longer **let go and keep it magnified**, and there is now no zoom at all with a mouse, since a trackpad pinch is not two pointers. Desktop is a graceful minimum (ADR-0017) and the phone is the target, so this was accepted; if hands-free magnification is wanted back, the honest form is a deliberate second mode, not a revived sticky pinch.

**Untouched:** the global suppressor, its `.doc-viewer` exemption (which is what makes a whole-screen pinch inside the viewer legal without touching that script), and `frontend/index.html`'s hardcoded root. The page still must not zoom while the picture does — asserted in `e2e/media-viewer-lift.spec.ts`, which drives real CDP touch points because an untrusted `PointerEvent` has no active pointer behind it and `setPointerCapture` throws on one.

### Shipped as (2026-07-18)

- Viewport meta gained `maximum-scale=1, user-scalable=no`; `touch-action: manipulation` sits on `html, body, #root` (tokens.css). The multi-touch suppressor is an inline `<script>` in `index.html` (document-level, runs before the app), `preventDefault`-ing `gesturestart`/`gesturechange`/`gestureend` (iOS Safari) and multi-touch `touchmove` (others) unless the event target is inside `.doc-viewer`.
- The viewer image opts back in with the **hand-rolled pointer handler** (not `touch-action: pinch-zoom`, which zooms the visual viewport rather than the element): `.doc-viewer-img` sets `touch-action: none; transform-origin: 0 0`, and `DocumentViewer.tsx` owns pinch (focal-point scale, `1×`–`4×`), single-finger pan while zoomed, double-tap to reset (or zoom to `2.5×` at the tapped point), and a snap-back to fit when a pinch bottoms out at `1×`. The focal/clamp math is unit-tested (`DocumentViewer.zoom.test.ts`); pan bounds are intentionally omitted — reset/snap-back is the recovery. **(Superseded by the 2026-08-05 amendment above: the pan, the double tap and the persistence are gone; the pinch and its focal maths remain, now applied to a copy lifted out of the card.)**

## Alternatives considered

- **Viewport `user-scalable=no` only.** Rejected: ignored by modern iOS Safari, so it wouldn't actually disable pinch on the primary target.
- **Leave zoom on everywhere.** Rejected: accidental UI zoom is the native-feel papercut Assaf asked to remove.
- **Disable double-tap only.** Rejected: pinch is the more common accidental zoom on a phone; the ask is to disable zoom, with the viewer as the sole exception.
- **Disable everything, no viewer exception.** Rejected: inspecting a passport scan legitimately needs magnification — the explicit exception in the request.
