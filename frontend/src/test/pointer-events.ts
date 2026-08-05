// jsdom implements neither `PointerEvent` nor pointer capture, so pointer events
// fired at it arrive with no coordinates, no `pointerType` and no `button` — which
// is everything a drag gesture is actually about. This installs a `MouseEvent`-based
// stand-in so `fireEvent.pointerDown(el, { clientY, button })` carries what the
// gesture reads.
//
// Extracted from `lib/useHoldToDrag.test.tsx`, which had the only copy, when the
// sheet's snap drag needed the same shim (CLAUDE.md rule 8 — generalize the existing
// one-off rather than adding a second beside it). Import it for the side effect at
// the top of any test that fires pointer events:
//
//     import '../test/pointer-events';

class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;
  readonly pointerId: number;
  readonly isPrimary: boolean;
  constructor(
    type: string,
    props: MouseEventInit & { pointerType?: string; pointerId?: number; isPrimary?: boolean } = {},
  ) {
    super(type, props);
    this.pointerType = props.pointerType ?? 'touch';
    this.pointerId = props.pointerId ?? 1;
    this.isPrimary = props.isPrimary ?? true;
  }
}

window.PointerEvent = TestPointerEvent as unknown as typeof window.PointerEvent;

// The other half of that gap, and it is not cosmetic: a handler that captures the pointer so a
// gesture survives the finger leaving the element (`MediaViewer`'s pinch) THROWS here, taking
// the whole handler with it. No-ops rather than a fake capture list — nothing in this app reads
// the capture back, it only sets it so the browser keeps routing moves to the target.
const noop = () => {};
Element.prototype.setPointerCapture ??= noop;
Element.prototype.releasePointerCapture ??= noop;
Element.prototype.hasPointerCapture ??= () => false;

export { TestPointerEvent };
