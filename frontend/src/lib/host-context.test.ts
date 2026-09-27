// ADR-0172's derivation, which is the whole of #24: everything else in that ADR is a call
// site. The cases below are the owner's four rules plus the one that kills the feature if
// it is got wrong (§3's authority rule), stated as tests rather than as prose.
import { describe, expect, it } from 'vitest';
import type { Booking, TripEvent } from '@waypoint/shared';
import { buildHostContextIndex, resolveHostContext, type HostRef } from './host-context';

const ev = (id: string, over: Partial<TripEvent> = {}) =>
  ({ id, bookingId: undefined, placeId: undefined, ...over }) as TripEvent;
const bk = (id: string, over: Partial<Booking> = {}) =>
  ({ id, placeId: undefined, fromPlaceId: undefined, toPlaceId: undefined, ...over }) as Booking;

const index = (events: TripEvent[], bookings: Booking[]) => buildHostContextIndex(events, bookings);
const resolve = (i: ReturnType<typeof index>, host: HostRef) => resolveHostContext(i, host);
const keys = (refs: HostRef[]) => refs.map((r) => `${r.kind}:${r.id}`).sort();

describe('a linked pair is one context', () => {
  const events = [ev('e1', { bookingId: 'b1' })];
  const bookings = [bk('b1')];

  it('resolves to the same members from either side', () => {
    const i = index(events, bookings);
    expect(keys(resolve(i, { kind: 'event', id: 'e1' }).members)).toEqual([
      'booking:b1',
      'event:e1',
    ]);
    expect(keys(resolve(i, { kind: 'booking', id: 'b1' }).members)).toEqual([
      'booking:b1',
      'event:e1',
    ]);
  });

  // Forced rather than chosen: ADR-0093 materializes the derived event server-side, so at
  // booking-save time there is no client-held event id to write a note to.
  it('anchors on the BOOKING from either side', () => {
    const i = index(events, bookings);
    expect(resolve(i, { kind: 'event', id: 'e1' }).anchor).toEqual({ kind: 'booking', id: 'b1' });
    expect(resolve(i, { kind: 'booking', id: 'b1' }).anchor).toEqual({ kind: 'booking', id: 'b1' });
  });

  it('leaves an unlinked event, a bookingless booking and an idea as contexts of one', () => {
    const i = index([ev('e2')], [bk('b2')]);
    for (const host of [
      { kind: 'event', id: 'e2' },
      { kind: 'booking', id: 'b2' },
      { kind: 'maybeItem', id: 'm1' },
      { kind: 'document', id: 'd1' },
    ] as HostRef[]) {
      const context = resolve(i, host);
      expect(context.members).toEqual([host]);
      expect(context.anchor).toEqual(host);
    }
  });
});

