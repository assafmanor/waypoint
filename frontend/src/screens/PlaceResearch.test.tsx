// @vitest-environment jsdom
//
// The ROWS of Google's half. Since ADR-0132 §7 this component is presentational — the
// screen owns the search (its results are also rings on the canvas) and the add — so what
// is asserted here is what a result ROW says, and the moved behaviour (feeding the query,
// retiring the search, the add itself) is asserted in `Map.embedded.test.tsx` where it now
// lives. The core's own behaviour (floor, debounce, dedup, 429) stays in
// `lib/usePlaceSearch.test.ts`.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DeliveredImageValue, Place, PlaceResult } from '@waypoint/shared';

import { PlaceResearch } from './PlaceResearch';
import type { UsePlaceSearch } from '../lib/usePlaceSearch';
import type { PlaceSummary } from '../lib/place-summary';
import { t } from '../i18n/he';

const result = (id: string, primary: string, secondary?: string): PlaceResult => ({
  googlePlaceId: id,
  primaryText: primary,
  secondaryText: secondary,
});

const place = (id: string): Place =>
  ({ id, tripId: 't1', name: id, googlePlaceId: `g-${id}` }) as Place;

const onAdd = vi.fn();
const onShow = vi.fn();

function view(opts: {
  predictions?: PlaceResult[];
  referenced?: Record<string, Place>;
  loading?: boolean;
  rateLimited?: boolean;
  active?: boolean;
  offline?: boolean;
  selectedId?: string | null;
  chooseMode?: boolean;
  addingId?: string | null;
  selectedKnowledge?: { image?: DeliveredImageValue; summary?: PlaceSummary };
}) {
  const search = {
    query: '',
    setQuery: vi.fn(),
    predictions: opts.predictions ?? [],
    loading: opts.loading ?? false,
    rateLimited: opts.rateLimited ?? false,
    failed: false,
    active: opts.active ?? true,
    alreadyInTrip: (p: { googlePlaceId: string }) => (opts.referenced ?? {})[p.googlePlaceId],
    pick: vi.fn(),
    saveNameOnly: vi.fn(),
    reset: vi.fn(),
  } satisfies UsePlaceSearch;
  return render(
    <PlaceResearch
      search={search}
      offline={opts.offline ?? false}
      selectedId={opts.selectedId ?? null}
      chooseMode={opts.chooseMode ?? false}
      selectedKnowledge={opts.selectedKnowledge}
      addingId={opts.addingId ?? null}
      addFailed={false}
      onShow={onShow}
      onAdd={onAdd}
    />,
  );
}

