// The server's Web Push identity (ADR-0197 §1), read in one place.
//
// Two callers want different things from the same three variables and neither should read
// `process.env` itself (`backend/CLAUDE.md`): the sender needs all three or it cannot send,
// and `/me` needs only the public half and must answer for a server that has none.
import { requireEnv, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '../common/env';

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** All three, or a throw naming the missing variable. Read at call time rather than at
 *  boot for the reason `GOOGLE_MAPS_SERVER_KEY` is: a dev box without keys still boots,
 *  and only a send fails. `validateConfig` is what makes that impossible in production. */
export function requireVapid(): VapidDetails {
  return {
    subject: requireEnv(VAPID_SUBJECT),
    publicKey: requireEnv(VAPID_PUBLIC_KEY),
    privateKey: requireEnv(VAPID_PRIVATE_KEY),
  };
}

/** The public half for `/me`, or `null` when this server holds no keypair.
 *
 *  **`null` is a state the client is entitled to, not an error**: it is what lets a
 *  settings surface say "this server cannot send notifications" instead of offering a
 *  control that fails on press (ADR-0197 §7, and the rule ADR-0180 §4 states for a
 *  refresh that could not change anything). */
export function vapidPublicKeyOrNull(): string | null {
  return process.env[VAPID_PUBLIC_KEY] || null;
}
