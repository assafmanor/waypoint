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
import { HOME_TAB } from './nav-state';

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
    usePlaceErrandReturn<Draft>(kind, 'days', (returned) => {
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
    // The place is already in the draft: the hook assigns it (see the field test below).
    expect(applied).toEqual([{ title: 'ארוחת ערב', placeId: 'pl-9' }]);

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
        usePlaceErrandReturn<Draft>('event', 'days', (returned) => {
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

  // A CANCEL RETURNS THE FORM TOO (owner, session 168: _"canceling a place pin doesn't
  // return to the event form"_). It shipped navigating back and handing nothing over, so the
  // host had nothing to re-open from and a half-typed event died on the way out — the exact
  // loss the draft exists to prevent, through the other exit. The draft comes back with
  // nothing assigned.
  it('returns the draft untouched when the errand was cancelled', () => {
    const applied: (Draft | null)[] = [];
    const { result } = renderHook(
      () => {
        const scope = useMapScope();
        usePlaceErrandReturn<Draft>('event', HOME_TAB, (r) => applied.push(r.draft));
        return scope;
      },
      { wrapper },
    );
    act(() =>
      result.current.errandResult.hand({
        errand: {
          target: { kind: 'event', field: 'placeId' },
          returnTo: '/',
          label: 'ארוחת ערב',
          draft: { title: 'ארוחת ערב' },
        },
        placeId: null,
      }),
    );
    // No `placeId` key at all — not a `placeId: null` the form would have to strip.
    expect(applied).toEqual([{ title: 'ארוחת ערב' }]);
  });

  // Two hosts can watch the channel at once without stealing each other's errand — the
  // event form and the booking sheet are both mounted on `PlanDay`.
  it('ignores a return for another entity kind, and leaves it for its own host', () => {
    const events: Draft[] = [];
    const bookings: Draft[] = [];
    const { result } = renderHook(
      () => {
        const scope = useMapScope();
        usePlaceErrandReturn<Draft>('event', 'days', (r) => {
          if (r.draft) events.push(r.draft);
        });
        usePlaceErrandReturn<Draft>('booking', 'days', (r) => {
          if (r.draft) bookings.push(r.draft);
        });
        return scope;
      },
      { wrapper },
    );
    act(() => result.current.errandResult.hand(errandFor('booking', { title: 'רכבת' })));
    expect(events).toEqual([]);
    expect(bookings).toEqual([{ title: 'רכבת', placeId: 'pl-9' }]);
  });

  // **TWO HOSTS OF THE SAME KIND, AND THE ONE THAT ANSWERS IS THE ONE THE ERRAND CAME FROM**
  // (owner, session 174: _"I'm still not getting back to the draft"_ — the fifth report of the
  // same sentence, and the first one with a cause).
  //
  // The Map hosts a booking sheet itself, so it watches this channel for kind `booking` too.
  // It is also the surface that HANDS the answer over, and it is still mounted for that
  // render: `hand()` and `navigate()` land in one React batch. So the Map's own effect re-ran,
  // took the result meant for the Index, applied it to state that was about to be thrown away,
  // and unmounted. The Index then mounted to an empty channel. From outside: the right screen,
  // no form.
  //
  // The location is set to the DESTINATION here on purpose — that is the state the thief's
  // effect actually runs in, and it is why no filter read off the URL can tell the two apart.
  it('delivers to the host on the errand\u2019s own tab, not to a thief on another', () => {
    window.history.replaceState(null, '', '/?tab=index');
    const onMap: Draft[] = [];
    const onIndex: Draft[] = [];
    const { result } = renderHook(
      () => {
        const scope = useMapScope();
        usePlaceErrandReturn<Draft>('booking', 'map', (r) => {
          if (r.draft) onMap.push(r.draft);
        });
        usePlaceErrandReturn<Draft>('booking', 'index', (r) => {
          if (r.draft) onIndex.push(r.draft);
        });
        return scope;
      },
      { wrapper },
    );
    act(() =>
      result.current.errandResult.hand({
        errand: {
          target: { kind: 'booking', id: 'bk1', field: 'placeId' },
          // What `withBookingFormReturn` produces: the destination's own params ride along,
          // so the match is on the TAB rather than the whole path.
          returnTo: '/?tab=index&focus=bookings',
          label: 'מלון',
          draft: { title: 'מלון' },
        },
        placeId: 'pl-9',
      }),
    );
    expect(onMap).toEqual([]);
    expect(onIndex).toEqual([{ title: 'מלון', placeId: 'pl-9' }]);
  });

  // The whole point of the draft: the chosen place lands in the NAMED field, so a transport
  // booking cannot assign the right place to the wrong side of the journey. The assignment
  // happens in the HOOK now (session 168) rather than at each of five hosts — the same
  // expression written five times is one host away from writing it differently.
  it('assigns the chosen place to the field the errand named', () => {
    let seen: { field: string; placeId: string | null; draft: Draft | null } | null = null;
    const { result } = renderHook(
      () => {
        const scope = useMapScope();
        usePlaceErrandReturn<Draft>('booking', HOME_TAB, (r) => {
          seen = { field: r.target.field, placeId: r.placeId, draft: r.draft };
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
    expect(seen).toEqual({
      field: 'toPlaceId',
      placeId: 'pl-3',
      draft: { title: 'רכבת', toPlaceId: 'pl-3' },
    });
  });
});
