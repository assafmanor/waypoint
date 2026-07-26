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

export { TestPointerEvent };
