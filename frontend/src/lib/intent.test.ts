import { describe, expect, it } from 'vitest';
import { consumeIntent, saveIntent } from './intent';

// No jsdom in this repo (see other lib/*.test.ts) — a plain Map-backed fake
// standing in for the Storage interface is enough to exercise the logic.
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => void map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe('deep-link intent', () => {
  it('round-trips a saved path', () => {
    const storage = fakeStorage();
    saveIntent('/join/abc123', storage);
    expect(consumeIntent(storage)).toBe('/join/abc123');
  });

  it('is one-shot — consuming clears it', () => {
    const storage = fakeStorage();
    saveIntent('/join/abc123', storage);
    consumeIntent(storage);
    expect(consumeIntent(storage)).toBeNull();
  });

  it('is null when nothing was saved', () => {
    expect(consumeIntent(fakeStorage())).toBeNull();
  });
});
