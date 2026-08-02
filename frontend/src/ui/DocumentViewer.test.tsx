// @vitest-environment jsdom
// The viewer's OPEN/CLOSE contract (ADR-0140's 2026-08-02 amendment). The zoom maths
// has its own file (`DocumentViewer.zoom.test.ts`); this one is about the overlay.
//
// Note what jsdom can and cannot see here. It has no CSS engine, so `motionDurationMs`
// answers 0 and every close below resolves synchronously — which is exactly the
// correctness case ADR-0140 §5 cares about and the reason these assertions need no
// clock. What it CANNOT see is whether the animation runs; that is `screens.css` plus
// `styles/exit-animations.contract.test.ts`, which guards the one grammar mistake that
// silently disables an exit.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentViewer } from './DocumentViewer';
import { wrapNav } from '../test/nav-harness';
import { t } from '../i18n/he';

vi.mock('../lib/api', () => ({
  fetchDocumentContent: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })),
}));

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
