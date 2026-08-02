import { describe, expect, it } from 'vitest';
import { noteHostTarget } from './note-host-target';
import type { NoteHostRef } from './notes';

const TODAY = '2026-07-20';
const host = (over: Partial<NoteHostRef> & Pick<NoteHostRef, 'kind'>): NoteHostRef => ({
  id: 'h1',
  name: 'המארח',
  ...over,
});

describe('noteHostTarget', () => {
  it('sends a booking to the Index, with the id that opens its detail', () => {
    expect(noteHostTarget(host({ kind: 'booking', id: 'bk-1' }), TODAY)).toBe(
      '/?tab=index&booking=bk-1',
    );
  });

  it('sends a document to the Index, with the id that opens its viewer', () => {
    expect(noteHostTarget(host({ kind: 'document', id: 'doc-1' }), TODAY)).toBe(
      '/?tab=index&doc=doc-1',
    );
  });

  // The day comes first: you cannot open a card without being on its day.
  it('sends an event to its own day, then names the card', () => {
    expect(noteHostTarget(host({ kind: 'event', id: 'ev-1', date: '2026-07-22' }), TODAY)).toBe(
      '/?tab=days&day=2026-07-22&event=ev-1',
    );
  });

  // `?day=` is omitted when the day IS today — the same rule `daySelectTarget` follows, so a
  // URL never carries a day it did not need to.
  it('omits the day when the host is on today', () => {
    expect(noteHostTarget(host({ kind: 'event', id: 'ev-1', date: TODAY }), TODAY)).toBe(
      '/?tab=days&event=ev-1',
    );
  });

  it('sends an idea to the day it is pencilled in on', () => {
    expect(noteHostTarget(host({ kind: 'maybeItem', id: 'm-1', date: '2026-07-23' }), TODAY)).toBe(
      '/?tab=days&day=2026-07-23&idea=m-1',
    );
  });

  // A someday idea lives in the pool rather than on a day: the shelf can be reached, but not
  // the one tile, so the way in is ABSENT rather than approximate.
  it('has nowhere to send a someday idea', () => {
    expect(noteHostTarget(host({ kind: 'maybeItem', id: 'm-1' }), TODAY)).toBeNull();
  });

  // A place's way in is the Map's focus channel, not a URL — the caller routes that case.
  it('leaves a place to the Map', () => {
    expect(noteHostTarget(host({ kind: 'place', id: 'pl-1' }), TODAY)).toBeNull();
  });
});
