// Per-entity sync marker (U-04, ADR-0080; cloud iconography ADR-0091). A small,
// non-color-coded affordance telling the user whether THIS entity is synced /
// pending / failed — so "did my booking actually save?" is answerable per item,
// not only via a global badge. Legible without color: each state is a distinct
// cloud SHAPE (check / up-arrow / "!") plus an accessible name (aria-label +
// title). Not a live region itself — a list has many badges; the single polite
// announcement of a failure lives in the header summary (App.tsx). Colors come
// only from the Wave-0 sync tokens (--sync-*), never the amber/teal/plan budget.
//
// Presentational: it renders whatever state it's given. The "synced is silent"
// policy lives one layer up in EntitySyncBadge, so this stays a pure mapping.
import type { SyncState } from '../../lib/outbox';
import { Icon } from '../Icon';
import { t } from '../../i18n/he';

// Distinct cloud shapes, not just color: ✓ committed · ↑ queued/in-flight · ! rejected.
const ICON = {
  synced: 'cloud-check',
  pending: 'cloud-up',
  failed: 'cloud-bang',
} as const;

export function SyncBadge({ state, reason }: { state: SyncState; reason?: string }) {
  // `reason` (the server code) is intentionally not shown inline — the label
  // stays legible; the code surfaces in the review sheet. Kept in the signature
  // so callers can pass a full SyncStatus without stripping it.
  void reason;
  const label = t.sync.badge[state];
  return (
    <span className={`sync-badge sync-badge-${state}`} role="img" aria-label={label} title={label}>
      <Icon name={ICON[state]} className="sync-badge-glyph" />
    </span>
  );
}
