import { describe, expect, it } from 'vitest';
import { dayTime } from './BookingDetail';

// The UI is Hebrew-only: displayed booking dates must render in he-IL
// regardless of the device locale (which only drives native date inputs).
describe('dayTime', () => {
  const iso = '2026-07-18T09:30:00Z';
  const tz = 'Asia/Jerusalem';

  it('renders in Hebrew (no Latin letters), independent of device locale', () => {
    const out = dayTime(iso, tz);
    expect(out).toMatch(/[֐-׿]/); // contains Hebrew
    expect(out).not.toMatch(/[A-Za-z]/); // no English month/weekday
  });
});
