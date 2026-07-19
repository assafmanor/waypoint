// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilePicker } from './FilePicker';

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

describe('FilePicker', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
    render(<FilePicker value={null} onPick={() => {}} onClear={() => {}} accept="*" capture />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('hides the capture tile on a fine-pointer (desktop) device', () => {
    stubPointer(false);
    render(<FilePicker value={null} onPick={() => {}} onClear={() => {}} accept="*" capture />);
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
    screen.getByRole('button').click();
    expect(onClear).toHaveBeenCalled();
  });

  it('renders an image thumbnail from an object URL and revokes it on unmount', () => {
    const { unmount } = render(
      <FilePicker value={jpg()} onPick={() => {}} onClear={() => {}} accept="*" />,
    );
    const img = document.querySelector('.file-preview-thumb img') as HTMLImageElement;
    expect(img?.getAttribute('src')).toBe('blob:preview');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});
