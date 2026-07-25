// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Place, PlacePrediction } from '@waypoint/shared';

// The shared search core is mocked so these tests can assert the ONE thing this
// shell owns: that nothing is fed to the core — and therefore nothing is billed —
// until the user arms Google (ADR-0115 §1). The core's own behaviour (session
// token, debounce, dedup, 429) is tested in lib/usePlaceSearch.test.ts.
const setQuery = vi.fn();
const pick = vi.fn();
const reset = vi.fn();
let predictions: PlacePrediction[] = [];
let referenced: Record<string, Place> = {};
let loading = false;
let rateLimited = false;
let active = true;

vi.mock('../lib/usePlaceSearch', () => ({
  usePlaceSearch: () => ({
    query: '',
    setQuery,
    predictions,
    loading,
    rateLimited,
    failed: false,
    active,
    alreadyInTrip: (p: PlacePrediction) => referenced[p.googlePlaceId],
    pick,
    saveNameOnly: vi.fn(),
    reset,
  }),
}));

const addMaybe = vi.fn();
vi.mock('../state/verbs', () => ({ useVerbs: () => ({ addMaybe }) }));

import { PlaceResearch } from './PlaceResearch';
import type { PlaceUsage } from '../lib/place-usage';
import { t } from '../i18n/he';

const prediction = (id: string, primary: string, secondary?: string): PlacePrediction => ({
  googlePlaceId: id,
  primaryText: primary,
  secondaryText: secondary,
});

const place = (id: string): Place =>
  ({ id, tripId: 't1', name: id, googlePlaceId: `g-${id}` }) as Place;

const usage = (entries: [string, boolean][]): Map<string, PlaceUsage> =>
  new Map(entries.map(([id, isMaybe]) => [id, { placeId: id, isMaybe } as PlaceUsage]));

const view = (props: { query: string; offline?: boolean; usageIndex?: Map<string, PlaceUsage> }) =>
  render(
    <PlaceResearch
      query={props.query}
      offline={props.offline ?? false}
      usageIndex={props.usageIndex ?? new Map()}
    />,
  );

const arm = () => fireEvent.click(screen.getByRole('button', { name: t.map.research.armAria }));

describe('PlaceResearch (Phase 5, ADR-0115)', () => {
  beforeEach(() => {
    predictions = [];
    referenced = {};
    loading = false;
    rateLimited = false;
    active = true;
  });
  afterEach(() => {
    cleanup();
    setQuery.mockClear();
    pick.mockClear();
    reset.mockClear();
    addMaybe.mockClear();
  });

  it('nothing typed → nothing offered, and nothing reaches the paid core', () => {
    view({ query: '  ' });
    expect(screen.queryByRole('button', { name: t.map.research.armAria })).toBeNull();
    expect(setQuery).not.toHaveBeenCalledWith('  ');
  });

  it('a typed query offers the arm but spends nothing until it is tapped', () => {
    view({ query: 'teamLab' });
    expect(screen.getByRole('button', { name: t.map.research.armAria })).toBeTruthy();
    // The core is never handed the query before the user asks for Google — this is
    // the whole point of arming (money, not polish).
    expect(setQuery).not.toHaveBeenCalledWith('teamLab');
  });

  it('arming feeds the same query to the shared core, and only then', () => {
    view({ query: 'teamLab' });
    arm();
    expect(setQuery).toHaveBeenCalledWith('teamLab');
  });

  it('a result says its name and address, and nothing it does not have', () => {
    predictions = [prediction('g-1', 'teamLab Borderless', 'Azabudai Hills, Tokyo')];
    view({ query: 'teamLab' });
    arm();
    expect(screen.getByText('teamLab Borderless')).toBeTruthy();
    expect(screen.getByText('Azabudai Hills, Tokyo')).toBeTruthy();
    // No ★ (an Enterprise field we don't fetch, ADR-0111) and no distance (a
    // prediction has no coordinates) — ADR-0115 §2.
    expect(document.body.textContent).not.toContain('★');
    expect(document.querySelector('.map-dist')).toBeNull();
    // The name links out to the Google place so a candidate can be vetted for free.
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('query_place_id=g-1');
  });

  it('＋ אולי resolves the place once, then shelves an idea referencing it', async () => {
    predictions = [prediction('g-1', 'teamLab Borderless')];
    pick.mockResolvedValue(place('p1'));
    view({ query: 'teamLab' });
    arm();
    fireEvent.click(
      screen.getByRole('button', { name: t.map.research.addAria('teamLab Borderless') }),
    );
    await waitFor(() => expect(addMaybe).toHaveBeenCalled());
    expect(pick).toHaveBeenCalledTimes(1);
    expect(addMaybe).toHaveBeenCalledWith('teamLab Borderless', { placeId: 'p1' });
    // Uncategorised on purpose: category is captured when the idea is scheduled.
    expect(addMaybe.mock.calls[0][1].category).toBeUndefined();
  });

  it('a result already on the shelf is stated, not re-addable', () => {
    predictions = [prediction('g-p1', 'teamLab Planets')];
    referenced = { 'g-p1': place('p1') };
    view({ query: 'teamLab', usageIndex: usage([['p1', true]]) });
    arm();
    expect(screen.getByText(t.map.research.onShelf)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /אולי/ })).toBeNull();
  });

  it('a result referenced by something else says it is already in the trip', () => {
    predictions = [prediction('g-p2', 'Afuri Ramen')];
    referenced = { 'g-p2': place('p2') };
    view({ query: 'afuri', usageIndex: usage([['p2', false]]) });
    arm();
    expect(screen.getByText(t.map.research.inTrip)).toBeTruthy();
  });

  it('offline the Google half is absent, not disabled', () => {
    view({ query: 'teamLab', offline: true });
    expect(screen.queryByRole('button', { name: t.map.research.armAria })).toBeNull();
    expect(screen.getByText(t.map.research.offline)).toBeTruthy();
  });

  it('a rate limit is a soft banner, not an error', () => {
    rateLimited = true;
    predictions = [prediction('g-1', 'teamLab Borderless')];
    view({ query: 'teamLab' });
    arm();
    expect(screen.getByText(t.placePicker.rateLimited)).toBeTruthy();
    expect(screen.getByText('teamLab Borderless')).toBeTruthy();
  });

  it('armed but under the min-chars floor says so instead of showing a bare header', () => {
    active = false;
    view({ query: 't' });
    arm();
    expect(screen.getByText(t.map.research.typeMore)).toBeTruthy();
    expect(screen.queryByText(t.map.research.noResults)).toBeNull();
  });

  it('no Google match says so', () => {
    view({ query: 'zzzz' });
    arm();
    expect(screen.getByText(t.map.research.noResults)).toBeTruthy();
  });

  it('closing the surface retires the session token', () => {
    const { unmount } = view({ query: 'teamLab' });
    arm();
    unmount();
    expect(reset).toHaveBeenCalled();
  });
});