describe('PlaceResearch (Phase 5, ADR-0115; presentational since ADR-0132)', () => {
  afterEach(() => {
    cleanup();
    onAdd.mockClear();
    onShow.mockClear();
  });

  // ── THE ROW'S THREE JOBS (ADR-0134 §5/§6) ────────────────────────────────────
  // The tap used to leave the app. It now means "show me where this is", so the way out
  // to Google is a control of its own — and both have to be reachable independently.
  it('the row body is a button that asks to be shown, not a link out', () => {
    const r = result('g-1', 'Blue Bottle', 'Shinjuku');
    view({ predictions: [r] });
    const body = document.querySelector('.map-res-open') as HTMLElement;
    expect(body.tagName).toBe('BUTTON');
    fireEvent.click(body);
    expect(onShow).toHaveBeenCalledWith(r);
  });

  it('Google is its own control, and it still vets the candidate for free', () => {
    view({ predictions: [result('g-1', 'Blue Bottle')] });
    const out = screen.getByRole('link', { name: t.map.research.openInGoogle });
    // ADR-0115 §2's "vet it before we spend on resolving it" survives as this control.
    expect(out.getAttribute('href')).toContain('query_place_id=g-1');
    expect(out.getAttribute('target')).toBe('_blank');
    // It is inside the actions, not wrapping the row — otherwise the tap could not mean
    // anything else.
    expect(out.closest('.map-right')).toBeTruthy();
    expect(out.querySelector('.map-name')).toBeNull();
  });

  it('a result says its name and address, and nothing it does not have', () => {
    view({ predictions: [result('g-1', 'teamLab Borderless', 'Azabudai Hills, Tokyo')] });
    expect(screen.getByText('teamLab Borderless')).toBeTruthy();
    expect(screen.getByText('Azabudai Hills, Tokyo')).toBeTruthy();
    // No ★ (a higher-tier field this mask does not buy, ADR-0111) and no distance —
    // ADR-0115 §2, unchanged by the SKU switch.
    expect(document.body.textContent).not.toContain('★');
    expect(document.querySelector('.map-dist')).toBeNull();
    // The name is no longer the link — that moved to its own control (see above), so the
    // only `<a>` in the row is the way out and it is not the name.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link').textContent).not.toContain('teamLab');
  });

  it('＋ אולי hands the whole result up, because the screen owns the add now', () => {
    const r = result('g-1', 'teamLab Borderless');
    view({ predictions: [r] });
    fireEvent.click(
      screen.getByRole('button', { name: t.map.research.addAria('teamLab Borderless') }),
    );
    expect(onAdd).toHaveBeenCalledWith(r);
  });

  // With an errand live the verb CHANGES rather than being joined (ADR-0134 §3): one
  // place, assigned to the form that asked, and no shelf item.
  it('under an errand the verb is choose, not shelve', () => {
    const r = result('g-1', 'Blue Bottle');
    view({ predictions: [r], chooseMode: true });
    expect(
      screen.queryByRole('button', { name: t.map.research.addAria('Blue Bottle') }),
    ).toBeNull();
    const choose = screen.getByRole('button', { name: t.map.errand.chooseAria('Blue Bottle') });
    expect(choose.textContent).toBe(t.map.errand.choose);
    fireEvent.click(choose);
    expect(onAdd).toHaveBeenCalledWith(r);
  });

  it('a result mid-add is disabled, so a double tap cannot buy it twice', () => {
    view({ predictions: [result('g-1', 'teamLab Borderless')], addingId: 'g-1' });
    expect(
      screen.getByRole('button', { name: t.map.research.addAria('teamLab Borderless') }),
    ).toHaveProperty('disabled', true);
  });

  // A ring tap selects its row (ADR-0132 §8), so the row has to carry both the selection
  // and the hook the canvas scrolls it into view by.
  it('the selected result is marked, and every row is addressable by its Google id', () => {
    view({ predictions: [result('g-1', 'A'), result('g-2', 'B')], selectedId: 'g-2' });
    expect(document.querySelector('[data-result="g-1"]')!.className).not.toContain('selected');
    expect(document.querySelector('[data-result="g-2"]')!.className).toContain('selected');
  });

  // ONE PLACE, ONE ROW, AND IT IS OURS (owner, session 168). This half used to render a
  // result the trip owns as a row saying `כבר בטיול` — which was, when the trip half had not
  // matched the text Google matched, the ONLY row for a place you already have: Google's
  // version of your own place. The trip's own row now covers it (`ownedResults` in
  // `Map.tsx`), carrying its day, its time and its references, so this half drops it.
  it('a result the trip already owns is not rendered here at all', () => {
    view({
      predictions: [result('g-p1', 'teamLab Planets'), result('g-2', 'Afuri Ramen')],
      referenced: { 'g-p1': place('p1') },
    });
    expect(document.querySelector('[data-result="g-p1"]')).toBeNull();
    // …and the rest of the results are untouched, which is what makes this a filter rather
    // than an empty state.
    expect(document.querySelector('[data-result="g-2"]')).toBeTruthy();
  });

  // ── THE DECIDING CARD (ADR-0166 §17, ADR-0167 §9.1) ──────────────────────────
  // The picture and the summary belong to the row being ASKED ABOUT, exactly as a trip row's
  // summary is selection-gated — and for the same reason: the list can hold ten answers and nine
  // of them are not the question.
  it('shows what we know on the selected row, and on no other', () => {
    const image = { url: '/enrichment/images/enr_1' } as DeliveredImageValue;
    view({
      predictions: [result('g-1', 'A'), result('g-2', 'Tokyo Skytree')],
      selectedId: 'g-2',
      selectedKnowledge: { image, summary: { text: 'A tower in Sumida.', lang: 'en' } },
    });
    const selected = document.querySelector('[data-result="g-2"]')!;
    expect(selected.querySelector('.map-hero img')!.getAttribute('src')).toBe(image.url);
    expect(selected.querySelector('.map-sum')!.className).toContain('is-decide');
    expect(document.querySelector('[data-result="g-1"]')!.querySelector('.map-sum')).toBeNull();
  });

  it('is the row it always was for a result the sources cannot describe', () => {
    view({ predictions: [result('g-1', 'Fuunji', 'Shinjuku')], selectedId: 'g-1' });
    // The majority case (ADR-0166 §11.3), and a complete state rather than an empty one.
    expect(document.querySelector('.map-hero')).toBeNull();
    expect(document.querySelector('.map-sum')).toBeNull();
    expect(screen.getByText('Fuunji')).toBeTruthy();
  });

  it('offline the Google half is absent, not disabled', () => {
    view({ predictions: [result('g-1', 'teamLab')], offline: true });
    expect(screen.queryByText(t.map.research.googleGroup)).toBeNull();
    expect(screen.getByText(t.map.research.offline)).toBeTruthy();
  });

  it('a rate limit is a soft banner, not an error', () => {
    view({ predictions: [result('g-1', 'teamLab Borderless')], rateLimited: true });
    expect(screen.getByText(t.placePicker.rateLimited)).toBeTruthy();
    expect(screen.getByText('teamLab Borderless')).toBeTruthy();
  });

  // ONE LIST, ONE EMPTINESS (owner, session 164). This component no longer answers for
  // itself: it had its own group header, its own empty state and its own below-the-floor
  // hint, and the result was `לא נמצאו מקומות` in bold above three Google results. The
  // screen now owns emptiness over the MERGED list, so what is asserted here is that this
  // half stays quiet.
  it('says nothing of its own about emptiness — no header, no empty state, no hint', () => {
    view({ active: false });
    expect(screen.queryByText(t.map.research.googleGroup)).toBeNull();
    expect(screen.queryByText(t.map.research.noResults)).toBeNull();
    expect(document.querySelector('.map-res-hint')).toBeNull();
  });

  it('with nothing to show it renders only its cost footer', () => {
    view({});
    expect(screen.queryByText(t.map.research.noResults)).toBeNull();
    expect(screen.getByText(t.placePicker.costFooter)).toBeTruthy();
  });
});
