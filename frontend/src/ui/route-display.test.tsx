// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { routeDisplay } from './route-display';
import { ROUTE_INLINE_MAX_CHARS } from '../constants';
import { t } from '../i18n/he';

const TLV = 'נמל התעופה בן גוריון'; // → בן גוריון (9)
const KEF = 'נמל התעופה הבינלאומי קפלאוויק'; // → קפלאוויק (8)

/** Renders the two slots the way a day row consumes them. */
function show(route: Parameters<typeof routeDisplay>[0]) {
  const { title, meta } = routeDisplay(route);
  const { container } = render(<div>{title}</div>);
  return { container, meta };
}

describe('routeDisplay', () => {
  afterEach(() => cleanup());

  it('gives no slots for a non-transport event, so the row keeps its own title', () => {
    expect(routeDisplay(null)).toEqual({});
  });

  it('keeps the inline route with SHORTENED names, full destination as meta', () => {
    const { container, meta } = show({ from: TLV, to: KEF });
    // 9 + 8 = 17 chars — comfortably inline.
    expect(container.querySelector('.route')!.textContent).toBe('בן גוריוןקפלאוויק');
    expect(container.querySelector('.arr svg')).not.toBeNull();
    // Nothing is lost: the meta carries the destination's full official name, and
    // no longer repeats the origin.
    expect(meta).toBe(KEF);
  });

  it('goes destination-primary once the shortened pair passes the threshold', () => {
    // Two names that survive shortening and together exceed the budget.
    const from = 'א'.repeat(ROUTE_INLINE_MAX_CHARS);
    const to = 'ב'.repeat(ROUTE_INLINE_MAX_CHARS);
    const { container, meta } = show({ from, to });
    expect(container.querySelector('.route')).toBeNull();
    expect(container.textContent).toBe(to);
    expect(meta).toBe(t.event.routeFrom(from));
  });

  it('is decided purely by the names — the SAME route resolves the same everywhere', () => {
    // The point of the threshold: no measurement, so Trip mode and the Plan
    // builder (which has less room) cannot disagree about the same flight.
    const a = routeDisplay({ from: TLV, to: KEF });
    const b = routeDisplay({ from: TLV, to: KEF });
    expect(a.meta).toBe(b.meta);
    // Same branch both times: either both inline or both not.
    expect(Boolean(a.title)).toBe(Boolean(b.title));
    expect(JSON.stringify(a.title)).toBe(JSON.stringify(b.title));
  });

  it('keeps a one-ended route on the title even when it is long', () => {
    // No destination → moving the origin to the meta would leave the title empty.
    const from = 'א'.repeat(ROUTE_INLINE_MAX_CHARS + 5);
    const { container, meta } = show({ from });
    expect(container.textContent).toBe(from);
    expect(meta).toBeUndefined();
  });

  it('never truncates — neither slot carries an ellipsis', () => {
    const { container, meta } = show({
      from: 'א'.repeat(ROUTE_INLINE_MAX_CHARS),
      to: 'ב'.repeat(ROUTE_INLINE_MAX_CHARS),
    });
    expect(container.textContent).not.toContain('…');
    expect(meta ?? '').not.toContain('…');
  });
});
