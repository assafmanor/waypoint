import { describe, expect, it } from 'vitest';
import { anniversaryYears } from './anniversary';

describe('anniversaryYears', () => {
  it('counts whole years on the same month and day', () => {
    expect(anniversaryYears('2025-09-23', '2026-09-23')).toBe(1);
    expect(anniversaryYears('2023-09-23', '2026-09-23')).toBe(3);
  });

  it('is no anniversary on any other day, or in the first year', () => {
    expect(anniversaryYears('2025-09-23', '2026-09-24')).toBeUndefined();
    expect(anniversaryYears('2026-09-23', '2026-09-23')).toBeUndefined();
    expect(anniversaryYears('2027-09-23', '2026-09-23')).toBeUndefined();
  });

  it('keeps February 29 on February 28 in a common year, and on the 29th in a leap one', () => {
    expect(anniversaryYears('2024-02-29', '2025-02-28')).toBe(1);
    expect(anniversaryYears('2024-02-29', '2028-02-28')).toBeUndefined();
    expect(anniversaryYears('2024-02-29', '2028-02-29')).toBe(4);
    expect(anniversaryYears('2025-02-28', '2028-02-28')).toBe(3);
  });
});
