import { describe, expect, it } from 'vitest';
import { ConfigValidationError, validateConfig } from './validate-config';

const KEY = Buffer.alloc(32, 7).toString('base64'); // 32 bytes → valid

const prodEnv = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  JWT_SECRET: KEY,
  TOKEN_ENCRYPTION_KEY: KEY,
  DOC_ENCRYPTION_KEY: KEY,
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://app.example.com/auth/google/callback',
  GOOGLE_MAPS_SERVER_KEY: 'maps-server-key',
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
