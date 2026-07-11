import { useState, type CSSProperties } from 'react';
import { getSimulatedNow, setSimulatedNow } from '../lib/useClock';

// ponytail: dev-only — App.tsx only mounts this when import.meta.env.DEV.
export function DevTimeTravel() {
  const [value, setValue] = useState(() => toInputValue(getSimulatedNow()));

  const apply = (v: string) => {
    setValue(v);
    setSimulatedNow(v ? new Date(v).getTime() : null);
  };

  return (
    <div style={panelStyle}>
      <span>🕓</span>
      <input type="datetime-local" value={value} onChange={(e) => apply(e.target.value)} />
      {value && (
        <button type="button" onClick={() => apply('')}>
          real time
        </button>
      )}
    </div>
  );
}

function toInputValue(ms: number | null): string {
  if (ms === null) return '';
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  insetInlineStart: 0,
  bottom: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  background: 'rgba(0, 0, 0, 0.75)',
  color: '#fff',
  fontSize: 12,
};
