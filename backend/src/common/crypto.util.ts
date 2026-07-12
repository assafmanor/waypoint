import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM at rest, shared shape for Google refresh tokens (ADR-0020) and,
// later, documents (ADR-0015) — each caller supplies its own key/env var so the
// two keep separate blast radii.
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

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

export function decryptAtRest(payload: string, keyB64: string, envVarName: string): string {
  const key = loadKey(keyB64, envVarName);
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
