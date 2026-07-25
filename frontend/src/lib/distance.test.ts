import { describe, expect, it } from 'vitest';
import { formatDistance, haversineMeters } from './distance';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 35.68, lng: 139.76 }, { lat: 35.68, lng: 139.76 })).toBe(0);
  });

  it('measures a known city pair to within a percent (Tel Aviv → Tokyo ≈ 9200 km)', () => {
    const km = haversineMeters({ lat: 32.08, lng: 34.78 }, { lat: 35.68, lng: 139.76 }) / 1000;
    expect(km).toBeGreaterThan(9100);
    expect(km).toBeLessThan(9300);
  });

  it('measures a short walk (~1.1 km along a Tokyo block)', () => {
    const m = haversineMeters({ lat: 35.68, lng: 139.76 }, { lat: 35.69, lng: 139.76 });
    expect(m).toBeGreaterThan(1050);
    expect(m).toBeLessThan(1150);
  });

  it('is symmetric', () => {
    const a = { lat: 32.08, lng: 34.78 };
    const b = { lat: 48.85, lng: 2.35 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe('formatDistance (precision drops as the number grows)', () => {
  it('rounds sub-kilometre distances to a walkable 10 m', () => {
    expect(formatDistance(87)).toBe('90 מ׳');
    expect(formatDistance(342)).toBe('340 מ׳');
    expect(formatDistance(999)).toBe('1000 מ׳');
  });

  it('never rounds a nearby place down to zero', () => {
    expect(formatDistance(0)).toBe('10 מ׳');
    expect(formatDistance(3)).toBe('10 מ׳');
  });

  it('reads one decimal of a kilometre from 1 km', () => {
    expect(formatDistance(1000)).toBe('1 ק״מ');
    expect(formatDistance(1140)).toBe('1.1 ק״מ');
    expect(formatDistance(9550)).toBe('9.6 ק״מ');
  });

  it('drops the decimal past 10 km, where it stops meaning anything', () => {
    expect(formatDistance(11_600)).toBe('12 ק״מ');
    expect(formatDistance(9_200_000)).toBe('9200 ק״מ');
  });
});
