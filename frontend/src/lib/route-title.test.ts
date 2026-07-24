import { describe, expect, it } from 'vitest';
import { ROUTE_TITLE_ARROW, parseRouteTitle, routeTitle, shortTitleText } from './route-title';

const A = ROUTE_TITLE_ARROW;

describe('routeTitle', () => {
  it('joins origin and destination with the route separator', () => {
    expect(routeTitle('נתב״ג', 'נריטה')).toBe(`נתב״ג ${A} נריטה`);
  });

  it('trims each endpoint', () => {
    expect(routeTitle('  TLV ', ' NRT ')).toBe(`TLV ${A} NRT`);
  });

  it('drops a blank endpoint (no dangling separator)', () => {
    expect(routeTitle('TLV', '')).toBe('TLV');
    expect(routeTitle('', 'NRT')).toBe('NRT');
  });

  it('is empty when both endpoints are blank (so the sheet demands a route)', () => {
    expect(routeTitle('  ', '')).toBe('');
  });
});

describe('parseRouteTitle', () => {
  it('round-trips a title routeTitle built', () => {
    expect(
      parseRouteTitle(routeTitle('נמל התעופה בן גוריון', 'נמל התעופה הבינלאומי קפלאוויק')),
    ).toEqual({
      from: 'נמל התעופה בן גוריון',
      to: 'נמל התעופה הבינלאומי קפלאוויק',
    });
  });

  it('is null for a hand-typed title', () => {
    expect(parseRouteTitle('ארוחת ערב')).toBeNull();
    expect(parseRouteTitle('')).toBeNull();
  });

  it('is null for a half route (one endpoint, no separator)', () => {
    expect(parseRouteTitle(routeTitle('TLV', ''))).toBeNull();
  });

  it('needs the separator padded, so an arrow inside a name is not a route', () => {
    expect(parseRouteTitle(`ANA · TLV${A}HND`)).toBeNull();
  });

  it('is null for more than two endpoints (never something we wrote)', () => {
    expect(parseRouteTitle(`TLV ${A} FRA ${A} NRT`)).toBeNull();
  });
});

describe('shortTitleText', () => {
  it('shortens both endpoints of a route title', () => {
    const stored = routeTitle('נמל התעופה בן גוריון', 'נמל התעופה הבינלאומי קפלאוויק');
    expect(shortTitleText(stored)).toBe(`בן גוריון ${A} קפלאוויק`);
  });

  it('leaves a non-route title alone', () => {
    expect(shortTitleText('ארוחת ערב')).toBe('ארוחת ערב');
  });

  it('leaves an unshortenable route alone (fails to "no change")', () => {
    expect(shortTitleText(`TLV ${A} NRT`)).toBe(`TLV ${A} NRT`);
  });
});
