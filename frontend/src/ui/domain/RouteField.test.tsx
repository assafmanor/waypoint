// @vitest-environment jsdom
// RouteField (ADR-0154 §3). The two things worth pinning are the ones that were WRONG
// before it existed: which end an errand names (a route has two, and naming the wrong one
// puts the right place on the wrong side of the journey — ADR-0134 §2), and the swap,
// which is the whole reason the origin may be guessed at all.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const PLACES = [
  { id: 'p-tlv', tripId: 't1', name: 'נתב״ג' },
  { id: 'p-nrt', tripId: 't1', name: 'נריטה' },
];
vi.mock('../../state/trip-state', () => ({
  useTrip: () => ({
    trip: { id: 't1', timezone: 'Asia/Jerusalem', startDate: '2026-08-15', endDate: '2026-08-20' },
    zoneCrossings: [],
    users: [],
    // Tasks ride the same snapshot since phase 1; the mark and the sections read them.
    tasks: [],
    taskVerbs: {
      createTask: async () => undefined,
      updateTask: async () => {},
      deleteTask: async () => {},
      tickTask: async () => {},
    },
    places: PLACES,
  }),
}));

import { RouteField } from './RouteField';
import { t } from '../../i18n/he';

const origin = () => screen.getByRole('button', { name: t.index.form.originLabel });
const dest = () => screen.getByRole('button', { name: t.index.form.destLabel });
const swap = () => screen.queryByRole('button', { name: new RegExp(t.index.form.swapRoute) });

describe('RouteField', () => {
  afterEach(cleanup);

  it('shows each end by name, origin before destination', () => {
    render(<RouteField from="p-tlv" to="p-nrt" onChange={vi.fn()} onFind={vi.fn()} />);
    expect(origin().textContent).toContain('נתב״ג');
    expect(dest().textContent).toContain('נריטה');
  });

  // Without a per-end field the errand channel cannot know which side it answered, which
  // is precisely why `PlaceErrandFormTarget.field` is not optional.
  it('names the end an errand is for, per end', () => {
    const onFind = vi.fn();
    render(<RouteField onChange={vi.fn()} onFind={onFind} />);
    fireEvent.click(origin());
    expect(onFind).toHaveBeenLastCalledWith('fromPlaceId', t.index.form.originLabel);
    fireEvent.click(dest());
    expect(onFind).toHaveBeenLastCalledWith('toPlaceId', t.index.form.destLabel);
  });

  it('swaps both ends in one change, so a reversed route is one tap', () => {
    const onChange = vi.fn();
    render(<RouteField from="p-tlv" to="p-nrt" onChange={onChange} onFind={vi.fn()} />);
    fireEvent.click(swap()!);
    expect(onChange).toHaveBeenCalledWith({ from: 'p-nrt', to: 'p-tlv' });
  });

  // The case the swap exists for: one place, and the form cannot say which end it is.
  it('still swaps with only one end filled — that is the case it exists for', () => {
    const onChange = vi.fn();
    render(<RouteField from="p-tlv" onChange={onChange} onFind={vi.fn()} />);
    fireEvent.click(swap()!);
    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: 'p-tlv' });
  });

  // Absent, not disabled: a swap over two empty slots is a control that cannot act, and
  // ADR-0150 §8's rule is that a dead control should not be shown as a live one.
  it('offers no swap when there is nothing to exchange', () => {
    render(<RouteField onChange={vi.fn()} onFind={vi.fn()} />);
    expect(swap()).toBeNull();
  });

  it('changing one end leaves the other alone', () => {
    const onChange = vi.fn();
    render(<RouteField from="p-tlv" to="p-nrt" onChange={onChange} onFind={vi.fn()} />);
    // The clear ✕ inside the origin picker is the only value-change this component can
    // drive without an errand.
    fireEvent.click(screen.getAllByRole('button', { name: t.placePicker.clear })[0]);
    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: 'p-nrt' });
  });

  it('states the default note, and lets a host replace it', () => {
    const { unmount } = render(<RouteField onChange={vi.fn()} onFind={vi.fn()} />);
    expect(document.body.textContent).toContain(t.index.form.routeHint);
    unmount();
    render(
      <RouteField onChange={vi.fn()} onFind={vi.fn()} hint={t.index.form.routeHintOptional} />,
    );
    expect(document.body.textContent).toContain(t.index.form.routeHintOptional);
  });
});

// ── THE HIRE SHAPE (ADR-0163 §1) ───────────────────────────────────────────────
// Same two columns, a different question. What is worth pinning here is the state the
// DATA cannot express: "return it somewhere else, and I have not said where yet".
/** **The shipped defect ADR-0203 §4 fixes, and the spec that would have caught it.**
 *  A stop is removed through the picker's own ✕ (ADR-0159 §5: "clearing IS removing"), and
 *  that button used to render only when the row had a place — so a stop the `＋` had just
 *  added had no remove control, and its only other control is an errand that unmounts the
 *  sheet. The row was a dead end. */
