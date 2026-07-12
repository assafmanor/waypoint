import { useState, type CSSProperties } from 'react';
import { getSimulatedNow, setSimulatedNow } from '../lib/useClock';

// ponytail: dev-only — App.tsx only mounts this when import.meta.env.DEV.
// Collapsed to a small corner badge so it never covers the bottom nav or
// content; only expands into the picker on tap.
export function DevTimeTravel() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toInputValue(getSimulatedNow()));
  const traveling = value !== '';

  const apply = (v: string) => {
    setValue(v);
    setSimulatedNow(v ? new Date(v).getTime() : null);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={badgeStyle(traveling)}>
        🕓
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <input type="datetime-local" value={value} onChange={(e) => apply(e.target.value)} />
      {traveling && (
        <button type="button" onClick={() => apply('')}>
          real time
        </button>
      )}
      <button type="button" onClick={() => setOpen(false)} aria-label="close time travel">
        ×
      </button>
    </div>
  );
}

function toInputValue(ms: number | null): string {
  if (ms === null) return '';
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const basePosition: CSSProperties = {
  position: 'fixed',
  top: 8,
  insetInlineEnd: 8,
  zIndex: 9999,
};

function badgeStyle(traveling: boolean): CSSProperties {
  return {
    ...basePosition,
    width: 26,
    height: 26,
    borderRadius: '50%',
    border: 0,
    fontSize: 13,
    lineHeight: '26px',
    padding: 0,
    background: traveling ? '#e07a1f' : 'rgba(0, 0, 0, 0.35)',
    color: '#fff',
    opacity: traveling ? 1 : 0.55,
  };
}

const panelStyle: CSSProperties = {
  ...basePosition,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px',
  borderRadius: 6,
  background: 'rgba(0, 0, 0, 0.8)',
  color: '#fff',
  fontSize: 12,
};
