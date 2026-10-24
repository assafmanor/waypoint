import { describe, expect, it } from 'vitest';
import { ConfigValidationError, validateConfig } from './validate-config';

const KEY = Buffer.alloc(32, 7).toString('base64'); // 32 bytes → valid

// A VAPID keypair, sized as the real ones are (ADR-0197 §1): the public half is an
// uncompressed P-256 point (65 bytes), the private half a 32-byte scalar. Base64URL, which
// is how every generator emits them — and the size difference is what lets a swapped pair
// be caught at boot.
const VAPID_PUB = Buffer.alloc(65, 4).toString('base64url');
const VAPID_PRIV = Buffer.alloc(32, 9).toString('base64url');

const prodEnv = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: KEY,
  TOKEN_ENCRYPTION_KEY: KEY,
  DOC_ENCRYPTION_KEY: KEY,
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://app.example.com/auth/google/callback',
  FRONTEND_URL: 'https://app.example.com',
  GOOGLE_MAPS_SERVER_KEY: 'maps-server-key',
  VAPID_PUBLIC_KEY: VAPID_PUB,
  VAPID_PRIVATE_KEY: VAPID_PRIV,
  VAPID_SUBJECT: 'mailto:ops@example.com',
  ...over,
});

describe('validateConfig (B-04)', () => {
  it('passes a well-formed production config', () => {
    expect(() => validateConfig(prodEnv())).not.toThrow();
  });

  it('refuses to boot when DEV_AUTH=1 in production', () => {
    expect(() => validateConfig(prodEnv({ DEV_AUTH: '1' }))).toThrow(ConfigValidationError);
  });

  it('allows DEV_AUTH=1 outside production', () => {
    expect(() =>
      validateConfig({ NODE_ENV: 'development', DEV_AUTH: '1', JWT_SECRET: KEY }),
    ).not.toThrow();
  });

  it('rejects a missing key in production', () => {
    expect(() => validateConfig(prodEnv({ JWT_SECRET: undefined }))).toThrow(
      /JWT_SECRET is required/,
    );
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    expect(() => validateConfig(prodEnv({ DOC_ENCRYPTION_KEY: 'too-short' }))).toThrow(
      /DOC_ENCRYPTION_KEY must be base64/,
    );
  });

  it('rejects a missing Places server key in production (ADR-0108)', () => {
    expect(() => validateConfig(prodEnv({ GOOGLE_MAPS_SERVER_KEY: undefined }))).toThrow(
      /GOOGLE_MAPS_SERVER_KEY is required/,
    );
  });

  it('rejects a malformed redirect URL', () => {
    expect(() => validateConfig(prodEnv({ GOOGLE_OAUTH_REDIRECT_URI: 'not a url' }))).toThrow(
      /valid URL/,
    );
  });

  it('rejects a missing FRONTEND_URL in production (login would land on localhost)', () => {
    expect(() => validateConfig(prodEnv({ FRONTEND_URL: undefined }))).toThrow(
      /FRONTEND_URL is required/,
    );
  });

  it('rejects a www./apex split between the callback host and the app host (ADR-0169)', () => {
    expect(() =>
      validateConfig(
        prodEnv({ GOOGLE_OAUTH_REDIRECT_URI: 'https://www.app.example.com/auth/google/callback' }),
      ),
    ).toThrow(/must name the same host/);
  });

  it('allows the two to differ in path and scheme case, only the host is compared', () => {
    expect(() =>
      validateConfig(prodEnv({ FRONTEND_URL: 'https://APP.example.com/' })),
    ).not.toThrow();
  });

  it('does not require FRONTEND_URL outside production', () => {
    expect(() => validateConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('rejects a bad key format even in dev (when present)', () => {
    expect(() => validateConfig({ NODE_ENV: 'development', JWT_SECRET: 'nope' })).toThrow(
      ConfigValidationError,
    );
  });

  it('never includes a secret value in the error message', () => {
    try {
      validateConfig(prodEnv({ DOC_ENCRYPTION_KEY: 'super-secret-but-invalid' }));
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('super-secret-but-invalid');
    }
  });
});

// The Web Push keypair (ADR-0197 §1). Two rules the other secrets do not have: a PARTIAL
// keypair is a problem in every environment, and the halves are size-checked so the
// copy-paste that swaps them fails at boot rather than at the first send.
describe('validateConfig — VAPID (ADR-0197)', () => {
  it('requires all three in production', () => {
    for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const) {
      expect(() => validateConfig(prodEnv({ [name]: undefined }))).toThrow(
        new RegExp(`${name} is required`),
      );
    }
  });

  it('allows all three absent outside production', () => {
    expect(() => validateConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('refuses a PARTIAL keypair outside production, where absence is otherwise fine', () => {
    // The failure this catches is the quiet one: subscribing succeeds against a public key
    // and the send 401s later, when nobody is watching a log.
    expect(() => validateConfig({ NODE_ENV: 'development', VAPID_PUBLIC_KEY: VAPID_PUB })).toThrow(
      /must be set together/,
    );
    expect(() =>
      validateConfig({ NODE_ENV: 'development', VAPID_PRIVATE_KEY: VAPID_PRIV }),
    ).toThrow(/must be set together/);
    expect(() =>
      validateConfig({ NODE_ENV: 'development', VAPID_SUBJECT: 'mailto:a@b.c' }),
    ).toThrow(/must be set together/);
  });

  it('catches the two keys swapped, in either direction', () => {
    expect(() =>
      validateConfig(prodEnv({ VAPID_PUBLIC_KEY: VAPID_PRIV, VAPID_PRIVATE_KEY: VAPID_PUB })),
    ).toThrow(/VAPID_PUBLIC_KEY must be base64url that decodes to exactly 65 bytes/);
  });

  it('rejects a key that is not base64url', () => {
    // Standard base64 uses `+` and `/`, which a VAPID key never contains — so this also
    // catches a key pasted from a tool that emitted the wrong alphabet.
    expect(() => validateConfig(prodEnv({ VAPID_PUBLIC_KEY: 'a+b/c=' }))).toThrow(
      /VAPID_PUBLIC_KEY must be base64url/,
    );
  });

  it('rejects a subject that is not mailto: or https:', () => {
    expect(() => validateConfig(prodEnv({ VAPID_SUBJECT: 'ops@example.com' }))).toThrow(
      /VAPID_SUBJECT must be a mailto: or https: URL/,
    );
    expect(() => validateConfig(prodEnv({ VAPID_SUBJECT: 'http://example.com' }))).toThrow(
      /VAPID_SUBJECT must be a mailto: or https: URL/,
    );
    expect(() =>
      validateConfig(prodEnv({ VAPID_SUBJECT: 'https://example.com/contact' })),
    ).not.toThrow();
  });

  it('still checks the format when the keys are optional', () => {
    expect(() =>
      validateConfig({
        NODE_ENV: 'development',
        VAPID_PUBLIC_KEY: VAPID_PUB,
        VAPID_PRIVATE_KEY: 'too-short',
        VAPID_SUBJECT: 'mailto:a@b.c',
      }),
    ).toThrow(/VAPID_PRIVATE_KEY must be base64url/);
  });
});
