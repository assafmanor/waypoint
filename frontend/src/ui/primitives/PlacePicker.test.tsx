// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { wrapNav } from '../../test/nav-harness';
import type { Place } from '@waypoint/shared';

// THE SHEET'S TESTS WENT WITH THE SHEET (ADR-0134 §9). This file used to drive a whole
// search surface through the field — the debounce, the resolve, the `בטיול` half, the
// min-chars floor, the name-only fallback — because the field owned one. It doesn't: the
// Map tab does, and `Map.test.tsx` + `lib/usePlaceSearch.test.ts` are where each of those
// is asserted now. What is left here is what is left of the component: a display and a
// launcher.
let places: Place[] = [];
vi.mock('../../state/trip-state', () => ({
  useTrip: () => ({ places }),
}));

import { PlacePicker } from './PlacePicker';
import { t } from '../../i18n/he';

describe('PlacePicker', () => {
  beforeEach(() => {
    places = [];
  });
  afterEach(() => cleanup());

  it('shows the placeholder when empty and the place name when filled', () => {
    places = [{ id: 'pl1', name: 'Shibuya Crossing' } as Place];
    const { rerender } = render(
      wrapNav(<PlacePicker onChange={() => {}} onFind={() => {}} placeholder="pick" />),
    );
    expect(screen.getByText('pick')).toBeTruthy();
    rerender(
      wrapNav(<PlacePicker value="pl1" onChange={() => {}} onFind={() => {}} placeholder="pick" />),
    );
    expect(screen.getByText('Shibuya Crossing')).toBeTruthy();
  });

  it('the trigger sends the errand — it does not open anything here', () => {
    const onFind = vi.fn();
    render(wrapNav(<PlacePicker onChange={() => {}} onFind={onFind} />));
    fireEvent.click(screen.getByRole('button', { name: t.placePicker.open }));
    expect(onFind).toHaveBeenCalledTimes(1);
    // The assertion that keeps the retirement honest: no sheet, no dialog, nothing over
    // the form. A second search surface reappearing here is exactly what §9 removed.
    expect(document.querySelector('.wp-modal')).toBeNull();
  });

  it('clearing the place is not an errand — it edits the field in place', () => {
    places = [{ id: 'pl1', name: 'Shibuya Crossing' } as Place];
    const onChange = vi.fn();
    const onFind = vi.fn();
    render(wrapNav(<PlacePicker value="pl1" onChange={onChange} onFind={onFind} />));
    fireEvent.click(screen.getByRole('button', { name: t.placePicker.clear }));
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(onFind).not.toHaveBeenCalled();
  });
});
