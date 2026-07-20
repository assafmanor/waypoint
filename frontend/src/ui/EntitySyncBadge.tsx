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
