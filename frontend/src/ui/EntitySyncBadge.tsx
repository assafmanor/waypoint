// EntitySyncBadge — the connected per-entity sync marker (ADR-0080/0091). Reads
// this entity's status from the outbox and renders the presentational SyncBadge,
// so no screen repeats the `useSyncStatus + SyncBadge` wiring. It also owns the
// ONE cross-surface policy: **synced is silent everywhere** — the badge is an
// exception indicator that appears only for `pending`/`failed`, on lists and the
// timeline alike. The `pending → (gone)` transition is itself the "it saved"
// signal; a permanent failure still surfaces here and in the header summary.
//
// Lives at the ui/ root (not ui/domain/ or ui/feedback/): it depends on the
// outbox data hook, so it isn't a pure presentational primitive.
import { useSyncStatus } from '../lib/outbox';
import { SyncBadge } from './feedback';

export function EntitySyncBadge({ id, showSynced = false }: { id: string; showSynced?: boolean }) {
  const { state, reason } = useSyncStatus(id);
  // Steady state is silent — the badge earns its space only as an exception.
  // `showSynced` is the escape hatch if a surface ever wants the persistent ✓.
  if (state === 'synced' && !showSynced) return null;
  return <SyncBadge state={state} reason={reason} />;
}

// Whether this entity has a write in transit — a queued (`pending`) op not yet
// confirmed by the server. Drives the "unsynced" dimming (ADR-0092): a row/card
// with a pending write reads as provisional (~0.6 opacity). `failed` is
// deliberately NOT dimmed — a rejected write must stay prominent (its
// `cloud-bang` + the header review sheet call for action, they mustn't recede).
// The badge (via useSyncStatus) is the state signal; this is the same read for
// the container's opacity, so both derive from one source.
export function useUnsynced(id: string): boolean {
  return useSyncStatus(id).state === 'pending';
}
