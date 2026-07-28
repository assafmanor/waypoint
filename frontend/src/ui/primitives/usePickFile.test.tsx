// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePickFile, type CaptureFacing } from './usePickFile';

/** Stub the pointer media query the camera path gates on. */
function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/** A host that surfaces the hook's three outputs as plain DOM to assert against. */
function Host({
  onPick,
  capture = false,
  disabled = false,
}: {
  onPick: (f: File) => void;
  capture?: CaptureFacing | false;
  disabled?: boolean;
}) {
  const { openUpload, openCamera, inputs } = usePickFile({
    accept: 'image/*',
    capture,
    onPick,
    disabled,
  });
  return (
    <>
      <button data-testid="up" onClick={openUpload} />
      {openCamera && <button data-testid="cam" onClick={openCamera} />}
      {inputs}
    </>
  );
}

const inputs = () => [...document.querySelectorAll<HTMLInputElement>('input[type=file]')];

beforeEach(() => setPointer(true));
afterEach(cleanup);

describe('usePickFile', () => {
  it('renders one input and no camera handler when capture is off', () => {
    render(<Host onPick={() => {}} />);
    expect(inputs().length).toBe(1);
    expect(document.querySelector('[data-testid=cam]')).toBeNull();
  });

  it('renders a second, camera-facing input when capture is requested on a touch device', () => {
    render(<Host onPick={() => {}} capture="user" />);
    const all = inputs();
    expect(all.length).toBe(2);
    // The FRONT camera for a self-portrait — the whole reason facing is a parameter
    // rather than hardcoded `environment` as it was when only documents used this.
    expect(all[1].getAttribute('capture')).toBe('user');
  });

  it('passes the rear camera through unchanged for a document', () => {
    render(<Host onPick={() => {}} capture="environment" />);
    expect(inputs()[1].getAttribute('capture')).toBe('environment');
  });

  it('gives NO camera handler on a fine-pointer device — absent, not disabled', () => {
    setPointer(false);
    render(<Host onPick={() => {}} capture="user" />);
    expect(document.querySelector('[data-testid=cam]')).toBeNull();
    expect(inputs().length).toBe(1);
  });

  it('reports the picked file', () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    const file = new File(['x'], 'face.jpg', { type: 'image/jpeg' });
    fireEvent.change(inputs()[0], { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });

  it('clears the input after a pick, so re-choosing the SAME file still fires', () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);
    const input = inputs()[0];
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg')] } });
    expect(input.value).toBe('');
  });

  it('opens nothing while disabled — a busy upload must not queue a second one', () => {
    render(<Host onPick={() => {}} disabled />);
    const click = vi.fn();
    inputs()[0].click = click;
    fireEvent.click(document.querySelector('[data-testid=up]')!);
    expect(click).not.toHaveBeenCalled();
  });

  it('clicks the real input when opened — the OS dialog is the platform’s, not an emulation', () => {
    render(<Host onPick={() => {}} />);
    const click = vi.fn();
    inputs()[0].click = click;
    fireEvent.click(document.querySelector('[data-testid=up]')!);
    expect(click).toHaveBeenCalled();
  });
});
