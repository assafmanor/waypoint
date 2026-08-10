import { afterEach, describe, expect, it, vi } from 'vitest';
import { entityIdSchema } from '@waypoint/shared';
import { generateId } from './id';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** What a plain-HTTP LAN host looks like: `getRandomValues` present, `randomUUID` not. */
function stubNonSecureContext(): void {
  const { getRandomValues } = crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: getRandomValues.bind(crypto),
  } as unknown as Crypto);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateId (F-14)', () => {
  it('returns a v4 UUID in a secure context', () => {
    expect(generateId()).toMatch(V4);
  });

  it('still returns a well-formed v4 UUID with no crypto.randomUUID', () => {
    stubNonSecureContext();
    expect(crypto.randomUUID).toBeUndefined();
    expect(generateId()).toMatch(V4);
  });

  it('draws the fallback from getRandomValues, not Math.random', () => {
    stubNonSecureContext();
    const random = vi.spyOn(Math, 'random');
    const bytes = vi.spyOn(crypto, 'getRandomValues');

    generateId();

    expect(bytes).toHaveBeenCalledOnce();
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('does not collide across a large fallback batch', () => {
    stubNonSecureContext();
    const ids = new Set(Array.from({ length: 10_000 }, generateId));
    expect(ids.size).toBe(10_000);
  });

  it('satisfies the server’s entityIdSchema either way (a client id rides the wire)', () => {
    expect(entityIdSchema.safeParse(generateId()).success).toBe(true);
    stubNonSecureContext();
    expect(entityIdSchema.safeParse(generateId()).success).toBe(true);
  });
});
