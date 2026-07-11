import { useEffect, useState } from 'react';
import { CLOCK_TICK_MS } from '../constants';

const DEV_NOW_KEY = 'waypoint:dev-now';
// ponytail: guards module-load in environments without localStorage (SSR, node test runner).
const hasStorage = typeof localStorage !== 'undefined';

// ponytail: dev-only override (compiled out of behavior in prod via import.meta.env.DEV).
// `null` means "use the real wall clock".
let simulatedNow: number | null =
  import.meta.env.DEV && hasStorage && localStorage.getItem(DEV_NOW_KEY)
    ? Number(localStorage.getItem(DEV_NOW_KEY))
    : null;

const listeners = new Set<() => void>();

export function getSimulatedNow(): number | null {
  return simulatedNow;
}

export function setSimulatedNow(ms: number | null): void {
  simulatedNow = ms;
  if (hasStorage) {
    if (ms === null) localStorage.removeItem(DEV_NOW_KEY);
    else localStorage.setItem(DEV_NOW_KEY, String(ms));
  }
  listeners.forEach((notify) => notify());
}

function getNow(): number {
  return simulatedNow ?? Date.now();
}

export function useClock(intervalMs = CLOCK_TICK_MS): Date {
  const [now, setNow] = useState(() => new Date(getNow()));
  useEffect(() => {
    const tick = () => setNow((prev) => (prev.getTime() === getNow() ? prev : new Date(getNow())));
    tick();
    const id = setInterval(tick, intervalMs);
    listeners.add(tick);
    return () => {
      clearInterval(id);
      listeners.delete(tick);
    };
  }, [intervalMs]);
  return now;
}
