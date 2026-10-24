// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FilePicker } from './FilePicker';
import { t } from '../../i18n/he';
import { wrapNav } from '../../test/nav-harness';

// The full view is `MediaViewer`, which imports the document read — a picked file must never
// reach it (there is nothing saved to fetch), and this mock is what lets that be asserted.
vi.mock('../../lib/api', () => ({ fetchDocumentContent: vi.fn() }));
const { fetchDocumentContent } = await import('../../lib/api');

const pdf = () => new File(['%PDF'], 'insurance-harel.pdf', { type: 'application/pdf' });
const jpg = () => new File(['x'], 'passport-assaf.jpg', { type: 'image/jpeg' });

const fileInput = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement;

/** Stub the pointer media query the capture tile gates on. */
const stubPointer = (coarse: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({ matches: coarse && q.includes('coarse'), media: q })),
  );

/** Object URLs are handed out in order, because the thumbnail's and the full view's are two
 *  independent lifecycles over the same file — a shared constant could not tell them apart,
 *  and telling them apart is the leak this suite guards. */
let urlSeq = 0;

describe('FilePicker', () => {
  beforeEach(() => {
    urlSeq = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:${++urlSeq}`),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the upload tile + hint when empty, no capture tile by default', () => {
    stubPointer(true);
    render(
      <FilePicker value={null} onPick={() => {}} onClear={() => {}} accept="*" hint="hint copy" />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('hint copy')).toBeTruthy();
  });

  it('offers a second capture tile when capture is requested on a coarse-pointer device', () => {
    stubPointer(true);
    render(
      <FilePicker
        value={null}
        onPick={() => {}}
        onClear={() => {}}
        accept="*"
        capture="environment"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('hides the capture tile on a fine-pointer (desktop) device', () => {
    stubPointer(false);
    render(
      <FilePicker
        value={null}
        onPick={() => {}}
        onClear={() => {}}
        accept="*"
        capture="environment"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('fires onPick with the chosen file', () => {
    const onPick = vi.fn();
    const { container } = render(
      <FilePicker value={null} onPick={onPick} onClear={() => {}} accept="*" />,
    );
    const file = jpg();
    fireEvent.change(fileInput(container), { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('renders a preview with name + size and a working clear for a picked file', () => {
    const onClear = vi.fn();
    render(<FilePicker value={pdf()} onPick={() => {}} onClear={onClear} accept="*" />);
    expect(screen.getByText('insurance-harel.pdf')).toBeTruthy();
    expect(screen.getByText('4B')).toBeTruthy(); // "%PDF" = 4 bytes
    expect(screen.getByText('PDF')).toBeTruthy(); // extension chip on the file tile
    screen.getByRole('button', { name: t.filePicker.remove }).click();
    expect(onClear).toHaveBeenCalled();
  });

  it('renders an image thumbnail from an object URL and revokes it on unmount', () => {
    const { unmount } = render(
      <FilePicker value={jpg()} onPick={() => {}} onClear={() => {}} accept="*" />,
    );
    const img = document.querySelector('.file-preview-thumb img') as HTMLImageElement;
    expect(img?.getAttribute('src')).toBe('blob:1');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  it('revokes the thumbnail URL when the file is cleared, not only on unmount', () => {
    const { rerender } = render(
      <FilePicker value={jpg()} onPick={() => {}} onClear={() => {}} accept="*" />,
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    rerender(<FilePicker value={null} onPick={() => {}} onClear={() => {}} accept="*" />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });
});

// ── Field-report #19: the full document, before Save ──────────────────────────────────
// The card showed a 48px thumbnail and there was no way to check what you were about to
// save. The fix is the app's ONE viewer with a `file` source (ADR-0086's 2026-08-08
// amendment) — so what these pin is that the card REACHES it, that the pre-save read
// touches no document machinery, and that the two object URLs over one file (the
// thumbnail's and the viewer's) stay independent.
describe('FilePicker — the preview card opens the file full-screen', () => {
  beforeEach(() => {
    urlSeq = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:${++urlSeq}`),
      revokeObjectURL: vi.fn(),
    });
    // jsdom has no `HTMLImageElement.decode`, and a missing method reads to the viewer as
    // bytes it cannot decode — without this the image path lands on the hand-off instead.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  const show = (value: File | null, onClear = () => {}) =>
    render(wrapNav(<FilePicker value={value} onPick={() => {}} onClear={onClear} accept="*" />));

  const openFull = () => fireEvent.click(screen.getByRole('button', { name: /תצוגה מלאה/ }));
  const viewer = () => document.querySelector('.doc-viewer');

  it('opens nothing until the card is pressed', () => {
    show(jpg());
    expect(viewer()).toBeNull();
  });

  it('opens the one full-screen viewer, named by the filename', () => {
    show(jpg());
    openFull();
    expect(viewer()).not.toBeNull();
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('passport-assaf.jpg');
  });

  // The bytes are in memory: a file that has not been saved has no `/content` route to read,
  // and reaching for one would be a request for a document that does not exist yet.
  it('reads the picked bytes directly, with no document fetch', async () => {
    show(jpg());
    openFull();
    await waitFor(() => expect(document.querySelector('.doc-viewer-img')).not.toBeNull());
    expect(fetchDocumentContent).not.toHaveBeenCalled();
  });

  // **Two URLs over one file, and neither may free the other's.** The card keeps its
  // thumbnail while the viewer is open, so a shared URL revoked on close would blank the
  // card behind it.
  it('gives the full view its own object URL and revokes only that one on close', async () => {
    show(jpg());
    openFull();
    await waitFor(() => expect(document.querySelector('.doc-viewer-img')).not.toBeNull());
    const full = document.querySelector('.doc-viewer-img') as HTMLImageElement;
    const thumb = document.querySelector('.file-preview-thumb img') as HTMLImageElement;
    expect(thumb.getAttribute('src')).toBe('blob:1');
    expect(full.getAttribute('src')).toBe('blob:2');

    fireEvent.click(document.querySelector('.doc-viewer')!);
    await waitFor(() => expect(viewer()).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2');
    // The card is still showing its thumbnail, so its URL is still live.
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:1');
  });

  it('revokes the full view URL when the picker unmounts with it open', async () => {
    const { unmount } = show(jpg());
    openFull();
    await waitFor(() => expect(document.querySelector('.doc-viewer-img')).not.toBeNull());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  // Clearing is the one way to swap a file (ADR-0052's amendment: swap = clear + re-pick), so
  // a full view left open would be showing the file that is no longer picked.
  it('closes the full view when the file is cleared', async () => {
    const { rerender } = show(jpg());
    openFull();
    await waitFor(() => expect(viewer()).not.toBeNull());
    rerender(wrapNav(<FilePicker value={null} onPick={() => {}} onClear={() => {}} accept="*" />));
    expect(viewer()).toBeNull();
  });

  // A PDF gets the same hand-off a SAVED pdf gets (ADR-0052 §1) — the browser is asked to
  // render it in its own tab rather than being given a blank embed. Honest, and the caveat
  // the amendment records: this is a way to the file, not an inline render.
  it('hands a PDF off to open/download rather than embedding it blank', async () => {
    show(pdf());
    openFull();
    await waitFor(() => expect(document.querySelector('.doc-viewer-handoff')).not.toBeNull());
    expect(document.querySelector('.doc-viewer-img')).toBeNull();
    expect(document.querySelector('a.dv-download')!.getAttribute('download')).toBe(
      'insurance-harel.pdf',
    );
  });

  // The card's own name stays the button's accessible name: `aria-label` REPLACES the content,
  // so naming only the action would have dropped the filename a sighted user still reads.
  it('names both the action and the file on the open control', () => {
    show(jpg());
    expect(screen.getByRole('button', { name: 'תצוגה מלאה: passport-assaf.jpg' })).toBeTruthy();
  });

  it('does not offer the full view while the picker is disabled', () => {
    render(
      wrapNav(
        <FilePicker value={jpg()} onPick={() => {}} onClear={() => {}} accept="*" disabled />,
      ),
    );
    const open = screen.getByRole('button', { name: /תצוגה מלאה/ }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    fireEvent.click(open);
    expect(viewer()).toBeNull();
  });
});
