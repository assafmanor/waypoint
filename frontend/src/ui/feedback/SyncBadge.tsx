// Per-entity sync marker (U-04, ADR-0080). A small, non-color-coded affordance
// on a row/card telling the user whether THIS entity is synced / pending / failed
// — so "did my booking actually save?" is answerable per item, not only via a
// global badge. Legible without color: each state has a distinct glyph SHAPE plus
// an accessible name (aria-label + title). Not a live region itself — a list has
// many badges; the single polite announcement of a failure lives in the header
// summary (App.tsx). Colors come only from the Wave-0 sync tokens.
import type { SyncState } from '../../lib/outbox';
import { t } from '../../i18n/he';

// Distinct shapes, not just color: ✓ committed · ↑ queued/in-flight · ! rejected.
const GLYPH: Record<SyncState, string> = {
  synced: '✓',
  pending: '↑',
  failed: '!',
};

export function SyncBadge({ state, reason }: { state: SyncState; reason?: string }) {
  // `reason` (the server code) is intentionally not shown inline — the label
  // stays legible; the code surfaces in the review sheet. Kept in the signature
  // so callers can pass a full SyncStatus without stripping it.
  void reason;
  const label = t.sync.badge[state];
  return (
    <span className={`sync-badge sync-badge-${state}`} role="img" aria-label={label} title={label}>
      <span className="sync-badge-glyph" aria-hidden="true">
        {GLYPH[state]}
      </span>
    </span>
  );
}