describe('RouteField · a stop can always be removed (ADR-0203 §4)', () => {
  afterEach(cleanup);

  const withStops = (stops: (string | undefined)[], onStopsChange = vi.fn()) => {
    render(
      <RouteField
        from="p-tlv"
        to="p-nrt"
        onChange={vi.fn()}
        onFind={vi.fn()}
        stops={stops}
        onStopsChange={onStopsChange}
        onFindStop={vi.fn()}
      />,
    );
    return onStopsChange;
  };

  it('offers the remove on an EMPTY stop — the row that used to have no way out', () => {
    withStops([undefined]);
    const stop = document.querySelector('.place-picker-stop');
    expect(stop).not.toBeNull();
    expect(stop!.querySelector('.pp-clear')).not.toBeNull();
  });

  it('removes that empty stop rather than leaving it in the list', () => {
    const onStopsChange = withStops([undefined]);
    fireEvent.click(document.querySelector<HTMLElement>('.place-picker-stop .pp-clear')!);
    expect(onStopsChange).toHaveBeenCalledWith([]);
  });

  it('still removes a stop that HAS a place, which never regressed', () => {
    const onStopsChange = withStops(['p-nrt', undefined]);
    fireEvent.click(document.querySelector<HTMLElement>('.place-picker-stop .pp-clear')!);
    expect(onStopsChange).toHaveBeenCalledWith([undefined]);
  });

  it('names the control a REMOVE on a stop, and leaves an endpoint saying clear', () => {
    withStops([undefined]);
    // The endpoints are the same component and must not have been renamed with it.
    const labels = [...document.querySelectorAll('.pp-clear')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toContain('הסרת העצירה');
    expect(labels).toContain('הסרת המקום');
  });

  it('leaves an endpoint with no place showing no ✕ at all', () => {
    render(<RouteField onChange={vi.fn()} onFind={vi.fn()} />);
    expect(document.querySelector('.pp-clear')).toBeNull();
  });
});

describe('RouteField · shape="hire"', () => {
  afterEach(cleanup);

  const pickup = () => screen.getByRole('button', { name: t.index.form.pickupPlaceLabel });
  const dropoff = () => screen.queryByRole('button', { name: t.index.form.dropoffPlaceLabel });
  const sameChoice = () => screen.getByRole('radio', { name: t.index.form.returnSame });
  const otherChoice = () => screen.getByRole('radio', { name: t.index.form.returnElsewhere });

  const hire = (props: Partial<Parameters<typeof RouteField>[0]> = {}) =>
    render(<RouteField shape="hire" onChange={vi.fn()} onFind={vi.fn()} {...props} />);

  it('asks for a pick-up, and offers no return picker while it is the same counter', () => {
    hire({ from: 'p-nrt', to: 'p-nrt' });
    expect(pickup().textContent).toContain('נריטה');
    expect(sameChoice().getAttribute('aria-checked')).toBe('true');
    expect(dropoff()).toBeNull();
  });

  // A hire cannot reverse its ends — you do not return the car before collecting it.
  it('has no swap', () => {
    hire({ from: 'p-nrt', to: 'p-tlv' });
    expect(screen.queryByRole('button', { name: new RegExp(t.index.form.swapRoute) })).toBeNull();
  });

  it('opens on "elsewhere" when the two ends already differ', () => {
    hire({ from: 'p-nrt', to: 'p-tlv' });
    expect(otherChoice().getAttribute('aria-checked')).toBe('true');
    expect(dropoff()!.textContent).toContain('נתב״ג');
  });

  // **The reason the toggle is local state.** Choosing "elsewhere" clears the return, so a
  // toggle DERIVED from `to === from` would snap back to "same" on the next render and the
  // second picker would vanish under the finger that asked for it.
  it('keeps the return picker open after clearing it to choose a new place', () => {
    const onChange = vi.fn();
    hire({ from: 'p-nrt', to: 'p-nrt', onChange });
    fireEvent.click(otherChoice());
    expect(onChange).toHaveBeenCalledWith({ from: 'p-nrt', to: undefined });
    expect(dropoff()).toBeTruthy();
    expect(otherChoice().getAttribute('aria-checked')).toBe('true');
  });

  it('points the return back at the pick-up when the answer goes back to "same"', () => {
    const onChange = vi.fn();
    hire({ from: 'p-nrt', to: 'p-tlv', onChange });
    fireEvent.click(sameChoice());
    expect(onChange).toHaveBeenCalledWith({ from: 'p-nrt', to: 'p-nrt' });
    expect(dropoff()).toBeNull();
  });

  // While the ends are the same counter the return FOLLOWS the pick-up — otherwise a
  // corrected pick-up would silently leave the car being returned to the old place.
  it('moves the return with the pick-up while they are the same', () => {
    const onChange = vi.fn();
    hire({ from: 'p-nrt', to: 'p-nrt', onChange });
    fireEvent.click(screen.getAllByRole('button', { name: t.placePicker.clear })[0]);
    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: undefined });
  });

  it('names the right end for each errand', () => {
    const onFind = vi.fn();
    hire({ from: 'p-nrt', to: 'p-tlv', onFind });
    fireEvent.click(pickup());
    expect(onFind).toHaveBeenLastCalledWith('fromPlaceId', t.index.form.pickupPlaceLabel);
    fireEvent.click(dropoff()!);
    expect(onFind).toHaveBeenLastCalledWith('toPlaceId', t.index.form.dropoffPlaceLabel);
  });

  it('states no note — the return toggle already shows both options', () => {
    hire();
    expect(document.body.textContent).not.toContain(t.index.form.routeHint);
  });
});
