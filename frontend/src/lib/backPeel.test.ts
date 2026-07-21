import { describe, expect, it, vi } from 'vitest';
import { peelBack } from './backPeel';

describe('peelBack', () => {
  it('runs reset instead of close when isModified is true', () => {
    const reset = vi.fn();
    const close = vi.fn();
    peelBack(true, reset, close);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('runs close instead of reset when isModified is false', () => {
    const reset = vi.fn();
    const close = vi.fn();
    peelBack(false, reset, close);
    expect(close).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});
