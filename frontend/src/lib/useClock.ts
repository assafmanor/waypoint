import { useEffect, useRef, useState } from 'react';
import { DEMO_NOW } from '../fixtures';
import { CLOCK_TICK_MS } from '../constants';

// ponytail: demo clock anchored to the fixture's "now", advanced by real elapsed
// time so the clock/countdown tick. The real build swaps DEMO_NOW for Date.now().
export function useClock(intervalMs = CLOCK_TICK_MS): Date {
  const start = useRef(Date.now());
  const [now, setNow] = useState(() => DEMO_NOW);
  useEffect(() => {
    const id = setInterval(
      () => setNow(new Date(DEMO_NOW.getTime() + (Date.now() - start.current))),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
