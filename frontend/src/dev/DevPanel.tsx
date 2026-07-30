import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';

// The shape both dev affordances share (ADR-0146, extracted from `DevTimeTravel`): a
// small corner badge that expands into a panel on tap, inline styles so it drags no app
// CSS along, mounted only under `import.meta.env.DEV` by its host.
//
// Collapsed to a badge for the reason `DevTimeTravel` gave: so it never covers the bottom
// nav or the content. `slot` is what makes a SECOND one safe — the shell owns the corner
// geometry, so two badges stack instead of landing on top of each other.

export interface DevPanelProps {
  icon: IconName;
  /** Badge tinted and opaque while the tool is doing something, so a tuning left on is
   *  visible without opening anything. */
  active?: boolean;
  /** Vertical position in badge slots down from the top corner. */
  slot?: number;
  label: string;
  /** A column body gets the label and the close in a header row above it; a row body —
   *  the time picker's one field — keeps them inline, which is how it shipped. */
  column?: boolean;
  children: ReactNode;
}

const BADGE_PX = 26;
const BADGE_GAP_PX = 6;

export function DevPanel({
  icon,
  active = false,
  slot = 0,
  label,
  column = false,
  children,
}: DevPanelProps) {
  const [open, setOpen] = useState(false);
  const close = (
    <button type="button" onClick={() => setOpen(false)} aria-label={`close ${label}`}>
      ×
    </button>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        style={badgeStyle(active, slot)}
      >
        <Icon name={icon} />
      </button>
    );
  }

  // The positioned box keeps the document's direction, so `insetInlineEnd` still puts the
  // badge in the corner `DevTimeTravel` has always used. The CONTENT is `dir="ltr"`: these
  // panels are English, and mirrored, a `− 14 +` stepper column reads backwards and the
  // emitted block is unreadable. Allowlisted in `eslint.config.mjs` for this tree, with the
  // ADR-0118 reasoning — not routed around silently.
  return (
    <div style={basePosition(slot)}>
      {column ? (
        <div dir="ltr" style={{ ...panelStyle, width: 232, maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={headerStyle}>
            <strong>{label}</strong>
            {close}
          </div>
          {children}
        </div>
      ) : (
        <div dir="ltr" style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          {children}
          {close}
        </div>
      )}
    </div>
  );
}

function basePosition(slot: number): CSSProperties {
  return {
    position: 'fixed',
    top: 8 + slot * (BADGE_PX + BADGE_GAP_PX),
    insetInlineEnd: 8,
    zIndex: 9999,
  };
}

function badgeStyle(active: boolean, slot: number): CSSProperties {
  return {
    ...basePosition(slot),
    width: BADGE_PX,
    height: BADGE_PX,
    borderRadius: '50%',
    border: 0,
    fontSize: 13,
    lineHeight: `${BADGE_PX}px`,
    padding: 0,
    background: active ? '#e07a1f' : 'rgba(0, 0, 0, 0.35)',
    color: '#fff',
    opacity: active ? 1 : 0.55,
  };
}

const panelStyle: CSSProperties = {
  padding: '4px 6px',
  borderRadius: 6,
  background: 'rgba(0, 0, 0, 0.85)',
  color: '#fff',
  fontSize: 12,
  // The sitting happens with a thumb on a canvas; the panel must not eat the pan it is
  // sitting over any more than its own box.
  touchAction: 'manipulation',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  paddingBottom: 2,
};
