// @vitest-environment jsdom
// The viewer's OPEN/CLOSE contract (ADR-0140's 2026-08-02 amendment). The zoom maths
// has its own file (`MediaViewer.zoom.test.ts`); this one is about the overlay.
//
// Note what jsdom can and cannot see here. It has no CSS engine, so `motionDurationMs`
// answers 0 and every close below resolves synchronously — which is exactly the
// correctness case ADR-0140 §5 cares about and the reason these assertions need no
// clock. What it CANNOT see is whether the animation runs; that is `screens.css` plus
// `styles/exit-animations.contract.test.ts`, which guards the one grammar mistake that
// silently disables an exit.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../test/pointer-events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentViewer, MediaViewer } from './MediaViewer';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';

vi.mock('../lib/api', () => ({
  fetchDocumentContent: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })),
}));
const { fetchDocumentContent } = await import('../lib/api');

const doc = (over: Partial<Parameters<typeof DocumentViewer>[0]['doc']> = {}) => ({
  id: 'd1',
  tripId: 't1',
  type: 'passport' as const,
  title: 'דרכון · נועה',
  mimeType: 'image/jpeg',
  sizeBytes: 2400,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  updatedBy: 'u1',
  ...over,
});

function open(over: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  render(wrapNav(<DocumentViewer tripId="t1" doc={doc()} onClose={onClose} {...over} />));
  return { onClose };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.documentElement.style.removeProperty('--t-base');
  document.documentElement.style.removeProperty('--stagger-step');
});

/** jsdom has no stylesheet, so `motionDurationMs` reads 0 and every close is
 *  synchronous — the correct default, and what the rest of this file exercises. Make
 *  the tokens readable to reach the ANIMATED branch, which is where the exit's
 *  idempotence guard lives. This is the recipe ADR-0140 §5 describes. */
/** The ratio the frame is sized from (`screens.css` turns it into the box). jsdom has no
 *  layout, so this property is the whole of what the unit suite can see — the box it produces
 *  is measured in `e2e/media-viewer-fit.spec.ts`. */
const aspectOf = () =>
  document.querySelector<HTMLElement>('.doc-viewer-body')!.style.getPropertyValue('--dv-aspect');

function withAnimation(ms = 30) {
  document.documentElement.style.setProperty('--t-base', `${ms}ms`);
  document.documentElement.style.setProperty('--stagger-step', '0ms');
}

