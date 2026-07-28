// @vitest-environment jsdom
//
// The errand's RETURN leg (ADR-0134 §2). The channel itself is covered in
// `lib/handoff.test.ts`; what is asserted here is the property the five form hosts depend
// on and that shipped broken — a returning errand re-opens a form **once**.
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  MapScopeProvider,
  useMapScope,
  usePlaceErrandReturn,
  type PlaceErrandTarget,
} from './map-scope-state';

interface Draft {
  title: string;
}

const errandFor = (kind: PlaceErrandTarget['kind'], draft: Draft) => ({
  errand: {
    target: { kind, id: 'e1', field: 'placeId' as const },
    returnTo: '/trip/t1?tab=days',
    label: 'ארוחת ערב',
    draft,
  },
  placeId: 'pl-9',
});

/** A form host: it takes the return and records each application, and — like every real
 *  host — it re-renders on data of its own and passes a FRESH callback every render. */
function hostHook(kind: PlaceErrandTarget['kind'], applied: Draft[]) {
  return () => {
    const scope = useMapScope();
    usePlaceErrandReturn<Draft>(kind, (returned) => {
      if (returned.draft) applied.push(returned.draft);
    });
    return scope;
  };
}

describe('usePlaceErrandReturn', () => {
  const wrapper = MapScopeProvider;

  it('re-opens the form once, and not again when the host re-renders', () => {
    const applied: Draft[] = [];
    const { result, rerender } = renderHook(hostHook('event', applied), { wrapper });

    act(() => result.current.errandResult.hand(errandFor('event', { title: 'ארוחת ערב' })));
    expect(applied).toEqual([{ title: 'ארוחת ערב' }]);

    // THE BUG THIS EXISTS FOR (owner, session 166). The payload used to be reported as
    // STATE, so it stayed readable for the rest of the host's life while the effect that
    // applied it depended on `events`/`bookings` — which it must, to look the entity up.
    // Saving the re-opened form changed that list, the effect re-fired on the same payload,
    // the form re-opened on top of itself, and each save wrote another copy. A host
    // re-render is exactly that moment, and it must now do nothing at all.
    rerender();
    rerender();
    expect(applied).toHaveLength(1);
  });

  // The callback is an inline arrow at every call site, so it is a NEW function on every
  // render. Depending on it would re-fire forever — which is why it is read through a
  // latest-ref and the effect depends only on the channel.
  it('does not re-fire because the host passed a fresh callback', () => {
    const applied: Draft[] = [];
    let calls = 0;
    const { result, rerender } = renderHook(
      () => {
        const scope = useMapScope();
        usePlaceErrandReturn<Draft>('event', (returned) => {
          calls += 1;
          if (returned.draft) applied.push(returned.draft);
        });
        return scope;
      },
      { wrapper },
    );
    act(() => result.current.errandResult.hand(errandFor('event', { title: 'א' })));
    rerender();
    rerender();
    expect(calls).toBe(1);
  });

  // Two hosts can watch the channel at once without stealing each other's errand — the
  // event form and the booking sheet are both mounted on `PlanDay`.
  it('ignores a return for another entity kind, and leaves it for its own host', () => {
    const events: Draft[] = [];
    const bookings: Draft[] = [];
    const { result } = renderHook(
      () => {
        const scope = useMapScope();
        usePlaceErrandReturn<Draft>('event', (r) => {
          if (r.draft) events.push(r.draft);
        });
        usePlaceErrandReturn<Draft>('booking', (r) => {
          if (r.draft) bookings.push(r.draft);
        });
        return scope;
      },
      { wrapper },
    );
    act(() => result.current.errandResult.hand(errandFor('booking', { title: 'רכבת' })));
    expect(events).toEqual([]);
    expect(bookings).toEqual([{ title: 'רכבת' }]);
  });

  // The whole point of the draft: the chosen place lands in the NAMED field, so a transport
  // booking cannot assign the right place to the wrong side of the journey.
  it('reports the field the errand named, with the chosen place', () => {
    let seen: { field: string; placeId: string } | null = null;
    const { result } = renderHook(
      () => {
        const scope = useMapScope();
        usePlaceErrandReturn<Draft>('booking', (r) => {
          seen = { field: r.target.field, placeId: r.placeId };
        });
        return scope;
      },
      { wrapper },
    );
    act(() =>
      result.current.errandResult.hand({
        errand: {
          target: { kind: 'booking', id: 'b1', field: 'toPlaceId' },
          returnTo: '/',
          label: 'רכבת לקיוטו',
          draft: { title: 'רכבת' },
        },
        placeId: 'pl-3',
      }),
    );
    expect(seen).toEqual({ field: 'toPlaceId', placeId: 'pl-3' });
  });
});
