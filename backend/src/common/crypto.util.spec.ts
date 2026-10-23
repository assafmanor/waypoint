import { afterEach, describe, expect, it, vi } from 'vitest';
import { atRestKeys, decryptAtRest, decryptAtRestReportingKey, encryptAtRest } from './crypto.util';

const OLD = Buffer.alloc(32, 1).toString('base64');
const NEW = Buffer.alloc(32, 2).toString('base64');

describe('at-rest key rotation', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads a payload on the previous key and reports it stale', () => {
    const payload = encryptAtRest('secret', OLD, 'K');
    expect(decryptAtRestReportingKey(payload, NEW, 'K', OLD)).toEqual({
      plaintext: 'secret',
      stale: true,
    });
  });

  it('reports a payload already on the current key as current', () => {
    const payload = encryptAtRest('secret', NEW, 'K');
    expect(decryptAtRestReportingKey(payload, NEW, 'K', OLD).stale).toBe(false);
  });

  it('still refuses a payload on an unknown key when no previous key is given', () => {
    const payload = encryptAtRest('secret', OLD, 'K');
    expect(() => decryptAtRest(payload, NEW, 'K')).toThrow();
  });

  it('makes _NEXT current and the plain var previous while they differ', () => {
    vi.stubEnv('K', OLD);
    vi.stubEnv('K_NEXT', NEW);
    expect(atRestKeys('K', 'K_NEXT')).toEqual({ name: 'K_NEXT', current: NEW, previous: OLD });
  });

  it('treats a leftover _NEXT equal to the plain var as no rotation', () => {
    vi.stubEnv('K', NEW);
    vi.stubEnv('K_NEXT', NEW);
    expect(atRestKeys('K', 'K_NEXT')).toEqual({ name: 'K', current: NEW });
  });
});
