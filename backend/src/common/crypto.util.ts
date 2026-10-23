import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  DOC_ENCRYPTION_KEY,
  DOC_ENCRYPTION_KEY_NEXT,
  requireEnv,
  TOKEN_ENCRYPTION_KEY,
  TOKEN_ENCRYPTION_KEY_NEXT,
} from './env';

// AES-256-GCM at rest, shared shape for Google refresh tokens (ADR-0020) and,
// later, documents (ADR-0015) — each caller supplies its own key/env var so the
// two keep separate blast radii.
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** The key to encrypt with, plus the one still accepted for reading mid-rotation. */
export interface AtRestKeys {
  /** The env var `current` came from, for error messages. */
  name: string;
  current: string;
  previous?: string;
}

/**
 * Resolves `name` and its `_NEXT` rotation var. While `nextName` holds a different key it is
 * current and `name` is previous; once a rotation finishes by copying the new key into `name`,
 * a leftover `nextName` equal to it is inert rather than an error.
 */
export function atRestKeys(name: string, nextName: string): AtRestKeys {
  const plain = requireEnv(name);
  const next = process.env[nextName];
  if (!next || next === plain) return { name, current: plain };
  return { name: nextName, current: next, previous: plain };
}

export const googleTokenKeys = (): AtRestKeys =>
  atRestKeys(TOKEN_ENCRYPTION_KEY, TOKEN_ENCRYPTION_KEY_NEXT);
export const documentKeys = (): AtRestKeys =>
  atRestKeys(DOC_ENCRYPTION_KEY, DOC_ENCRYPTION_KEY_NEXT);

function loadKey(keyB64: string, envVarName: string): Buffer {
  if (!keyB64) throw new Error(`${envVarName} not configured`);
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error(`${envVarName} must decode to 32 bytes (base64)`);
  return key;
}

export function encryptAtRest(plaintext: string, keyB64: string, envVarName: string): string {
  const key = loadKey(keyB64, envVarName);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

/** `previousKeyB64` keeps payloads the boot-time re-encryption (`key-rotation/`) has not
 *  reached yet readable during a rotation. */
export function decryptAtRest(
  payload: string,
  keyB64: string,
  envVarName: string,
  previousKeyB64?: string,
): string {
  return decryptAtRestReportingKey(payload, keyB64, envVarName, previousKeyB64).plaintext;
}

/** `stale` means only the previous key opened it, so the payload still wants re-encrypting. */
export function decryptAtRestReportingKey(
  payload: string,
  keyB64: string,
  envVarName: string,
  previousKeyB64?: string,
): { plaintext: string; stale: boolean } {
  const key = loadKey(keyB64, envVarName);
  try {
    return { plaintext: decryptWith(key, payload), stale: false };
  } catch (error) {
    if (!previousKeyB64) throw error;
    const previous = loadKey(previousKeyB64, `previous key for ${envVarName}`);
    return { plaintext: decryptWith(previous, payload), stale: true };
  }
}

function decryptWith(key: Buffer, payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