describe('DocumentViewer — every way out is the same way out', () => {
  // ADR-0103 §2: a close control, a backdrop tap, Escape and the Android gesture must
  // run ONE function, or an exit hung on some of them is a surface that snaps half the
  // time. All three below go through `beginClose`.
  it('closes from the ✕', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: t.docs.viewer.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from a backdrop tap', () => {
    const { onClose } = open();
    fireEvent.click(document.querySelector('.doc-viewer')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a tap inside the card', () => {
    const { onClose } = open();
    fireEvent.click(document.querySelector('.doc-viewer-card')!);
    expect(onClose).not.toHaveBeenCalled();
  });

  // With no stylesheet there is no animation to wait for, so the dismissal must land
  // NOW rather than on a 0ms timer — a surface the user closed is still on screen and
  // still holding focus for as long as that macrotask takes (ADR-0140 §5).
  it('closes synchronously when nothing is animating', () => {
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: t.docs.viewer.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The idempotence guard in `useExitTransition`, which only exists on the animated
  // path: a back, a backdrop tap and Escape can all land during the exit, and a
  // re-entry would restart the animation on something already leaving.
  it('ignores a second dismissal while the exit is playing', async () => {
    withAnimation();
    const { onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: t.docs.viewer.close }));
    fireEvent.click(document.querySelector('.doc-viewer')!);
    // Still on screen: the exit owns the frames between the decision and the unmount.
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('marks the overlay as closing so the exit keyframes apply', () => {
    withAnimation();
    open();
    fireEvent.click(screen.getByRole('button', { name: t.docs.viewer.close }));
    expect(document.querySelector('.doc-viewer')!.classList.contains('is-closing')).toBe(true);
  });
});

describe('DocumentViewer — the frame is reserved before the bytes arrive', () => {
  // The +253px jump this fixes happens while the spinner is still running, so the
  // reservation has to be readable from the mime type alone — not from the loaded image.
  it('marks the body as expecting an image before content lands', () => {
    open();
    expect(document.querySelector('.doc-viewer-body')?.getAttribute('data-expect')).toBe('image');
  });

  // A PDF renders the ADR-0052 §1 hand-off, a compact block that a fixed image frame
  // would strand in a mostly empty card.
  it('does not reserve an image frame for a hand-off type', () => {
    open({ doc: doc({ mimeType: 'application/pdf' }) });
    expect(document.querySelector('.doc-viewer-body')?.hasAttribute('data-expect')).toBe(false);
  });

  // **What it is reserved AT is the picture's ratio, not a constant** (2026-08-05). jsdom has
  // no layout, so what is assertable here is the number the frame is sized FROM — the box it
  // produces is `screens.css` and the e2e's to measure.
  it('carries no ratio while a document is still a mime type', () => {
    open();
    expect(aspectOf()).toBe('');
  });

  it('runs the mount layer once the page has landed, not before', async () => {
    open();
    const opening = () =>
      document.querySelector('.doc-viewer-body')!.classList.contains('is-opening');
    expect(opening()).toBe(false);
    await waitFor(() => expect(opening()).toBe(true));
  });
});

describe('DocumentViewer — the arrival grows from the row that was tapped', () => {
  it('carries the measured origin as custom properties', () => {
    open({ originY: -100 });
    const card = document.querySelector<HTMLElement>('.doc-viewer-card')!;
    expect(card.style.getPropertyValue('--dv-origin-dy')).toBe('-100px');
    // A share of the offset, not the whole of it — the card grows out of the row, it
    // does not fly from it.
    expect(card.style.getPropertyValue('--dv-origin-travel')).toBe('-22px');
  });

  it('caps the travel so a distant row cannot turn the arrival into a slide', () => {
    open({ originY: 900 });
    const card = document.querySelector<HTMLElement>('.doc-viewer-card')!;
    expect(card.style.getPropertyValue('--dv-origin-travel')).toBe('40px');
  });

  // A note deep link (`?doc=`) has no row to come from, so the card is summoned at its
  // centre. Absent properties, not zeroed ones — the CSS default is the behaviour.
  it('sets nothing when there was no row', () => {
    open({ originY: null });
    const card = document.querySelector<HTMLElement>('.doc-viewer-card')!;
    expect(card.style.getPropertyValue('--dv-origin-dy')).toBe('');
    expect(card.style.getPropertyValue('--dv-origin-travel')).toBe('');
  });
});

// **THE SECOND SOURCE** (ADR-0167 §10.2). The viewer stopped being document-shaped so the place
// card's full picture could reuse it rather than grow a hero — so what needs asserting is that
// the url path reaches the bytes WITHOUT the document machinery, and that the document path is
// untouched (every test above it, unchanged, is that half).
describe('MediaViewer with a public url (ADR-0167 §10.2)', () => {
  // The viewer is a PORTAL into `document.body`, so everything here queries the document —
  // the same way every test above it does.
  const openPhoto = (
    over: {
      caption?: string;
      onClose?: () => void;
      intrinsic?: { width: number; height: number };
    } = {},
  ) => {
    const onClose = over.onClose ?? vi.fn();
    render(
      wrapNav(
        <MediaViewer
          title="Sensō-ji"
          mimeType="image/jpeg"
          source={{ kind: 'url', url: '/enrichment/images/enr_1' }}
          caption={over.caption}
          intrinsic={over.intrinsic}
          onClose={onClose}
        />,
      ),
    );
    return { onClose };
  };

  it('shows the image with no fetch, no object URL and nothing to revoke', () => {
    // A delta rather than `not.toHaveBeenCalled()`: the module mock is file-scoped, so the
    // document tests above have already used it.
    const before = vi.mocked(fetchDocumentContent).mock.calls.length;
    openPhoto();
    const img = document.querySelector('.doc-viewer-img') as HTMLImageElement;
    // The url IS the answer: an immutable public path needs no request and cannot leak. No
    // `waitFor` either, which is the point — there is no round trip to wait for.
    expect(img.getAttribute('src')).toBe('/enrichment/images/enr_1');
    expect(vi.mocked(fetchDocumentContent).mock.calls.length).toBe(before);
  });

  it('names the dialog and labels the image with the title', () => {
    openPhoto();
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Sensō-ji');
    expect(screen.getByAltText('Sensō-ji')).toBeTruthy();
  });

  // The licensing slot. A document passes none, which is why the element is absent there.
  it('renders a caption when given one, and nothing when not', () => {
    openPhoto({ caption: 'Kakidai · CC BY-SA 4.0' });
    expect(document.querySelector('.doc-viewer-caption')?.textContent).toBe(
      'Kakidai · CC BY-SA 4.0',
    );
    document.body.innerHTML = '';
    openPhoto();
    expect(document.querySelector('.doc-viewer-caption')).toBeNull();
  });

  // **A delivered photo knows its own dimensions** (ADR-0166 §11.4), which is the difference
  // between the two sources here: the frame is this picture's box on the FIRST render, with no
  // load to wait for and so nothing to settle.
  it('reserves the frame at the delivered dimensions, before any load', () => {
    openPhoto({ intrinsic: { width: 840, height: 600 } });
    expect(aspectOf()).toBe('840 / 600');
  });

  // A caller that knows nothing — the document path in the wild — settles on load instead, at
  // the two integers the image reports rather than a float of our own. Asserted on this source
  // because it is the one whose `<img>` reaches the DOM in jsdom: the blob path decodes first,
  // and jsdom cannot decode, so a document renders the ADR-0052 §1 hand-off here.
  it('settles the frame on load when nothing was passed', () => {
    openPhoto();
    const img = screen.getByAltText('Sensō-ji');
    Object.defineProperty(img, 'naturalWidth', { value: 3024 });
    Object.defineProperty(img, 'naturalHeight', { value: 4032 });
    fireEvent.load(img);
    expect(aspectOf()).toBe('3024 / 4032');
  });

  // A load reporting 0×0 (a broken decode) would be an invalid `aspect-ratio` — the frame keeps
  // the placeholder rather than declaring one.
  it('ignores a load that reports no size', () => {
    openPhoto();
    fireEvent.load(screen.getByAltText('Sensō-ji'));
    expect(aspectOf()).toBe('');
  });

  // Every way out still runs the one close (ADR-0103 §2) — inherited, not re-implemented, which
  // is the whole argument for reusing this surface.
  it('still closes from the ✕, like the document path', () => {
    const { onClose } = openPhoto();
    fireEvent.click(screen.getByRole('button', { name: t.docs.viewer.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // **THE PINCH LIFTS THE PICTURE OUT OF THE CARD, AND LETS GO OF IT WHEN YOU DO**
  // (ADR-0062's 2026-08-05 amendment). What is assertable without a layout engine is the whole
  // of the model: how many fingers make it a gesture, which element leaves the card, what the
  // copy is transformed to, and when it stops existing. What is NOT is how it LOOKS out there —
  // that the copy escapes the frame's clip and the card's rounding is geometry, and it is
  // measured in `e2e/media-viewer-lift.spec.ts`.
  const pinch = (img: Element, ...pts: { x: number; y: number }[]) =>
    pts.forEach((p, i) =>
      fireEvent.pointerDown(img, { pointerId: i + 1, clientX: p.x, clientY: p.y }),
    );
  const moveTo = (img: Element, ...pts: { x: number; y: number }[]) =>
    pts.forEach((p, i) =>
      fireEvent.pointerMove(img, { pointerId: i + 1, clientX: p.x, clientY: p.y }),
    );
  const lifted = () => document.querySelector<HTMLElement>('.doc-viewer-lift');

  // One finger is not a gesture: with no zoom to keep, there is nothing for it to pan and
  // nothing for a second tap to toggle.
  it('does nothing under a single finger', () => {
    openPhoto();
    pinch(screen.getByAltText('Sensō-ji'), { x: 100, y: 100 });
    expect(lifted()).toBeNull();
  });

  it('lifts a copy out of the card on the second finger', () => {
    openPhoto();
    const img = screen.getByAltText('Sensō-ji');
    pinch(img, { x: 100, y: 100 }, { x: 200, y: 100 });
    const copy = lifted()!;
    // Out of the card — a sibling of it, in the overlay itself, which is what nothing clips.
    expect(copy.parentElement!.className).toBe('doc-viewer');
    expect(copy.getAttribute('src')).toBe('/enrichment/images/enr_1');
    // A picture of a picture: no alt, hidden from the tree, and the original still labelled.
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    expect(copy.getAttribute('alt')).toBe('');
    // The original goes transparent rather than away — it is still holding the pointer capture
    // and still has to be hit-testable for the second finger.
    expect(img.hasAttribute('data-lifted')).toBe(true);
    expect(document.querySelector('.doc-viewer-lift-scrim')).toBeTruthy();
  });

  it('scales the copy by the finger-distance ratio', () => {
    openPhoto();
    const img = screen.getByAltText('Sensō-ji');
    pinch(img, { x: 100, y: 100 }, { x: 200, y: 100 });
    moveTo(img, { x: 50, y: 100 }, { x: 250, y: 100 }); // 100px apart → 200px apart
    expect(lifted()!.style.transform).toContain('scale(2)');
  });

  // **The first finger up ends it, not the last** — a gesture that has stopped being a pinch has
  // stopped being a zoom. With no stylesheet there is no journey home to wait out, so the copy
  // is gone now (the same ADR-0140 §5 correctness case every close in this file exercises).
  it('sends the copy home when a finger lifts', () => {
    openPhoto();
    const img = screen.getByAltText('Sensō-ji');
    pinch(img, { x: 100, y: 100 }, { x: 200, y: 100 });
    moveTo(img, { x: 50, y: 100 }, { x: 250, y: 100 });
    fireEvent.pointerUp(img, { pointerId: 2 });
    expect(lifted()).toBeNull();
    expect(img.hasAttribute('data-lifted')).toBe(false);
  });

  // With the tokens readable the copy stays for the length of the journey — untransformed, so
  // the transition has somewhere to go — and only then stops existing.
  it('keeps the copy for the journey home when there is one to play', async () => {
    withAnimation();
    openPhoto();
    const img = screen.getByAltText('Sensō-ji');
    pinch(img, { x: 100, y: 100 }, { x: 200, y: 100 });
    moveTo(img, { x: 50, y: 100 }, { x: 250, y: 100 });
    fireEvent.pointerUp(img, { pointerId: 2 });
    const copy = lifted()!;
    expect(copy.hasAttribute('data-settling')).toBe(true);
    expect(copy.style.transform).toBe('translate(0px, 0px) scale(1)');
    await waitFor(() => expect(lifted()).toBeNull());
  });

  // A cancelled pointer (the OS taking the gesture, a call arriving) is a release like any
  // other: the one thing that must never happen is a picture stranded out of its card.
  it('sends the copy home on a cancelled pointer too', () => {
    openPhoto();
    const img = screen.getByAltText('Sensō-ji');
    pinch(img, { x: 100, y: 100 }, { x: 200, y: 100 });
    fireEvent.pointerCancel(img, { pointerId: 1 });
    expect(lifted()).toBeNull();
  });
});
