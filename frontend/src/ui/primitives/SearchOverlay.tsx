// Generic full-screen search mode (ADR-0101): a reusable shell built on
// `Modal variant="full"` so it inherits the overlay stack (back closes it),
// focus contract, and portal-above-everything behavior for free — the fixed,
// full-viewport modal-overlay already sits above the trip header and bottom
// nav (App.css: `.header` is `position: relative`, `.nav` has no z-index), so
// entering search mode replaces both chrome regions without AppShell/App.tsx
// needing to know search mode exists.
//
// Domain-agnostic: query state and result filtering stay with the caller
// (`children` is the already-filtered, ready-to-render list) — this shell
// only owns the compact top bar, the pinned search field, and the scrollable
// results region. A future document search (or any other "type to filter, on
// a full screen" need) reuses this rather than growing a second one-off.
//
// The top bar reuses the trip header's own mode-tinted chrome identity
// (App.css's `.mode-chrome`/`.chrome-ghost-btn`/`.chrome-chip`, ADR-0028 +
// ADR-0101) — blue in Trip mode, the light "drafting table" re-skin in Plan
// mode — rather than a plain bar of its own, so search mode still reads as
// part of the app instead of a foreign white overlay.
import { useRef, type ReactNode } from 'react';
import { Modal } from './Modal';
import { NavArrow } from '../NavArrow';
import { SearchField } from './SearchField';
import type { Mode } from '../../lib/mode';
import './search-overlay.css';

export function SearchOverlay({
  title,
  contextLabel,
  mode,
  query,
  onQueryChange,
  placeholder,
  clearLabel,
  backAria,
  onClose,
  children,
}: {
  /** Compact top-bar label, e.g. "חיפוש הזמנות". */
  title: string;
  /** Optional small context chip beside the title, e.g. the trip name. */
  contextLabel?: string;
  /** Which mode-tint the top bar wears (`useMode()`) — Trip blue or Plan light. */
  mode: Mode;
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  clearLabel: string;
  backAria: string;
  onClose: () => void;
  /** The already-filtered, scrollable results list. */
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Modal variant="full" ariaLabel={title} onClose={onClose} initialFocusRef={inputRef}>
      {/* The visible back control takes the overlay's animated close, so leaving via
          the arrow looks the same as leaving via a system back (ADR-0140) — the same
          "one dismissal, one path" rule that governs the back stack itself. */}
      {(close) => (
        <div className="search-overlay">
          <div className="search-overlay-bar mode-chrome" data-mode={mode}>
            <button
              type="button"
              className="chrome-ghost-btn"
              onClick={close}
              aria-label={backAria}
            >
              <NavArrow variant="back" />
            </button>
            <span className="search-overlay-title">{title}</span>
            {contextLabel && (
              <span className="chrome-chip search-overlay-context">{contextLabel}</span>
            )}
          </div>

          <SearchField
            className="search-overlay-field"
            inputRef={inputRef}
            value={query}
            placeholder={placeholder}
            clearLabel={clearLabel}
            onChange={onQueryChange}
          />

          <div className="search-overlay-results">{children}</div>
        </div>
      )}
    </Modal>
  );
}
