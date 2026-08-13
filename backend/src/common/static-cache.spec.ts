import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { IMMUTABLE, REVALIDATE, setStaticCacheHeaders } from './static-cache';

function headerFor(filePath: string): string {
  const set = vi.fn();
  setStaticCacheHeaders({ setHeader: set } as unknown as ServerResponse, filePath);
  expect(set).toHaveBeenCalledTimes(1);
  return set.mock.calls[0][1] as string;
}

describe('static cache headers', () => {
  it('lets a fingerprinted asset be kept forever', () => {
    expect(headerFor(join('/app', 'public', 'assets', 'index-a1b2c3.js'))).toBe(IMMUTABLE);
    expect(headerFor(join('/app', 'public', 'assets', 'Assistant-9f8e.woff2'))).toBe(IMMUTABLE);
  });

  it('makes the shell and the worker revalidate — they name the hashes', () => {
    expect(headerFor(join('/app', 'public', 'index.html'))).toBe(REVALIDATE);
    expect(headerFor(join('/app', 'public', 'sw.js'))).toBe(REVALIDATE);
    expect(headerFor(join('/app', 'public', 'manifest.webmanifest'))).toBe(REVALIDATE);
  });

  it('is not fooled by "assets" appearing anywhere but the directory', () => {
    expect(headerFor(join('/app', 'public', 'assets.html'))).toBe(REVALIDATE);
    expect(headerFor(join('/app', 'my-assets', 'thing.js'))).toBe(REVALIDATE);
  });
});
