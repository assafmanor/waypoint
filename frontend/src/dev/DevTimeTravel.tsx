import { useState } from 'react';
import { getSimulatedNow, setSimulatedNow } from '../lib/useClock';
import { DevPanel } from './DevPanel';

// ponytail: dev-only — App.tsx only mounts this when import.meta.env.DEV.
// The badge/panel shell it used to carry itself is now `DevPanel` (ADR-0146), shared with
// the map's tuning panel — including the reason it is a badge at all: so it never covers
// the bottom nav or the content.
export function DevTimeTravel() {
  const [value, setValue] = useState(() => toInputValue(getSimulatedNow()));
  const traveling = value !== '';

  const apply = (v: string) => {
    setValue(v);
    setSimulatedNow(v ? new Date(v).getTime() : null);
  };

  return (
    <DevPanel icon="clock" label="time travel" active={traveling}>
      <input type="datetime-local" value={value} onChange={(e) => apply(e.target.value)} />
      {traveling && (
        <button type="button" onClick={() => apply('')}>
          real time
        </button>
      )}
    </DevPanel>
  );
}

function toInputValue(ms: number | null): string {
  if (ms === null) return '';
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
