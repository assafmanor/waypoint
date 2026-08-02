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
vi.mock('../../state/trip-state', () => ({ useTrip: () => ({ places: PLACES }) }));

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