describe('a place inherits its ONE relevant context', () => {
  it('inherits when a single booking references it, and writes land on that booking', () => {
    const i = index([], [bk('b1', { placeId: 'p1' })]);
    const context = resolve(i, { kind: 'place', id: 'p1' });
    expect(keys(context.members)).toEqual(['booking:b1', 'place:p1']);
    expect(context.anchor).toEqual({ kind: 'booking', id: 'b1' });
  });

  // **§3's authority rule, and the case that kills the feature if it is missed.** A linked
  // event's `placeId` is not authoritative (ADR-0048) — its booking's is. Counted naively,
  // a hotel and the event it backs are two references to one place, so NO place is ever
  // unique and nothing ever inherits.
  it('counts a booking and the event it backs as ONE reference, not two', () => {
    const i = index([ev('e1', { bookingId: 'b1', placeId: 'p1' })], [bk('b1', { placeId: 'p1' })]);
    expect(resolve(i, { kind: 'place', id: 'p1' }).anchor).toEqual({ kind: 'booking', id: 'b1' });
  });

  it('counts a transport booking whose origin and destination are the same place once', () => {
    const i = index([], [bk('b1', { fromPlaceId: 'p1', toPlaceId: 'p1' })]);
    expect(resolve(i, { kind: 'place', id: 'p1' }).anchor).toEqual({ kind: 'booking', id: 'b1' });
  });

  // Owner's call: a stray "maybe we eat here" must not silently hide a restaurant's notes,
  // with no cause visible on the surface the reader is looking at.
  it('ignores ideas, which are not a Booking/Event context', () => {
    // The index is built from events and bookings only — a `MaybeItem.placeId` never reaches
    // it, so an idea cannot make a place ambiguous however many point at it.
    const i = index([], [bk('b1', { placeId: 'p1' })]);
    expect(resolve(i, { kind: 'place', id: 'p1' }).anchor).toEqual({ kind: 'booking', id: 'b1' });
  });

  it('falls back to its own notes when two contexts reference it', () => {
    const i = index([], [bk('b1', { placeId: 'p1' }), bk('b2', { placeId: 'p1' })]);
    const context = resolve(i, { kind: 'place', id: 'p1' });
    expect(context.members).toEqual([{ kind: 'place', id: 'p1' }]);
    expect(context.anchor).toEqual({ kind: 'place', id: 'p1' });
  });

  it('falls back when nothing references it at all', () => {
    const context = resolve(index([], []), { kind: 'place', id: 'p1' });
    expect(context.anchor).toEqual({ kind: 'place', id: 'p1' });
  });

  it('inherits through the pair, so a uniquely-referenced place reaches both halves', () => {
    const i = index([ev('e1', { bookingId: 'b1' })], [bk('b1', { placeId: 'p1' })]);
    expect(keys(resolve(i, { kind: 'place', id: 'p1' }).members)).toEqual([
      'booking:b1',
      'event:e1',
      'place:p1',
    ]);
  });

  // **The non-leak rule, and the point is that it needs no mechanism.** A note typed while
  // the place was unique went to the booking; when a second booking appears the place stops
  // resolving, and the row has not moved, so it cannot show up in the new use.
  it('stops inheriting the moment a second context appears, without moving anything', () => {
    const unique = index([], [bk('b1', { placeId: 'p1' })]);
    expect(resolve(unique, { kind: 'place', id: 'p1' }).anchor).toEqual({
      kind: 'booking',
      id: 'b1',
    });

    const reused = index([], [bk('b1', { placeId: 'p1' }), bk('b2', { placeId: 'p1' })]);
    const after = resolve(reused, { kind: 'place', id: 'p1' });
    expect(after.members).toEqual([{ kind: 'place', id: 'p1' }]);
    // b1 still holds the note; the place simply no longer reads it, and b2 never can — b2
    // reads only the place's OWN rows, never b1's.
    expect(keys(resolve(reused, { kind: 'booking', id: 'b1' }).members)).toEqual([
      'booking:b1',
      'place:p1',
    ]);
    expect(keys(resolve(reused, { kind: 'booking', id: 'b2' }).members)).toEqual([
      'booking:b2',
      'place:p1',
    ]);
  });
});

describe("a place's own notes read on every use of it", () => {
  // ADR-0172 §3's 2026-09-27 amendment (owner's report): notes written on a place from the Map
  // did not show on the event later made there. The place is a display member of each use,
  // never its anchor.
  it('puts the place in an unlinked event context, anchored on the event', () => {
    const i = index([ev('e1', { placeId: 'p1' })], []);
    const context = resolve(i, { kind: 'event', id: 'e1' });
    expect(keys(context.members)).toEqual(['event:e1', 'place:p1']);
    expect(context.anchor).toEqual({ kind: 'event', id: 'e1' });
  });

  it('reads a linked pair through the booking place, never the event column', () => {
    const i = index(
      [ev('e1', { bookingId: 'b1', placeId: 'p-stale' })],
      [bk('b1', { placeId: 'p1' })],
    );
    for (const host of [
      { kind: 'booking', id: 'b1' },
      { kind: 'event', id: 'e1' },
    ] as HostRef[]) {
      const context = resolve(i, host);
      expect(keys(context.members)).toEqual(['booking:b1', 'event:e1', 'place:p1']);
      expect(context.anchor).toEqual({ kind: 'booking', id: 'b1' });
    }
  });

  it('reads the place on every use, however many there are', () => {
    const i = index([ev('e1', { placeId: 'p1' }), ev('e2', { placeId: 'p1' })], []);
    expect(keys(resolve(i, { kind: 'event', id: 'e1' }).members)).toEqual(['event:e1', 'place:p1']);
    expect(keys(resolve(i, { kind: 'event', id: 'e2' }).members)).toEqual(['event:e2', 'place:p1']);
  });

  it('puts the place in an idea context without counting the idea as a use', () => {
    const i = buildHostContextIndex(
      [],
      [bk('b1', { placeId: 'p1' })],
      [{ id: 'm1', placeId: 'p1' }],
    );
    expect(keys(resolve(i, { kind: 'maybeItem', id: 'm1' }).members)).toEqual([
      'maybeItem:m1',
      'place:p1',
    ]);
    expect(resolve(i, { kind: 'place', id: 'p1' }).anchor).toEqual({ kind: 'booking', id: 'b1' });
  });

  it('never lists the place twice, nor another place through an inherited transport leg', () => {
    const i = index([], [bk('b1', { fromPlaceId: 'p1', toPlaceId: 'p2' })]);
    expect(keys(resolve(i, { kind: 'booking', id: 'b1' }).members)).toEqual([
      'booking:b1',
      'place:p1',
      'place:p2',
    ]);
    expect(keys(resolve(i, { kind: 'place', id: 'p1' }).members)).toEqual([
      'booking:b1',
      'place:p1',
    ]);
  });
});
